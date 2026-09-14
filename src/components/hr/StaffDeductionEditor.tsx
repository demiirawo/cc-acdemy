import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Repeat, CalendarDays, Loader2 } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { deductionTermLabel, endDateForMonths } from "@/lib/recurringDeductions";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", INR: "₹", AED: "د.إ", AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R", NGN: "₦",
};

interface DeductionRow {
  id: string;
  amount: number;
  description: string | null;
}

interface RecurringDeductionRow extends DeductionRow {
  /** First day of the first month it applies to. */
  startDate: string;
  /** Last day of the last month; null = until stopped. */
  endDate: string | null;
}

interface StaffDeductionEditorProps {
  staffId: string;
  currency: string;
  selectedMonth: Date;
  /** One-off deduction pay records for this staff in the selected month. */
  oneOffDeductions: DeductionRow[];
  /** Recurring deductions active for this staff in the selected month. */
  recurringDeductions: RecurringDeductionRow[];
  /** Refresh parent payroll data after a change. */
  onChanged: () => void | Promise<void>;
}

type DeductionKind = "oneoff" | "recurring";

/** The longest term offered. The table refuses anything over ten years too. */
const MAX_MONTHS = 120;

/**
 * Supabase errors are plain objects with a message, not always Error
 * instances, so `instanceof Error` would print "[object Object]".
 */
const messageOf = (e: unknown): string =>
  e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string"
    ? (e as { message: string }).message
    : String(e);

/**
 * Deductions for one admin in one month: the one-off records, the recurring
 * deductions running through it, and a form to add either. A recurring
 * deduction can be given a term ("for 3 months") or left to run until stopped.
 * Same shape as the bonus editor beside it.
 */
export function StaffDeductionEditor({
  staffId,
  currency,
  selectedMonth,
  oneOffDeductions,
  recurringDeductions,
  onChanged,
}: StaffDeductionEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const symbol = CURRENCY_SYMBOLS[currency] || "£";

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<DeductionKind>("oneoff");
  const [months, setMonths] = useState("");
  const [busy, setBusy] = useState(false);

  const fmtMoney = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtMonth = (d: string) => format(parseISO(d), "MMM yyyy");
  // A term is a whole number of months. Anything else is refused rather than
  // rounded: "2.5" must not quietly become two months, and a stray long
  // number must not reach the date maths.
  const monthsText = months.trim();
  const monthCount = /^\d+$/.test(monthsText) ? Number(monthsText) : NaN;
  const hasTerm = monthCount >= 1 && monthCount <= MAX_MONTHS;
  const termInvalid = monthsText !== "" && !hasTerm;

  const add = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a deduction amount", variant: "destructive" });
      return;
    }
    if (type === "recurring" && termInvalid) {
      toast({ title: `Enter a whole number of months from 1 to ${MAX_MONTHS}, or leave it blank to run until stopped`, variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (type === "recurring") {
        const { error } = await supabase.from("recurring_deductions").insert({
          user_id: staffId,
          amount: amt,
          currency,
          description: description.trim() || null,
          start_date: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
          end_date: hasTerm ? endDateForMonths(selectedMonth, monthCount) : null,
          created_by: user?.id as string,
        });
        if (error) throw error;
      } else {
        const payDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
        const { error } = await supabase.from("staff_pay_records").insert({
          user_id: staffId,
          record_type: "deduction" as never,
          amount: amt,
          currency,
          description: description.trim() || null,
          pay_date: payDate,
          pay_period_start: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
          pay_period_end: payDate,
          created_by: user?.id as string,
        });
        if (error) throw error;
      }
      setAmount("");
      setDescription("");
      setMonths("");
      toast({ title: type === "recurring" ? "Recurring deduction added" : "Deduction added" });
      await onChanged();
    } catch (e: unknown) {
      toast({ title: "Could not add deduction", description: messageOf(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const removeOneOff = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("staff_pay_records").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Deduction removed" });
      await onChanged();
    } catch (e: unknown) {
      toast({ title: "Could not remove", description: messageOf(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stopRecurring = async (row: RecurringDeductionRow) => {
    if (!confirm("Stop this recurring deduction from this month onward? Months already paid are unaffected.")) return;
    setBusy(true);
    try {
      const newEnd = format(endOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd");
      // Stopped in the month it began, it never applied to anything — so it
      // goes, rather than surviving as a row that ends before it starts.
      const { error } = newEnd < row.startDate
        ? await supabase.from("recurring_deductions").delete().eq("id", row.id)
        : await supabase.from("recurring_deductions").update({ end_date: newEnd }).eq("id", row.id);
      if (error) throw error;
      toast({ title: "Recurring deduction stopped" });
      await onChanged();
    } catch (e: unknown) {
      toast({ title: "Could not stop", description: messageOf(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ amount: rowAmount, description: rowDescription, suffix, note, onRemove, title }: {
    amount: number; description: string | null; suffix?: string; note?: string; onRemove: () => void; title: string;
  }) => (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 max-w-full overflow-hidden">
      <div className="min-w-0 flex-1 flex flex-col">
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="text-sm font-semibold text-destructive whitespace-nowrap flex-shrink-0">
            -{fmtMoney(rowAmount)}{suffix}
          </span>
          <span className="text-xs text-muted-foreground truncate min-w-0 flex-1" title={rowDescription || undefined}>
            {rowDescription || "No reason given"}
          </span>
        </div>
        {note && <span className="text-[11px] text-muted-foreground">{note}</span>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-7 w-7 flex-shrink-0 text-destructive hover:text-destructive"
        onClick={onRemove}
        disabled={busy}
        title={title}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
  );

  const Segment = ({ kind, icon: Icon, label }: { kind: DeductionKind; icon: typeof Repeat; label: string }) => (
    <button
      type="button"
      onClick={() => setType(kind)}
      className={cn(
        "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
        type === kind ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  const monthLabel = format(selectedMonth, "MMMM yyyy");
  const termPreview = type === "recurring"
    ? hasTerm
      ? `${fmtMonth(format(startOfMonth(selectedMonth), "yyyy-MM-dd"))} – ${fmtMonth(endDateForMonths(selectedMonth, monthCount))}`
      : `from ${monthLabel} until stopped`
    : "";

  return (
    <div className="space-y-4">
      {/* This month only */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium">This month only</span>
          <span className="text-xs text-muted-foreground">· {monthLabel}</span>
        </div>
        {oneOffDeductions.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-5">No one-off deductions this month.</p>
        ) : (
          <div className="space-y-1.5 pl-5">
            {oneOffDeductions.map(d => (
              <Row key={d.id} amount={d.amount} description={d.description} onRemove={() => removeOneOff(d.id)} title="Remove deduction" />
            ))}
          </div>
        )}
      </div>

      {/* Recurring */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-4 w-4 text-destructive" />
          <span className="text-sm font-medium">Recurring</span>
          <span className="text-xs text-muted-foreground">· the same amount every month of the term</span>
        </div>
        {recurringDeductions.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-5">No recurring deductions.</p>
        ) : (
          <div className="space-y-1.5 pl-5">
            {recurringDeductions.map(d => (
              <Row
                key={d.id}
                amount={d.amount}
                description={d.description}
                suffix="/month"
                note={`${fmtMonth(d.startDate)} – ${d.endDate ? fmtMonth(d.endDate) : "until stopped"} · this is ${deductionTermLabel({ start_date: d.startDate, end_date: d.endDate }, selectedMonth)}`}
                onRemove={() => stopRecurring(d)}
                title="Stop recurring deduction"
              />
            ))}
          </div>
        )}
      </div>

      {/* Add a deduction */}
      <div className="rounded-lg border p-3 space-y-3 bg-background">
        <p className="text-sm font-medium flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add a deduction</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{symbol}</span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
            step="0.01"
            min="0"
            placeholder={type === "recurring" ? "per month" : "0.00"}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Reason (visible to staff)"
            className="flex-1"
          />
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
              <Segment kind="oneoff" icon={CalendarDays} label="This month" />
              <Segment kind="recurring" icon={Repeat} label="Recurring" />
            </div>
            {type === "recurring" && (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                for
                <Input
                  type="number"
                  inputMode="numeric"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                  className={cn("w-16 h-8", termInvalid && "border-destructive")}
                  min="1"
                  max={MAX_MONTHS}
                  step="1"
                  placeholder="∞"
                />
                months
              </label>
            )}
          </div>

          <Button type="button" onClick={add} disabled={busy || (type === "recurring" && termInvalid)} size="sm">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add deduction
          </Button>
        </div>
        <p className={cn("text-xs", type === "recurring" && termInvalid ? "text-destructive" : "text-muted-foreground")}>
          {type === "recurring"
            ? termInvalid
              ? `Enter a whole number of months from 1 to ${MAX_MONTHS}, or leave it blank to run until you stop it.`
              : `Taken every month ${termPreview}. Leave the months blank to run until you stop it.`
            : `Taken from ${monthLabel} only.`}
        </p>
      </div>
    </div>
  );
}
