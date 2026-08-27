import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { RANK_ORDER, bonusPoints, bonusTenureYears, employedFraction, type Rank } from "@/components/hr/PerformanceRankBadge";

export const POT_DESC_TAG = "Bonus pot";

/**
 * Peak-cover rule: leave taken between 1 December and 30 January costs that
 * month's share of the bonus pot.
 *
 * Christmas and the new year are when cover is hardest to find and when the
 * people who do work are carrying the service. The pot is what recognises
 * that, so taking any approved leave in the window — a single day counts —
 * forfeits the pot for the month the leave falls in, and only that month. A
 * December absence costs the December pot; the January pot is untouched
 * unless there is January leave too.
 *
 * The window is deliberately asymmetric: December runs to the 31st, January
 * only to the 30th.
 */
export function peakLeaveWindowForMonth(month: Date): { start: string; end: string } | null {
  const y = month.getFullYear();
  switch (month.getMonth()) {
    case 11: return { start: `${y}-12-01`, end: `${y}-12-31` };
    case 0:  return { start: `${y}-01-01`, end: `${y}-01-30` };
    default: return null;   // the rule can only ever touch December and January
  }
}

export interface PeakLeaveRow {
  user_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

/** True when this person has approved leave overlapping that month's peak window. */
export function tookPeakLeave(leaves: PeakLeaveRow[], userId: string, month: Date): boolean {
  const w = peakLeaveWindowForMonth(month);
  if (!w) return false;
  // ISO dates compare correctly as strings, and a leave with no end date is a
  // single day. Overlap, not containment: leave spanning the new year is
  // caught by both months.
  return leaves.some(l =>
    l.user_id === userId &&
    l.status === "approved" &&
    l.start_date <= w.end &&
    (l.end_date ?? l.start_date) >= w.start
  );
}

// GBP conversion fallbacks (must match StaffPayManager). rate = GBP per 1 unit.
const FALLBACK_RATES: Record<string, number> = {
  GBP: 1, EUR: 0.85, USD: 0.79, INR: 0.0095, AED: 0.21, AUD: 0.52, CAD: 0.58, PHP: 0.014, ZAR: 0.044, NGN: 0.00052,
};

/**
 * Recompute EVERY month that has a bonus pot from the CURRENT ratings, tenure
 * and eligibility, and rewrite each staff member's "Bonus pot" pay record. This
 * is what makes a rating/eligibility change (e.g. to D) drop someone out of pots
 * that were already distributed and redistribute the amount to eligible staff.
 *
 * Self-contained (reads everything from the DB) so it can be called from the
 * payroll page, the staff profile, or Edit Settings alike.
 * Returns the number of months recalculated.
 */
export async function recalcAllBonusPots(userId?: string): Promise<number> {
  const createdBy = userId ?? (await supabase.auth.getUser()).data.user?.id ?? null;

  const { data: allPots } = await (supabase as any).from("monthly_bonus_pots").select("month, amount_gbp");
  if (!allPots?.length) return 0;

  // A finalised month is closed to changes — the database trigger would reject
  // these writes anyway, so skip those months rather than failing the whole
  // recalculation and leaving the open months untouched.
  const { data: locks } = await (supabase as any).from("payroll_locks").select("month");
  const lockedMonths = new Set(((locks as { month: string }[]) || []).map(l => l.month));
  const pots = (allPots as { month: string; amount_gbp: number }[])
    .filter(p => !lockedMonths.has(format(startOfMonth(parseISO(p.month)), "yyyy-MM-dd")));
  if (!pots.length) return 0;

  const [{ data: hr }, { data: rateRows }, { data: profs }, { data: salaries }, { data: leaves }] = await Promise.all([
    supabase.from("hr_profiles").select("user_id, performance_rating, start_date, created_at, employment_end_date, bonus_pot_eligible"),
    (supabase as any).from("manual_currency_rates").select("currency_code, rate_to_gbp"),
    supabase.from("profiles").select("user_id"),
    (supabase as any).from("staff_salaries").select("user_id, base_salary, base_currency"),
    supabase.from("staff_holidays").select("user_id, start_date, end_date, status").eq("status", "approved"),
  ]);
  const peakLeave = (leaves as PeakLeaveRow[]) || [];

  const rates: Record<string, number> = { ...FALLBACK_RATES };
  (rateRows || []).forEach((r: any) => { if (r.rate_to_gbp) rates[r.currency_code] = Number(r.rate_to_gbp); });
  const gbpToCurrency = (amountGbp: number, currency: string) => {
    const rate = rates[currency] ?? 1;
    return rate > 0 ? amountGbp / rate : amountGbp;
  };
  // Only staff who appear on the payroll (have a profiles row) — same set the
  // payroll page distributes across, so the pot never leaks to hidden staff.
  const payrollUsers = new Set(((profs as any[]) || []).map((p) => p.user_id));
  // Salary now lives in the private staff_salaries table.
  const salaryByUser = new Map<string, { base_salary: number | null; base_currency: string }>(
    ((salaries as any[]) || []).map((s) => [s.user_id, { base_salary: s.base_salary, base_currency: s.base_currency }])
  );

  // The pot is shared among salaried staff on the payroll. Ineligible ranks (D)
  // and opted-out staff (bonus_pot_eligible = false) get 0 points.
  const candidates = ((hr as any[]) || [])
    .map((h) => ({ ...h, base_salary: salaryByUser.get(h.user_id)?.base_salary ?? null, base_currency: salaryByUser.get(h.user_id)?.base_currency ?? "GBP" }))
    .filter((h) => (h.base_salary ?? 0) > 0 && payrollUsers.has(h.user_id));

  for (const pot of pots as { month: string; amount_gbp: number }[]) {
    const d = parseISO(pot.month);
    const mStart = format(startOfMonth(d), "yyyy-MM-dd");
    const mEnd = format(endOfMonth(d), "yyyy-MM-dd");
    const mLabel = format(d, "MMM yyyy");
    const amt = Number(pot.amount_gbp) || 0;

    // Points are worked out per month, not once for all of them: tenure is taken
    // as at the end of the previous month, and a leaver counts only for the part
    // of the month they worked. Computing this once from today's date would have
    // applied today's tenure to a pot from a year ago.
    const staff = candidates.map((h) => {
      const rating = (h.performance_rating && RANK_ORDER.includes(h.performance_rating) ? h.performance_rating : null) as Rank | null;
      const years = bonusTenureYears(h.start_date || h.created_at, d) ?? 0;
      const worked = employedFraction(h.start_date, h.employment_end_date, d);
      // Opted out, or away over Christmas/new year — either way, no share.
      const flagEligible = h.bonus_pot_eligible !== false && !tookPeakLeave(peakLeave, h.user_id, d);
      return {
        userId: h.user_id as string,
        currency: (h.base_currency as string) || "GBP",
        rank: rating, years, worked,
        points: flagEligible ? bonusPoints(rating, years) * worked : 0,
      };
    }).filter((s) => s.worked > 0);
    const totalPoints = staff.reduce((a, s) => a + s.points, 0);

    // Anyone already paid this month keeps the pot share they were paid with —
    // their records are frozen (and the database would refuse the rewrite).
    const { data: paidRows } = await supabase.from("staff_pay_records")
      .select("user_id").eq("record_type", "salary").eq("pay_period_start", mStart);
    const paidIds = new Set((paidRows ?? []).map((r) => r.user_id));

    let potDelete = supabase.from("staff_pay_records").delete()
      .eq("record_type", "bonus").eq("pay_period_start", mStart)
      .ilike("description", `${POT_DESC_TAG} · ${mLabel}%`);
    if (paidIds.size > 0) {
      potDelete = potDelete.not("user_id", "in", `(${[...paidIds].join(",")})`);
    }
    await potDelete;

    if (amt > 0 && totalPoints > 0) {
      const raw = staff.map((s) => (amt * s.points) / totalPoints);
      const shareGbp = raw.map((v) => Math.floor(v * 100) / 100);
      const pennies = Math.round((amt - shareGbp.reduce((a, b) => a + b, 0)) * 100);
      // Largest-remainder: give the leftover pennies to the biggest fractional shares.
      raw.map((v, i) => i).sort((a, b) => raw[b] - raw[a]).forEach((idx, k) => { if (k < pennies) shareGbp[idx] += 0.01; });

      const inserts = staff.map((s, i) => ({
        user_id: s.userId,
        record_type: "bonus" as const,
        amount: Math.round(gbpToCurrency(shareGbp[i], s.currency) * 100) / 100,
        currency: s.currency,
        description: `${POT_DESC_TAG} · ${mLabel} (${s.rank ?? "unrated"} · ${s.years}y · ${s.points.toFixed(2)} pts${s.worked < 1 ? ` · ${Math.round(s.worked * 100)}% of month` : ""})`,
        pay_date: mEnd,
        pay_period_start: mStart,
        pay_period_end: mEnd,
        created_by: createdBy,
      })).filter((r) => r.amount > 0 && !paidIds.has(r.user_id));

      if (inserts.length) {
        const { error } = await supabase.from("staff_pay_records").insert(inserts);
        if (error) throw error;
      }
    }
  }
  return (pots as any[]).length;
}
