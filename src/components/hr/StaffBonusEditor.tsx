import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Repeat, CalendarDays, CalendarCheck, Loader2 } from "lucide-react";
import { format, parseISO, startOfMonth, endOfMonth, subMonths } from "date-fns";
import { missedSummary, type ShiftBonusResult } from "@/lib/shiftBonus";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", INR: "₹", AED: "د.إ", AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R", NGN: "₦",
};

interface BonusRow {
  id: string;
  amount: number;
  description: string | null;
}

interface ShiftBonusRow extends BonusRow {
  /** First day of the first month it applies to. */
  startDate: string;
}

interface StaffBonusEditorProps {
  staffId: string;
  currency: string;
  selectedMonth: Date;
  /** One-off bonus pay records for this staff in the selected month. */
  oneOffBonuses: BonusRow[];
  /** Recurring bonuses active for this staff in the selected month. */
  recurringBonuses: BonusRow[];
  /** Shift bonuses active in the selected month (normally at most one). */
  shiftBonuses?: ShiftBonusRow[];
  /** How the shift bonus works out for the selected month, if it is unpaid. */
  shiftBonusThisMonth?: ShiftBonusResult | null;
  /**
   * This admin's next shift bonus, if one starts after the selected month. A
   * bonus set from here would run into it, so it blocks adding one.
   */
  laterShiftBonus?: { amount: number; startDate: string } | null;
  /** Refresh parent payroll data after a change. */
  onChanged: () => void | Promise<void>;
}

type BonusKind = "oneoff" | "recurring" | "shift";

export function StaffBonusEditor({
  staffId,
  currency,
  selectedMonth,
  oneOffBonuses,
  recurringBonuses,
  shiftBonuses = [],
  shiftBonusThisMonth = null,
  laterShiftBonus = null,
  onChanged,
}: StaffBonusEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const symbol = CURRENCY_SYMBOLS[currency] || "£";

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<BonusKind>("oneoff");
  const [busy, setBusy] = useState(false);

  const fmtMoney = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  // One standing shift bonus per admin. A second would silently add to the
  // first, which is never what somebody changing the amount means.
  const hasShiftBonus = shiftBonuses.length > 0;
  // One set from this month runs until stopped, so it would also run into a
  // bonus that starts later. The database refuses that overlap as well.
  const shiftBlocked = hasShiftBonus || !!laterShiftBonus;
  const laterMonth = laterShiftBonus ? format(parseISO(laterShiftBonus.startDate), "MMMM yyyy") : "";

  const add = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a bonus amount", variant: "destructive" });
      return;
    }
    if (type === "shift" && hasShiftBonus) {
      toast({ title: "A shift bonus is already set", description: "Stop it first, then add the new amount.", variant: "destructive" });
      return;
    }
    if (type === "shift" && laterShiftBonus) {
      toast({
        title: `A shift bonus starts in ${laterMonth}`,
        description: `To start it earlier, open ${laterMonth}, stop it there, then set it again from here.`,
        variant: "destructive",
      });
      return;
    }
    setBusy(true);
    try {
      if (type === "shift") {
        const { error } = await (supabase as any).from("shift_bonuses").insert({
          user_id: staffId,
          monthly_amount: amt,
          currency,
          description: description.trim() || null,
          start_date: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
          end_date: null,
          created_by: user?.id as string,
        });
        if (error) throw error;
      } else if (type === "recurring") {
        const { error } = await supabase.from("recurring_bonuses").insert({
          user_id: staffId,
          amount: amt,
          currency,
          description: description.trim() || "Recurring bonus",
          start_date: format(startOfMonth(selectedMonth), "yyyy-MM-dd"),
          end_date: null,
          created_by: user?.id as string,
        });
        if (error) throw error;
      } else {
        const payDate = format(endOfMonth(selectedMonth), "yyyy-MM-dd");
        const { error } = await supabase.from("staff_pay_records").insert({
          user_id: staffId,
          record_type: "bonus" as any,
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
      toast({ title: type === "shift" ? "Shift bonus set" : "Bonus added" });
      await onChanged();
    } catch (e: any) {
      toast({
        title: "Could not add bonus",
        // 23P01: the one-shift-bonus-at-a-time constraint, e.g. a second admin
        // set one in another tab a moment ago.
        description: e?.code === "23P01"
          ? "This admin already has a shift bonus covering some of these months. Stop that one first."
          : (e.message ?? String(e)),
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  const removeOneOff = async (id: string) => {
    setBusy(true);
    try {
      const { error } = await supabase.from("staff_pay_records").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Bonus removed" });
      await onChanged();
    } catch (e: any) {
      toast({ title: "Could not remove", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stopRecurring = async (id: string) => {
    if (!confirm("Stop this recurring bonus? It won't be applied from this month onward. Previous months are unaffected.")) return;
    setBusy(true);
    try {
      // End it at the close of the previous month so past months are preserved.
      const { error } = await supabase
        .from("recurring_bonuses")
        .update({ end_date: format(endOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd"), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast({ title: "Recurring bonus stopped" });
      await onChanged();
    } catch (e: any) {
      toast({ title: "Could not stop", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const stopShift = async (row: ShiftBonusRow) => {
    if (!confirm(
      "Stop this shift bonus from this month onward? Previous months are unaffected.\n\n" +
      "Bonus shifts are never paid as overtime, so any still on the rota will earn nothing until a new shift bonus is set."
    )) return;
    setBusy(true);
    try {
      const newEnd = format(endOfMonth(subMonths(selectedMonth, 1)), "yyyy-MM-dd");
      // Stopped in the month it began, it never applied to anything — so it
      // goes, rather than surviving as a row that ends before it starts.
      const { error } = newEnd < row.startDate
        ? await (supabase as any).from("shift_bonuses").delete().eq("id", row.id)
        : await (supabase as any).from("shift_bonuses").update({ end_date: newEnd }).eq("id", row.id);
      if (error) throw error;
      toast({ title: "Shift bonus stopped" });
      await onChanged();
    } catch (e: any) {
      toast({ title: "Could not stop", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ b, onRemove, suffix, title }: { b: BonusRow; onRemove: () => void; suffix?: string; title: string }) => (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 max-w-full overflow-hidden">
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground whitespace-nowrap flex-shrink-0">
          {fmtMoney(b.amount)}{suffix}
        </span>
        <span
          className="text-xs text-muted-foreground truncate min-w-0 flex-1"
          title={b.description || undefined}
        >
          {b.description || "No description"}
        </span>
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

  const month = format(selectedMonth, "MMMM");
  const count = shiftBonusThisMonth?.count;
  const missed = count ? missedSummary(count) : "";

  const Segment = ({ kind, icon: Icon, label, disabled }: { kind: BonusKind; icon: typeof Repeat; label: string; disabled?: boolean }) => (
    <button
      type="button"
      onClick={() => setType(kind)}
      disabled={disabled}
      title={disabled ? "A shift bonus is already set for this month or a later one — stop it first" : undefined}
      className={cn(
        "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed",
        type === kind ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* This month only */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <CalendarDays className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">This month only</span>
          <span className="text-xs text-muted-foreground">· {format(selectedMonth, "MMMM yyyy")}</span>
        </div>
        {oneOffBonuses.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-5">No one-off bonuses this month.</p>
        ) : (
          <div className="space-y-1.5 pl-5">
            {oneOffBonuses.map(b => <Row key={b.id} b={b} onRemove={() => removeOneOff(b.id)} title="Remove bonus" />)}
          </div>
        )}
      </div>

      {/* Recurring */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Repeat className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Recurring</span>
          <span className="text-xs text-muted-foreground">· applied every month</span>
        </div>
        {recurringBonuses.length === 0 ? (
          <p className="text-xs text-muted-foreground pl-5">No recurring bonuses.</p>
        ) : (
          <div className="space-y-1.5 pl-5">
            {recurringBonuses.map(b => <Row key={b.id} b={b} onRemove={() => stopRecurring(b.id)} title="Stop recurring bonus" />)}
          </div>
        )}
      </div>

      {/* Shift bonus */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <CalendarCheck className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium">Shift bonus</span>
          <span className="text-xs text-muted-foreground">· monthly, pro rata to bonus shifts worked</span>
        </div>
        <div className="space-y-1.5 pl-5">
          {shiftBonuses.map(b => (
            <Row key={b.id} b={b} suffix="/month" onRemove={() => stopShift(b)} title="Stop shift bonus" />
          ))}
          {shiftBonusThisMonth?.unconfigured ? (
            <p className="text-xs text-amber-600">
              {count!.scheduled.length} bonus shift{count!.scheduled.length === 1 ? "" : "s"} on the rota in {month} but no
              shift bonus set. Bonus shifts are never paid as overtime, so they are paid nothing until one is.
            </p>
          ) : hasShiftBonus && count ? (
            count.scheduled.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No bonus shifts on the rota in {month}. Mark the shifts as Bonus in the schedule.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                {month}: {count.worked.length} of {count.scheduled.length} bonus shifts worked →{" "}
                <span className="font-medium text-foreground">{fmtMoney(shiftBonusThisMonth!.amount)}</span>
                {missed && <> · missed {missed}</>}
              </p>
            )
          ) : !hasShiftBonus && !laterShiftBonus ? (
            <p className="text-xs text-muted-foreground">No shift bonus.</p>
          ) : null}
          {!hasShiftBonus && laterShiftBonus && (
            <p className="text-xs text-muted-foreground">
              {fmtMoney(laterShiftBonus.amount)}/month starts in {laterMonth}. To start it earlier, open {laterMonth},
              stop it there, and set it again from here.
            </p>
          )}
        </div>
      </div>

      {/* Add a bonus */}
      <div className="rounded-lg border p-3 space-y-3 bg-background">
        <p className="text-sm font-medium flex items-center gap-1.5"><Plus className="h-4 w-4" /> Add a bonus</p>
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">{symbol}</span>
          <Input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-28"
            step="0.01"
            min="0"
            placeholder={type === "shift" ? "per month" : "0.00"}
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (visible to staff)"
            className="flex-1"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
            <Segment kind="oneoff" icon={CalendarDays} label="This month" />
            <Segment kind="recurring" icon={Repeat} label="Recurring" />
            <Segment kind="shift" icon={CalendarCheck} label="Shift bonus" disabled={shiftBlocked} />
          </div>

          <Button type="button" onClick={add} disabled={busy || (type === "shift" && shiftBlocked)} size="sm">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            {type === "shift" ? "Set shift bonus" : "Add bonus"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {type === "shift"
            ? `The full amount for a month in which every bonus shift is worked, paid in proportion otherwise — from ${format(selectedMonth, "MMMM yyyy")} until stopped. Mark the shifts as Bonus in the schedule.`
            : type === "recurring"
              ? "Applied every month from this month until you stop it."
              : `Applied to ${format(selectedMonth, "MMMM yyyy")} only.`}
        </p>
      </div>
    </div>
  );
}
