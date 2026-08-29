import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

/**
 * Salary changes are decided now and take effect on the 2nd of the month.
 *
 * Payroll runs on the 1st. A rise entered on the 20th used to apply at once, so
 * that run paid the new figure for a month worked at the old one — a backdated
 * rise nobody decided to give. Deferring to the 2nd puts the change safely the
 * far side of payday.
 *
 * Nothing here writes to staff_salaries, so payroll, the bonus pot and the
 * person's own profile all keep showing what they are actually being paid until
 * the day it lands.
 *
 * The person is emailed straight away though — unlike a rating, there is
 * nothing to be gained by keeping a pay change quiet until it takes effect, and
 * plenty lost if they hear about it from a payslip.
 */

export interface PendingSalaryChange {
  id: string;
  user_id: string;
  previous_salary: number | null;
  previous_currency: string | null;
  new_salary: number;
  new_currency: string;
  reason: string | null;
  effective_date: string;
  created_at: string;
}

/**
 * The next 2nd of a month, strictly after today.
 *
 * The 2nd rather than the 1st because the 1st is payday, and a change landing
 * that morning could still catch the run. Strictly after today so one entered
 * on the 2nd waits for next month rather than applying as it is typed.
 *
 * Mirrors next_salary_effective_date() in the database, which is what the
 * scheduled job actually goes by.
 */
export function nextSalaryEffectiveDate(from: Date = new Date()): Date {
  if (from.getDate() < 2) return new Date(from.getFullYear(), from.getMonth(), 2);
  return new Date(from.getFullYear(), from.getMonth() + 1, 2);
}

/** "2 October 2026" — for telling an admin, and the staff member, when it lands. */
export function describeSalaryEffectiveDate(d: Date): string {
  return format(d, "d MMMM yyyy");
}

export async function fetchPendingSalaryChange(userId: string): Promise<PendingSalaryChange | null> {
  const { data, error } = await supabase
    .from("pending_salary_changes")
    .select("id, user_id, previous_salary, previous_currency, new_salary, new_currency, reason, effective_date, created_at")
    .eq("user_id", userId)
    .is("applied_at", null)
    .is("cancelled_at", null)
    .maybeSingle();
  if (error) throw error;
  return (data as PendingSalaryChange) ?? null;
}

/**
 * Record a salary change for the 2nd, and tell the person about it now.
 *
 * Replaces any change already waiting for them, so a second thought during the
 * month supersedes the first rather than queueing two rises.
 */
export async function scheduleSalaryChange(opts: {
  userId: string;
  previousSalary: number | null;
  previousCurrency: string | null;
  newSalary: number;
  newCurrency: string;
  reason?: string | null;
  createdBy?: string | null;
  recipientEmail?: string | null;
  recipientName?: string | null;
}): Promise<{ effectiveDate: Date; notified: boolean }> {
  const effective = nextSalaryEffectiveDate();
  const effectiveIso = format(effective, "yyyy-MM-dd");

  const { error: clearError } = await supabase
    .from("pending_salary_changes")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: opts.createdBy ?? null })
    .eq("user_id", opts.userId)
    .is("applied_at", null)
    .is("cancelled_at", null);
  if (clearError) throw clearError;

  const { error } = await supabase.from("pending_salary_changes").insert({
    user_id: opts.userId,
    previous_salary: opts.previousSalary,
    previous_currency: opts.previousCurrency,
    new_salary: opts.newSalary,
    new_currency: opts.newCurrency,
    reason: opts.reason?.trim() || null,
    effective_date: effectiveIso,
    created_by: opts.createdBy ?? null,
  });
  if (error) throw error;

  // Best effort: the change is recorded either way, and a failed email is
  // reported to the admins by the function itself rather than lost here.
  let notified = false;
  if (opts.recipientEmail) {
    try {
      await supabase.functions.invoke("send-salary-change-email", {
        body: {
          recipientEmail: opts.recipientEmail,
          recipientName: opts.recipientName,
          previousSalary: opts.previousSalary,
          previousCurrency: opts.previousCurrency,
          newSalary: opts.newSalary,
          newCurrency: opts.newCurrency,
          effectiveDate: effectiveIso,
          reason: opts.reason?.trim() || null,
        },
      });
      await supabase
        .from("pending_salary_changes")
        .update({ notified_at: new Date().toISOString() })
        .eq("user_id", opts.userId)
        .is("applied_at", null)
        .is("cancelled_at", null);
      notified = true;
    } catch {
      notified = false;
    }
  }

  return { effectiveDate: effective, notified };
}

/** Withdraw a change that has not landed yet. */
export async function cancelPendingSalaryChange(id: string, byUserId?: string | null): Promise<void> {
  const { error } = await supabase
    .from("pending_salary_changes")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: byUserId ?? null })
    .eq("id", id)
    .is("applied_at", null);
  if (error) throw error;
}
