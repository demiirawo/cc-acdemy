/**
 * The onboarding stages, in the order a new starter works through them.
 *
 * Every screen used to keep its own copy of this list and filter against it,
 * dropping anything that didn't match. A step on an unlisted stage therefore
 * disappeared completely — off the checklist, off the matrix, and out of the
 * completion totals — with nothing anywhere to say it existed. Six steps sat on
 * "Systems & Tools" (one letter out from the real stage) for eight months
 * exactly that way.
 *
 * So the list orders stages; it no longer decides which ones exist. Anything
 * unrecognised is shown after the known stages rather than swallowed, which
 * makes a stage typo look like a mistake instead of looking like nothing.
 */
export const STAGE_ORDER = [
  "Getting Started",
  "System & Tools",
  "Company Policies",
  "Training",
  "Final Checks",
] as const;

/** Where a step with no stage recorded belongs. */
export const DEFAULT_STAGE = "Getting Started";

export const stageOf = (step: { stage?: string | null }): string => step.stage || DEFAULT_STAGE;

/** Groups steps by stage, keeping each group in the order it arrived. */
export function groupByStage<T extends { stage?: string | null }>(steps: T[]): Record<string, T[]> {
  return steps.reduce<Record<string, T[]>>((acc, step) => {
    const key = stageOf(step);
    (acc[key] ||= []).push(step);
    return acc;
  }, {});
}

/**
 * The stages to render: the known ones that have steps, in order, followed by
 * any other stage the data turned up — alphabetically, so the order is stable.
 */
export function orderStages(grouped: Record<string, unknown[]>): string[] {
  const known = STAGE_ORDER.filter(stage => grouped[stage]?.length);
  const extra = Object.keys(grouped)
    .filter(stage => stage && !STAGE_ORDER.includes(stage as typeof STAGE_ORDER[number]) && grouped[stage].length)
    .sort();
  return [...known, ...extra];
}

/** True for a stage that isn't one of the five — worth flagging to an admin. */
export const isUnknownStage = (stage: string): boolean =>
  !STAGE_ORDER.includes(stage as typeof STAGE_ORDER[number]);
