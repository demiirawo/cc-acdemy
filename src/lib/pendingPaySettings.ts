import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { nextPayChangeDate } from "@/lib/payCalendar";

/**
 * Pay settings are decided now and take effect on the 2nd of the month.
 *
 * Four settings in Edit Settings change what somebody is paid. Saved part-way
 * through a month they used to apply at once, so the month being worked moved
 * under payroll: disabling public holiday pay on 29 December took away the
 * uplift for bank holidays already worked. Like a salary or a rating, a change
 * now waits for the 2nd, the day after payday.
 *
 * Nothing here writes to hr_profiles. apply_pending_pay_setting_changes() moves
 * a change on the day, from a daily cron job; until then payroll, the bonus pot
 * and the person's own pay view all keep the setting in force.
 */

export const HELD_PAY_SETTINGS = ["unlimited_holiday", "public_holiday_pay_disabled", "bonus_pot_eligible", "pay_frequency"] as const;
export type HeldPaySetting = (typeof HELD_PAY_SETTINGS)[number];

export interface HeldPaySettingValues {
  unlimited_holiday: boolean;
  public_holiday_pay_disabled: boolean;
  bonus_pot_eligible: boolean;
  pay_frequency: string;
}

/** How each setting reads in a sentence. */
export const HELD_PAY_SETTING_LABELS: Record<HeldPaySetting, string> = {
  unlimited_holiday: "unlimited holiday",
  public_holiday_pay_disabled: "public holiday pay",
  bonus_pot_eligible: "bonus pot eligibility",
  pay_frequency: "pay frequency",
};

export interface PendingPaySettingChange {
  id: string;
  user_id: string;
  setting: HeldPaySetting;
  previous_value: string | null;
  new_value: string;
  effective_date: string;
}

const encode = (value: boolean | string): string => (typeof value === "boolean" ? String(value) : value);

/** A stored value back in the form's terms. */
export function decodePaySetting<S extends HeldPaySetting>(setting: S, value: string): HeldPaySettingValues[S] {
  return (setting === "pay_frequency" ? value : value === "true") as HeldPaySettingValues[S];
}

export async function fetchPendingPaySettingChanges(userId: string): Promise<PendingPaySettingChange[]> {
  const { data, error } = await supabase
    .from("pending_pay_setting_changes")
    .select("id, user_id, setting, previous_value, new_value, effective_date")
    .eq("user_id", userId)
    .is("applied_at", null)
    .is("cancelled_at", null);
  if (error) throw error;
  return (data ?? []) as PendingPaySettingChange[];
}

/** Withdraw whatever is waiting for one person's setting. */
async function withdraw(userId: string, setting: HeldPaySetting, byUserId: string | null): Promise<void> {
  const { error } = await supabase
    .from("pending_pay_setting_changes")
    .update({ cancelled_at: new Date().toISOString(), cancelled_by: byUserId })
    .eq("user_id", userId)
    .eq("setting", setting)
    .is("applied_at", null)
    .is("cancelled_at", null);
  if (error) throw error;
}

/**
 * Bring what is waiting into line with what the form now says.
 *
 * For each setting: back at the value in force, anything waiting is withdrawn;
 * already waiting for this value, it is left alone and keeps its date; anything
 * else replaces what was waiting with a change for the next 2nd.
 */
export async function reconcilePendingPaySettings(opts: {
  userId: string;
  inForce: HeldPaySettingValues;
  decided: HeldPaySettingValues;
  pending: PendingPaySettingChange[];
  byUserId?: string | null;
}): Promise<{ scheduled: HeldPaySetting[]; withdrawn: HeldPaySetting[]; effectiveDate: Date }> {
  const effectiveDate = nextPayChangeDate();
  const byUserId = opts.byUserId ?? null;
  const scheduled: HeldPaySetting[] = [];
  const withdrawn: HeldPaySetting[] = [];

  for (const setting of HELD_PAY_SETTINGS) {
    const inForce = opts.inForce[setting];
    const decided = opts.decided[setting];
    const waiting = opts.pending.find(p => p.setting === setting);

    if (decided === inForce) {
      if (waiting) {
        await withdraw(opts.userId, setting, byUserId);
        withdrawn.push(setting);
      }
      continue;
    }
    if (waiting && decodePaySetting(setting, waiting.new_value) === decided) continue;

    await withdraw(opts.userId, setting, byUserId);
    const { error } = await supabase.from("pending_pay_setting_changes").insert({
      user_id: opts.userId,
      setting,
      previous_value: encode(inForce),
      new_value: encode(decided),
      effective_date: format(effectiveDate, "yyyy-MM-dd"),
      created_by: byUserId,
    });
    if (error) throw error;
    scheduled.push(setting);
  }
  return { scheduled, withdrawn, effectiveDate };
}
