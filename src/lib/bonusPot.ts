import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, parseISO, eachDayOfInterval } from "date-fns";
import { RANK_ORDER, bonusPoints, bonusEligible, bonusTenureYears, employedFraction, type Rank } from "@/components/hr/PerformanceRankBadge";

export const POT_DESC_TAG = "Bonus pot";

/**
 * Peak-cover rule: the December and January pots lean heavily towards whoever
 * covers Christmas and the new year.
 *
 * Those weeks are when cover is hardest to find, and the people who work them
 * are carrying the service. So a share of those two pots is scaled by how much
 * of the critical window the person was available — and scaled steeply, so that
 * working through is worth markedly more than nearly working through. Everyone
 * who takes leave still gets paid; they take a smaller slice, and the slice
 * they leave behind goes to the people who covered for them.
 *
 * The window is 15 December to 15 January, because that is where the pressure
 * actually is: across two winters of bookings, an average day in that stretch
 * had six people away and Christmas Day had seventeen, while the first half of
 * December sat at 0.4 — no different from a week in February. Rewarding
 * availability across all of December and January would have paid for cover
 * nobody needed.
 *
 * Scored per month against that month's half of the window, matching how the
 * pot itself is monthly: December is judged on 15–31 December, January on
 * 1–15 January, and a break spanning the new year touches both.
 *
 * Availability is counted in calendar days, not chargeable leave days. Being
 * away from the 24th to the 4th is eleven days without cover however few of
 * them come off an allowance, and cover is what the pot is paying for.
 */
export function peakLeaveWindowForMonth(month: Date): { start: string; end: string } | null {
  const y = month.getFullYear();
  switch (month.getMonth()) {
    case 11: return { start: `${y}-12-15`, end: `${y}-12-31` };   // the 17 days that matter
    case 0:  return { start: `${y}-01-01`, end: `${y}-01-15` };   // and the 15 that follow
    default: return null;   // the rule can only ever touch December and January
  }
}

/**
 * How sharply the share falls away as days off mount up. The weight is the
 * fraction of the window covered, raised to this power, so 1 is a flat
 * pro-rata and higher numbers bend it towards the people who took least.
 * At 3, a single day off costs about a tenth of the share, a week costs
 * nearly half, and a fortnight costs three quarters. Raise it to lean harder;
 * lower it to soften. Nothing else needs to change.
 */
export const PEAK_SHARE_EXPONENT = 3;

export interface PeakLeaveRow {
  user_id: string;
  start_date: string;
  end_date: string | null;
  status: string;
}

/** True for December and January — the two months the peak rule governs. */
export function isPeakMonth(month: Date): boolean {
  return peakLeaveWindowForMonth(month) !== null;
}

export interface PeakCover {
  /** Calendar days in that month's half of the window (31 for both). */
  windowDays: number;
  /** Days of approved leave inside it. */
  daysOff: number;
  /** Days present — what the December and January pots are actually shared on. */
  daysCovered: number;
  /** daysCovered/windowDays, bent by PEAK_SHARE_EXPONENT. 1 outside Dec & Jan. */
  weight: number;
}

/**
 * How much of the peak window this person covered, and what that's worth.
 *
 * Days and weight come back together because they always have to agree: the
 * number shown on the pay record is the number the share was worked out from.
 */
export function peakCover(leaves: PeakLeaveRow[], userId: string, month: Date): PeakCover {
  const w = peakLeaveWindowForMonth(month);
  if (!w) return { windowDays: 0, daysOff: 0, daysCovered: 0, weight: 1 };

  const windowDays = eachDayOfInterval({ start: parseISO(w.start), end: parseISO(w.end) }).length;
  const away = new Set<string>();
  for (const l of leaves) {
    if (l.user_id !== userId || l.status !== "approved") continue;
    // Clamp to the window — leave running in from November or out into
    // February only dilutes the days that fall inside it.
    const from = l.start_date > w.start ? l.start_date : w.start;
    const end = l.end_date ?? l.start_date;   // no end date = a single day
    const to = end < w.end ? end : w.end;
    if (from > to) continue;
    for (const d of eachDayOfInterval({ start: parseISO(from), end: parseISO(to) })) {
      away.add(format(d, "yyyy-MM-dd"));   // overlapping bookings count once
    }
  }

  const daysOff = away.size;
  const daysCovered = Math.max(0, windowDays - daysOff);
  return { windowDays, daysOff, daysCovered, weight: Math.pow(daysCovered / windowDays, PEAK_SHARE_EXPONENT) };
}

export interface PotScore {
  rank: Rank | null;
  years: number;
  /** Fraction of the month employed — joiners and leavers share pro-rata. */
  worked: number;
  /** Peak-window cover weight (1 outside December and January). */
  peakShare: number;
  /** The per-staff opt-out flag. */
  flagEligible: boolean;
}

/**
 * One person's points in one month's pot — the single place the split is
 * decided, so the payroll preview and the recalculation can't drift apart.
 *
 * Most months the pot rewards standing: rank and tenure set the size of the
 * share. December and January don't. Those two pots exist to pay for cover
 * over Christmas and the new year, so they're settled on days worked and
 * nothing else — a senior colleague who takes the fortnight off and a new
 * starter who works every day of it are judged on the same question, which is
 * who was actually here.
 *
 * Eligibility is untouched by that. A D rating or an opt-out still means no
 * share, in December as in any other month; it's the size of the share that
 * stops depending on rank, not the right to one.
 */
export function monthlyBonusPoints(s: PotScore, month: Date): number {
  if (!s.flagEligible || !bonusEligible(s.rank)) return 0;
  return isPeakMonth(month)
    ? s.worked * s.peakShare                    // Dec & Jan — days worked, nothing else
    : bonusPoints(s.rank, s.years) * s.worked;  // every other month — rank and tenure
}

/**
 * The line written onto the pay record. It has to explain the number without
 * anyone opening the payroll page, so in December and January it names days
 * rather than a rank that had no bearing on the amount.
 */
export function potRecordDescription(
  monthLabel: string,
  s: PotScore & { points: number; cover: PeakCover },
  month: Date,
): string {
  const partMonth = s.worked < 1 ? ` · ${Math.round(s.worked * 100)}% of month` : "";
  const basis = isPeakMonth(month)
    ? `days worked · ${s.cover.daysCovered} of ${s.cover.windowDays} days covered`
    : `${s.rank ?? "unrated"} · ${s.years}y`;
  return `${POT_DESC_TAG} · ${monthLabel} (${basis} · ${s.points.toFixed(2)} pts${partMonth})`;
}

// GBP conversion fallbacks (must match StaffPayManager). rate = GBP per 1 unit.
const FALLBACK_RATES: Record<string, number> = {
  GBP: 1, EUR: 0.85, USD: 0.79, INR: 0.0095, AED: 0.21, AUD: 0.52, CAD: 0.58, PHP: 0.014, ZAR: 0.044, NGN: 0.00052,
};

/**
 * Recompute EVERY month that has a bonus pot from the CURRENT ratings, tenure,
 * peak-window cover and eligibility, and rewrite each staff member's "Bonus
 * pot" pay record. This
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
      const flagEligible = h.bonus_pot_eligible !== false;
      // Time away over Christmas/new year dilutes the share rather than ending it.
      const cover = peakCover(peakLeave, h.user_id, d);
      const score = { rank: rating, years, worked, peakShare: cover.weight, flagEligible };
      return {
        userId: h.user_id as string,
        currency: (h.base_currency as string) || "GBP",
        ...score, cover,
        points: monthlyBonusPoints(score, d),
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
        description: potRecordDescription(mLabel, s, d),
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
