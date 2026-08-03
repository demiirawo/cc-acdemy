/**
 * The three kinds of feedback that can sit on a staff record.
 *
 * Defined in one place because the payroll page, the staff profile and the
 * feedback log all render and count these, and the code previously branched on a
 * binary "is it praise?" — which quietly lumped anything that wasn't praise in
 * with warnings.
 *
 * A development point is deliberately not a warning: it's coaching, carries no
 * severity, and shouldn't read as a mark against someone when their record is
 * reviewed.
 */
export type FeedbackKind = "praise" | "development" | "warning";

export const FEEDBACK_KIND_ORDER: FeedbackKind[] = ["praise", "development", "warning"];

interface KindStyle {
  /** Badge text on a saved entry. */
  label: string;
  /** Button text in the composer. */
  short: string;
  badge: string;
  card: string;
  activeButton: string;
  /** Warnings are the only kind with a severity. */
  hasSeverity: boolean;
  placeholder: (name: string) => string;
  cta: string;
  addedTitle: string;
}

export const FEEDBACK_KINDS: Record<FeedbackKind, KindStyle> = {
  praise: {
    label: "Positive feedback",
    short: "Positive",
    badge: "border-green-300 text-green-600",
    card: "border-green-400/40 bg-green-500/5",
    activeButton: "bg-green-600 text-white shadow-sm",
    hasSeverity: false,
    placeholder: name => `What did ${name} do well?`,
    cta: "Add positive feedback & email",
    addedTitle: "Positive feedback added",
  },
  development: {
    label: "Development point",
    short: "Development",
    badge: "border-blue-300 text-blue-600",
    card: "border-blue-400/40 bg-blue-500/5",
    activeButton: "bg-blue-600 text-white shadow-sm",
    hasSeverity: false,
    placeholder: name => `What should ${name} work on, and what does good look like?`,
    cta: "Add development point & email",
    addedTitle: "Development point added",
  },
  warning: {
    label: "Warning",
    short: "Warning",
    badge: "border-amber-300 text-amber-600",
    card: "border-amber-400/40 bg-amber-500/5",
    activeButton: "bg-amber-500 text-white shadow-sm",
    hasSeverity: true,
    placeholder: name => `What did ${name} fall short on?`,
    cta: "Add warning & email",
    addedTitle: "Warning added",
  },
};

/** Anything stored before development points existed is praise or a warning. */
export const asFeedbackKind = (k: string | null | undefined): FeedbackKind =>
  k === "praise" || k === "development" || k === "warning" ? k : "warning";
