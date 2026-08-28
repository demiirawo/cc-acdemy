import { format, parseISO } from "date-fns";

/**
 * The details a contract pulls from the person's profile rather than being
 * typed in, and the rule that a contract cannot be issued without them.
 *
 * A contract is a snapshot: whatever is in body_html at the moment it is sent
 * is what the person signs, and nothing rewrites it afterwards. So the job
 * title and the fee have to be resolved before it goes out, and an unresolved
 * placeholder must never be allowed to reach a signature page — someone would
 * be signing an agreement to be paid "{{monthly_fee}}".
 */

export interface ContractRecipient {
  fullName: string | null;
  jobTitle: string | null;
  monthlyFee: number | null;
  currency: string | null;
  startDate: string | null;
}

/** Fields the contract body may refer to as {{name}}. */
export type ContractField = "full_name" | "job_title" | "monthly_fee" | "start_date";

/** Fields a contract cannot be issued without. Everything else can be blank. */
export const REQUIRED_CONTRACT_FIELDS: ContractField[] = ["job_title", "monthly_fee"];

export const CONTRACT_FIELD_LABELS: Record<ContractField, string> = {
  full_name: "Name",
  job_title: "Job title",
  monthly_fee: "Salary",
  start_date: "Start date",
};

const CURRENCY_SYMBOL: Record<string, string> = {
  GBP: "£", EUR: "€", USD: "$", NGN: "₦", INR: "₹", AED: "AED ",
  AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R",
};

/** "₦330,000" — the symbol where there is one, the code where there isn't. */
export function formatFee(amount: number, currency: string | null): string {
  const code = (currency || "GBP").toUpperCase();
  const symbol = CURRENCY_SYMBOL[code];
  const figure = amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return symbol ? `${symbol}${figure}` : `${figure} ${code}`;
}

export function contractFieldValues(r: ContractRecipient): Record<ContractField, string> {
  let started = "";
  if (r.startDate) {
    const d = parseISO(r.startDate);
    if (!isNaN(d.getTime())) started = format(d, "d MMMM yyyy");
  }
  return {
    full_name: (r.fullName ?? "").trim(),
    job_title: (r.jobTitle ?? "").trim(),
    monthly_fee: r.monthlyFee && r.monthlyFee > 0 ? formatFee(r.monthlyFee, r.currency) : "",
    start_date: started,
  };
}

/**
 * Which required fields this person is missing. An empty array means the
 * contract can be issued to them.
 */
export function missingContractFields(r: ContractRecipient): ContractField[] {
  const values = contractFieldValues(r);
  return REQUIRED_CONTRACT_FIELDS.filter(f => !values[f]);
}

/** Placeholders a body actually uses — so a template with no fee field is not gated on one. */
export function fieldsUsedIn(bodyHtml: string): ContractField[] {
  const found = new Set<ContractField>();
  for (const m of bodyHtml.matchAll(/\{\{(\w+)\}\}/g)) {
    found.add(m[1] as ContractField);
  }
  return [...found];
}

/**
 * Substitute the person's details into the contract body.
 *
 * Throws rather than leaving a placeholder behind: a contract that reaches
 * someone still saying {{monthly_fee}} is worse than one that never sent.
 */
export function fillContractFields(bodyHtml: string, r: ContractRecipient): string {
  // Checked before substituting, not after. An empty value replaces the
  // placeholder with nothing, so afterwards there is no evidence left that the
  // fee was ever missing — the contract just quietly says "paid  per month".
  const used = fieldsUsedIn(bodyHtml);
  const missing = missingContractFields(r).filter(f => used.includes(f));
  if (missing.length > 0) {
    throw new Error(`Contract still has unfilled details: ${missing.join(", ")}`);
  }

  const values = contractFieldValues(r);
  return bodyHtml.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => {
    const value = values[name as ContractField];
    return value === undefined ? whole : value;     // unknown placeholder — leave it be
  });
}
