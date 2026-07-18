import { supabase } from "@/integrations/supabase/client";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
import { RANK_ORDER, bonusPoints, tenureYears, type Rank } from "@/components/hr/PerformanceRankBadge";

export const POT_DESC_TAG = "Bonus pot";

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

  const { data: pots } = await (supabase as any).from("monthly_bonus_pots").select("month, amount_gbp");
  if (!pots?.length) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: hr }, { data: rateRows }, { data: profs }, { data: salaries }] = await Promise.all([
    supabase.from("hr_profiles").select("user_id, performance_rating, start_date, created_at, employment_end_date, bonus_pot_eligible"),
    (supabase as any).from("manual_currency_rates").select("currency_code, rate_to_gbp"),
    supabase.from("profiles").select("user_id"),
    (supabase as any).from("staff_salaries").select("user_id, base_salary, base_currency"),
  ]);

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

  // The pot is shared among actively-employed, salaried staff. Ineligible ranks
  // (D) and opted-out staff (bonus_pot_eligible = false) get 0 points.
  const staff = ((hr as any[]) || [])
    .map((h) => ({ ...h, base_salary: salaryByUser.get(h.user_id)?.base_salary ?? null, base_currency: salaryByUser.get(h.user_id)?.base_currency ?? "GBP" }))
    .filter((h) => (h.base_salary ?? 0) > 0 && payrollUsers.has(h.user_id) && (!h.employment_end_date || h.employment_end_date >= today))
    .map((h) => {
      const rating = (h.performance_rating && RANK_ORDER.includes(h.performance_rating) ? h.performance_rating : null) as Rank | null;
      const years = tenureYears(h.start_date || h.created_at) ?? 0;
      const flagEligible = h.bonus_pot_eligible !== false;
      return { userId: h.user_id as string, currency: (h.base_currency as string) || "GBP", rank: rating, years, points: flagEligible ? bonusPoints(rating, years) : 0 };
    });
  const totalPoints = staff.reduce((a, s) => a + s.points, 0);

  for (const pot of pots as { month: string; amount_gbp: number }[]) {
    const d = parseISO(pot.month);
    const mStart = format(startOfMonth(d), "yyyy-MM-dd");
    const mEnd = format(endOfMonth(d), "yyyy-MM-dd");
    const mLabel = format(d, "MMM yyyy");
    const amt = Number(pot.amount_gbp) || 0;

    await supabase.from("staff_pay_records").delete()
      .eq("record_type", "bonus").eq("pay_period_start", mStart)
      .ilike("description", `${POT_DESC_TAG} · ${mLabel}%`);

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
        description: `${POT_DESC_TAG} · ${mLabel} (${s.rank ?? "unrated"} · ${s.years}y · ${s.points.toFixed(2)} pts)`,
        pay_date: mEnd,
        pay_period_start: mStart,
        pay_period_end: mEnd,
        created_by: createdBy,
      })).filter((r) => r.amount > 0);

      if (inserts.length) {
        const { error } = await supabase.from("staff_pay_records").insert(inserts);
        if (error) throw error;
      }
    }
  }
  return (pots as any[]).length;
}
