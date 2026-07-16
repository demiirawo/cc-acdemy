import { cn } from "@/lib/utils";

// Performance rating tiers (tier-list style). Order defines the click cycle.
export const RANK_ORDER = ['S', 'A', 'B', 'C', 'D'] as const;
export type Rank = typeof RANK_ORDER[number];

export const RANK_STYLES: Record<Rank, { label: string; tile: string; glow: string; emoji: string; description: string }> = {
  S: { label: 'S Rank', tile: 'bg-gradient-to-br from-amber-300 via-yellow-400 to-amber-500 text-amber-950', glow: 'shadow-[0_0_18px_rgba(251,191,36,0.7)]', emoji: '👑', description: 'Exceptional — consistently exceeds expectations and sets the standard for the team.' },
  A: { label: 'A Rank', tile: 'bg-gradient-to-br from-emerald-300 to-green-500 text-emerald-950', glow: 'shadow-[0_0_16px_rgba(16,185,129,0.55)]', emoji: '⭐', description: 'Strong — reliably high performer who goes beyond in key areas.' },
  B: { label: 'B Rank', tile: 'bg-gradient-to-br from-sky-300 to-blue-500 text-sky-950', glow: 'shadow-[0_0_16px_rgba(59,130,246,0.5)]', emoji: '✨', description: 'Solid — dependably meets all expectations of the role.' },
  C: { label: 'C Rank', tile: 'bg-gradient-to-br from-violet-300 to-purple-500 text-violet-950', glow: 'shadow-[0_0_14px_rgba(168,85,247,0.45)]', emoji: '🔧', description: 'Developing — meets most expectations, with clear areas to build on.' },
  D: { label: 'D Rank', tile: 'bg-gradient-to-br from-slate-300 to-slate-500 text-slate-900', glow: '', emoji: '🌱', description: 'Needs support — below expectations; active development in progress.' },
};

// Bonus-pot weighting: a staff member's share of a monthly pot is proportional
// to (1 + tenure years) × rank multiplier. Single source of truth shared by the
// payroll pot and the profile's performance section.
export const RANK_BONUS_MULT: Record<Rank, number> = { S: 2.0, A: 1.75, B: 1.5, C: 1.25, D: 1.0 };
export const UNRATED_BONUS_MULT = 1.5;
export const rankBonusMult = (rank: Rank | null): number =>
  rank && RANK_BONUS_MULT[rank] ? RANK_BONUS_MULT[rank] : UNRATED_BONUS_MULT;

// Ranks that receive NO share of the monthly bonus pot, regardless of tenure.
export const BONUS_INELIGIBLE_RANKS: Rank[] = ['C', 'D'];
export const bonusEligible = (rank: Rank | null): boolean =>
  !(rank && BONUS_INELIGIBLE_RANKS.includes(rank));
/** Lowest rank that still earns a pot share — the threshold to become eligible. */
export const LOWEST_ELIGIBLE_RANK: Rank = 'B';

export const bonusPoints = (rank: Rank | null, years: number): number =>
  bonusEligible(rank) ? (1 + Math.max(0, years)) * rankBonusMult(rank) : 0;

/** Completed years of tenure from an ISO start date (null if unknown). */
export function tenureYears(startDate: string | null | undefined): number | null {
  if (!startDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(startDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)));
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
