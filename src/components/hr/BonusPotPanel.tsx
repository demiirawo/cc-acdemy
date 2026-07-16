import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Coins, Loader2, ChevronDown, ChevronUp, AlertTriangle } from "lucide-react";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { PerformanceRankBadge, RANK_STYLES, type Rank } from "./PerformanceRankBadge";

// Points model (agreed proposal): each staff member's slice of the pot is
// proportional to (tenure points × rank multiplier). Longer tenure and higher
// rank compound into a larger share. The pot is fully distributed every month.
const RANK_MULT: Record<Rank, number> = { S: 2.0, A: 1.75, B: 1.5, C: 1.25, D: 1.0 };
const UNRATED_MULT = 1.5; // neutral (B-level) until assessed

const CURRENCY_SYMBOLS: Record<string, string> = {
  GBP: "£", USD: "$", EUR: "€", INR: "₹", AED: "د.إ", AUD: "A$", CAD: "C$", PHP: "₱", ZAR: "R", NGN: "₦",
};

export interface PotStaff {
  userId: string;
  displayName: string;
  currency: string;
  rank: Rank | null;
  years: number;
}

interface BonusPotPanelProps {
  staff: PotStaff[];
  selectedMonth: Date;
  /** Converts a GBP amount into the given currency (inverse of the payroll GBP conversion). */
  gbpToCurrency: (amountGbp: number, currency: string) => number;
  createdBy: string | undefined;
  /** Refresh the parent payroll data after distributing. */
  onDistributed: () => void | Promise<void>;
}

const pointsFor = (rank: Rank | null, years: number) =>
  (1 + Math.max(0, years)) * (rank && RANK_MULT[rank] ? RANK_MULT[rank] : UNRATED_MULT);

const fmtMoney = (amount: number, currency: string) =>
  `${CURRENCY_SYMBOLS[currency] || ""}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function BonusPotPanel({ staff, selectedMonth, gbpToCurrency, createdBy, onDistributed }: BonusPotPanelProps) {
  const { toast } = useToast();
  const [potInput, setPotInput] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [distributing, setDistributing] = useState(false);
  const [existing, setExisting] = useState<{ count: number; totalGbp: number } | null>(null);

  const monthLabel = format(selectedMonth, "MMM yyyy");
  const descriptionPrefix = `Bonus pot · ${monthLabel}`;
  const monthStartISO = format(startOfMonth(selectedMonth), "yyyy-MM-dd");
  const monthEndISO = format(endOfMonth(selectedMonth), "yyyy-MM-dd");

  const pot = Math.max(0, parseFloat(potInput) || 0);

  // Detect an existing pot distribution for this month (so re-running replaces it).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("staff_pay_records")
        .select("amount, currency")
        .eq("record_type", "bonus")
        .eq("pay_period_start", monthStartISO)
        .ilike("description", `${descriptionPrefix}%`);
      if (cancelled) return;
      if (data && data.length > 0) {
        // Stored amounts are per-currency; convert each back to GBP.
        // gbpToCurrency(1, cur) = 1/rate, so gbp = local / gbpToCurrency(1, cur).
        const gbp = data.reduce((sum, r) => {
          const inv = gbpToCurrency(1, r.currency) || 1;
          return sum + Number(r.amount) / inv;
        }, 0);
        setExisting({ count: data.length, totalGbp: gbp });
      } else {
        setExisting(null);
      }
    })();
    return () => { cancelled = true; };
  }, [monthStartISO, descriptionPrefix, gbpToCurrency]);

  // Compute each staff member's points and share of the pot (largest-remainder
  // in GBP so the shares sum to the pot exactly, then converted per currency).
  const rows = useMemo(() => {
    const withPoints = staff.map(s => ({ ...s, points: pointsFor(s.rank, s.years) }));
    const totalPoints = withPoints.reduce((sum, s) => sum + s.points, 0);
    if (totalPoints <= 0 || pot <= 0) {
      return { totalPoints, perPointGbp: 0, items: withPoints.map(s => ({ ...s, shareGbp: 0, shareLocal: 0 })) };
    }
    // Raw GBP shares, floored to pennies.
    const raw = withPoints.map(s => (pot * s.points) / totalPoints);
    const floored = raw.map(v => Math.floor(v * 100) / 100);
    let leftoverPennies = Math.round((pot - floored.reduce((a, b) => a + b, 0)) * 100);
    // Hand leftover pennies to the largest raw shares first.
    const order = raw.map((v, i) => i).sort((a, b) => raw[b] - raw[a]);
    const shareGbp = [...floored];
    for (let k = 0; k < leftoverPennies && k < order.length; k++) shareGbp[order[k]] += 0.01;
    return {
      totalPoints,
      perPointGbp: pot / totalPoints,
      items: withPoints.map((s, i) => ({
        ...s,
        shareGbp: shareGbp[i],
        shareLocal: Math.round(gbpToCurrency(shareGbp[i], s.currency) * 100) / 100,
      })),
    };
  }, [staff, pot, gbpToCurrency]);

  const sortedItems = useMemo(() => [...rows.items].sort((a, b) => b.points - a.points), [rows.items]);

  const distribute = async () => {
    if (!createdBy || pot <= 0) return;
    setDistributing(true);
    try {
      // Replace any prior pot distribution for this month.
      await supabase
        .from("staff_pay_records")
        .delete()
        .eq("record_type", "bonus")
        .eq("pay_period_start", monthStartISO)
        .ilike("description", `${descriptionPrefix}%`);

      const inserts = rows.items
        .filter(s => s.shareLocal > 0)
        .map(s => ({
          user_id: s.userId,
          record_type: "bonus" as const,
          amount: s.shareLocal,
          currency: s.currency,
          description: `${descriptionPrefix} (${s.rank ?? "unrated"} · ${s.years}y · ${s.points.toFixed(2)} pts)`,
          pay_date: monthEndISO,
          pay_period_start: monthStartISO,
          pay_period_end: monthEndISO,
          created_by: createdBy,
        }));

      if (inserts.length > 0) {
        const { error } = await supabase.from("staff_pay_records").insert(inserts);
        if (error) throw error;
      }

      toast({ title: "Bonus pot distributed", description: `£${pot.toLocaleString()} split across ${inserts.length} staff for ${monthLabel}.` });
      setConfirmOpen(false);
      setExisting({ count: inserts.length, totalGbp: pot });
      await onDistributed();
    } catch (e: any) {
      toast({ title: "Could not distribute pot", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setDistributing(false);
    }
  };

  return (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Coins className="h-5 w-5 text-amber-500" />
          Monthly Bonus Pot
        </CardTitle>
        <CardDescription>
          Enter a pot for {format(selectedMonth, "MMMM yyyy")} — it's split across all {staff.length} staff by tenure × performance rank. The whole pot is distributed, so you spend exactly what you put in.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Pot amount (£)</Label>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">£</span>
              <Input
                type="number"
                min="0"
                step="50"
                value={potInput}
                onChange={(e) => setPotInput(e.target.value)}
                placeholder="1000"
                className="w-36"
              />
            </div>
          </div>
          {pot > 0 && (
            <div className="text-sm text-muted-foreground pb-1.5">
              <span className="font-medium text-foreground">£{rows.perPointGbp.toFixed(2)}</span> per point ·{" "}
              <span className="font-medium text-foreground">{rows.totalPoints.toFixed(1)}</span> points across {staff.length} staff
            </div>
          )}
        </div>

        {existing && (
          <div className="flex items-start gap-2 rounded-md border border-amber-400/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              A pot of ~£{existing.totalGbp.toFixed(0)} has already been distributed to {existing.count} staff for {monthLabel}. Distributing again will <strong>replace</strong> it.
            </span>
          </div>
        )}

        {pot > 0 && (
          <>
            <div className="border rounded-md overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left font-medium px-3 py-2">Staff</th>
                    <th className="text-left font-medium px-3 py-2">Tenure</th>
                    <th className="text-right font-medium px-3 py-2">Points</th>
                    <th className="text-right font-medium px-3 py-2">Share (£)</th>
                    <th className="text-right font-medium px-3 py-2">Paid</th>
                  </tr>
                </thead>
                <tbody>
                  {(expanded ? sortedItems : sortedItems.slice(0, 6)).map((s) => (
                    <tr key={s.userId} className="border-t">
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <PerformanceRankBadge rank={s.rank} years={s.years} size="sm" />
                          <span className="font-medium truncate">{s.displayName}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {s.years} yr{s.years === 1 ? "" : "s"} · {s.rank ? RANK_STYLES[s.rank].label : "unrated"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.points.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">£{s.shareGbp.toFixed(2)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                        {s.currency === "GBP" ? "—" : fmtMoney(s.shareLocal, s.currency)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sortedItems.length > 6 && (
              <Button variant="ghost" size="sm" onClick={() => setExpanded(v => !v)} className="text-xs">
                {expanded ? <><ChevronUp className="h-3.5 w-3.5 mr-1" /> Show top 6</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" /> Show all {sortedItems.length}</>}
              </Button>
            )}
            <div className="flex justify-end">
              <Button onClick={() => setConfirmOpen(true)} disabled={pot <= 0 || distributing}>
                <Coins className="h-4 w-4 mr-1.5" />
                Distribute £{pot.toLocaleString()} to {format(selectedMonth, "MMMM")}
              </Button>
            </div>
          </>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Distribute the {monthLabel} bonus pot?</AlertDialogTitle>
            <AlertDialogDescription>
              This adds a "{descriptionPrefix}" bonus to {rows.items.filter(s => s.shareLocal > 0).length} staff for {format(selectedMonth, "MMMM yyyy")}, totalling £{pot.toLocaleString()}.
              {existing ? " It replaces the pot already distributed for this month." : ""} Each share is paid in the staff member's own currency.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={distributing}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void distribute(); }} disabled={distributing}>
              {distributing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Distributing…</> : "Distribute pot"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
