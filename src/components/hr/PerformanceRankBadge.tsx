import { cn } from "@/lib/utils";

// Performance rating tiers (tier-list style). Order defines the click cycle.
export const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;
export type Rank = typeof RANK_ORDER[number];

export const RANK_STYLES: Record<Rank, { label: string; tile: string; glow: string; emoji: string; description: string; bar: string }> = {
  S: { label: 'S Rank', tile: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-amber-950', glow: 'shadow-[0_0_18px_rgba(251,191,36,0.7)]', emoji: '👑', description: 'Exceptional — consistently exceeds expectations and sets the standard for the team.', bar: 'bg-gradient-to-t from-amber-500 to-amber-300' },
  A: { label: 'A Rank', tile: 'bg-gradient-to-br from-emerald-300 to-green-500 text-emerald-950', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.55)]', emoji: '⭐', description: 'Strong — reliably high performer who goes beyond in key areas.', bar: 'bg-gradient-to-t from-emerald-500 to-green-300' },
  B: { label: 'B Rank', tile: 'bg-gradient-to-br from-sky-300 to-blue-500 text-sky-950', glow: 'shadow-[0_0_16px_rgba(59,130,246,0.5)]', emoji: '✨', description: 'Solid — dependably meets all expectations of the role.', bar: 'bg-gradient-to-t from-blue-500 to-sky-300' },
  C: { label: 'C Rank', tile: 'bg-gradient-to-br from-violet-300 to-purple-500 text-violet-950', glow: 'shadow-[0_0_14px_rgba(168,85,247,0.45)]', emoji: '🔧', description: 'Developing — meets most expectations, with clear areas to build on.', bar: 'bg-gradient-to-t from-purple-500 to-violet-300' },
  D: { label: 'D Rank', tile: 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900', glow: '', emoji: '🌱', description: 'Needs support — below expectations; active development in progress.', bar: 'bg-gradient-to-t from-slate-500 to-slate-300' },
};

// Bonus-pot weighting: a staff member's share of a monthly pot is proportional
// to (1 + tenure years) × rank multiplier. Single source of truth shared by the
// payroll pot and the profile's performance section.
// The rank spread is deliberately a little wider than the gaps between tenure
// years, so a higher rating counts for slightly more than an extra year served.
export const RANK_BONUS_MULT: Record<Rank, number> = { S: 2.4, A: 1.95, B: 1.5, C: 1.2, D: 1.0 };
export const UNRATED_BONUS_MULT = 1.5;
export const rankBonusMult = (rank: Rank | null): number =>
  rank && RANK_BONUS_MULT[rank] ? RANK_BONUS_MULT[rank] : UNRATED_BONUS_MULT;

// Ranks that receive NO share of the monthly bonus pot, regardless of tenure.
export const BONUS_INELIGIBLE_RANKS: Rank[] = ['D'];
export const bonusEligible = (rank: Rank | null): boolean =>
  !(rank && BONUS_INELIGIBLE_RANKS.includes(rank));
/** Lowest rank that still earns a pot share — the threshold to become eligible. */
export const LOWEST_ELIGIBLE_RANK: Rank = 'C';

export const bonusPoints = (rank: Rank | null, years: number): number =>
  bonusEligible(rank) ? (1 + Math.max(0, years)) * rankBonusMult(rank) : 0;

/**
 * Completed years of tenure from an ISO start date (null if unknown), as at
 * `asOf` — today unless stated. Counted on the calendar rather than by dividing
 * elapsed milliseconds, because whether someone has *reached* an anniversary is
 * exactly what this decides, and a 365.25-day average lands on the wrong side of
 * that date in leap years.
 */
export function tenureYears(startDate: string | null | undefined, asOf: Date = new Date()): number | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;
  let years = asOf.getFullYear() - start.getFullYear();
  const beforeAnniversary =
    asOf.getMonth() < start.getMonth() ||
    (asOf.getMonth() === start.getMonth() && asOf.getDate() < start.getDate());
  if (beforeAnniversary) years -= 1;
  return Math.max(0, years);
}

/**
 * The tenure a given payroll month's bonus share is calculated on — measured at
 * the end of the month before it.
 *
 * So an anniversary reached during a month doesn't raise that month's share; it
 * takes effect from the next payroll run. That keeps shares from shifting under
 * everyone else late in the month, as one person crossing a year boundary
 * redistributes the whole pot.
 */
export function bonusTenureYears(startDate: string | null | undefined, payrollMonth: Date): number | null {
  // Day 0 of the payroll month = the last day of the month before it.
  const cutoff = new Date(payrollMonth.getFullYear(), payrollMonth.getMonth(), 0);
  return tenureYears(startDate, cutoff);
}

/**
 * How much of a payroll month someone was employed for, as a fraction of 0–1.
 *
 * A leaver's bonus share is scaled by this, so finishing a quarter of the way
 * through the month earns a quarter of what they'd otherwise have taken, and the
 * remainder stays in the pot for everyone else rather than being paid in full or
 * dropped on the floor.
 */
export function employedFraction(endDate: string | null | undefined, payrollMonth: Date): number {
  if (!endDate) return 1;
  const end = new Date(endDate);
  if (isNaN(end.getTime())) return 1;

  const year = payrollMonth.getFullYear();
  const month = payrollMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Left before the month began — no share at all.
  if (end < new Date(year, month, 1)) return 0;
  // Still employed at month end — full share.
  if (end >= new Date(year, month, daysInMonth)) return 1;
  // Left partway through: count the days worked, their last day included.
  return end.getDate() / daysInMonth;
}

interface PerformanceRankBadgeProps {
  rank: Rank | null;
  /** Completed years of tenure — shown as a corner number. */
  years: number | null;
  size?: "sm" | "md";
  className?: string;
  onClick?: () => void;
  title?: string;
}

/**
 * Gradient tile carrying the performance-rank LETTER, with the staff member's
 * years of tenure as a small corner number. Shared between the staff profile
 * (Performance Rating card) and the payroll summary.
 */
export function PerformanceRankBadge({ rank, years, size = "md", className, onClick, title }: PerformanceRankBadgeProps) {
  const style = rank ? RANK_STYLES[rank] : null;
  const dims = size === "md" ? "h-11 w-11 text-xl rounded-lg" : "h-9 w-9 text-base rounded-lg";
  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      title={title ?? (rank ? `${style!.label}${years != null ? ` · ${years} yr${years === 1 ? "" : "s"} tenure` : ""}` : "Not yet rated")}
      onClick={onClick}
    >
      <div
        className={cn(
          "flex items-center justify-center font-extrabold",
          dims,
          style ? cn(style.tile, style.glow) : "bg-muted text-muted-foreground",
        )}
      >
        {rank ?? "?"}
      </div>
      {years != null && (
        <span
          className={cn(
            "absolute -top-1.5 -right-1.5 flex items-center justify-center rounded-full border-2 border-background bg-foreground font-bold text-background tabular-nums",
            size === "md" ? "min-w-[20px] h-5 px-1 text-[11px]" : "min-w-[17px] h-[17px] px-0.5 text-[10px]",
          )}
          aria-label={`${years} years tenure`}
        >
          {years}
        </span>
      )}
    </div>
  );
}
