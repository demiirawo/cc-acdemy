import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Plus, Trash2, Repeat, CalendarDays, Loader2 } from "lucide-react";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", INR: "₹", AED: "د.إ", AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R", NGN: "₦",
};

interface BonusRow {
  id: string;
  amount: number;
  description: string | null;
}

interface StaffBonusEditorProps {
  staffId: string;
  currency: string;
  selectedMonth: Date;
  /** One-off bonus pay records for this staff in the selected month. */
  oneOffBonuses: BonusRow[];
  /** Recurring bonuses active for this staff in the selected month. */
  recurringBonuses: BonusRow[];
  /** Refresh parent payroll data after a change. */
  onChanged: () => void | Promise<void>;
}

export function StaffBonusEditor({
  staffId,
  currency,
  selectedMonth,
  oneOffBonuses,
  recurringBonuses,
  onChanged,
}: StaffBonusEditorProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const symbol = CURRENCY_SYMBOLS[currency] || "£";

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"oneoff" | "recurring">("oneoff");
  const [busy, setBusy] = useState(false);

  const fmtMoney = (n: number) => `${symbol}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const add = async () => {
    const amt = parseFloat(amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter a bonus amount", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      if (type === "recurring") {
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
      toast({ title: "Bonus added" });
      await onChanged();
    } catch (e: any) {
      toast({ title: "Could not add bonus", description: e.message ?? String(e), variant: "destructive" });
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

  const Row = ({ b, recurring }: { b: BonusRow; recurring: boolean }) => (
    <div className="flex items-center justify-between gap-2 rounded-md border bg-muted/30 px-2.5 py-1.5 max-w-full overflow-hidden">
      <div className="min-w-0 flex-1 flex items-baseline gap-2">
        <span className="text-sm font-semibold text-foreground whitespace-nowrap flex-shrink-0">{fmtMoney(b.amount)}</span>
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
        onClick={() => (recurring ? stopRecurring(b.id) : removeOneOff(b.id))}
        disabled={busy}
        title={recurring ? "Stop recurring bonus" : "Remove bonus"}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>
    </div>
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
            {oneOffBonuses.map(b => <Row key={b.id} b={b} recurring={false} />)}
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
            {recurringBonuses.map(b => <Row key={b.id} b={b} recurring={true} />)}
          </div>
        )}
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
            placeholder="0.00"
          />
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (visible to staff)"
            className="flex-1"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {/* One-month vs recurring toggle */}
          <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
            <button
              type="button"
              onClick={() => setType("oneoff")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                type === "oneoff" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> This month
            </button>
            <button
              type="button"
              onClick={() => setType("recurring")}
              className={cn(
                "flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors",
                type === "recurring" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground"
              )}
            >
              <Repeat className="h-3.5 w-3.5" /> Recurring
            </button>
          </div>

          <Button type="button" onClick={add} disabled={busy} size="sm">
            {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Plus className="h-4 w-4 mr-1.5" />}
            Add bonus
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {type === "recurring"
            ? "Applied every month from this month until you stop it."
            : `Applied to ${format(selectedMonth, "MMMM yyyy")} only.`}
        </p>
      </div>
    </div>
  );
}
