import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Minus } from "lucide-react";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

interface Entry { entry_date: string; gross_value: number; category_name: string | null }

/** A month key 'YYYY-MM', n months back from today (0 = this month). */
const monthKey = (back: number) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - back);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
};

export function ExpenseTrendPanel() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<{ at: string | null; status: string | null; detail: string | null }>({
    at: null, status: null, detail: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const since = monthKey(7) + "-01";
    const [{ data: rows }, { data: excl }, { data: meta }] = await Promise.all([
      (supabase as any).from("company_expense_entries")
        .select("entry_date, gross_value, category_name").gte("entry_date", since),
      (supabase as any).from("expense_category_exclusions").select("category_name"),
      (supabase as any).from("freeagent_oauth").select("last_sync_at, last_sync_status, last_sync_detail").eq("id", true).maybeSingle(),
    ]);
    setEntries((rows as Entry[]) || []);
    setExcluded(new Set(((excl as { category_name: string }[]) || []).map(e => e.category_name)));
    setLastSync({ at: meta?.last_sync_at ?? null, status: meta?.last_sync_status ?? null, detail: meta?.last_sync_detail ?? null });
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const refresh = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("freeagent-sync-expenses", { body: { months: 24 } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Expenses refreshed", description: `${(data as any)?.synced ?? 0} bank entries pulled from FreeAgent.` });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't refresh from FreeAgent", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  // Recent three months against the three before, per category. Money out only —
  // FreeAgent reports outgoings as negative, so flip the sign.
  const analysis = useMemo(() => {
    const recent = [monthKey(2), monthKey(1), monthKey(0)];
    const prior = [monthKey(5), monthKey(4), monthKey(3)];
    const byCat: Record<string, Record<string, number>> = {};

    entries.forEach(e => {
      const cat = e.category_name || "Uncategorised";
      if (excluded.has(cat)) return;
      const v = Number(e.gross_value);
      if (!(v < 0)) return;
      const k = String(e.entry_date).slice(0, 7);
      byCat[cat] ??= {};
      byCat[cat][k] = (byCat[cat][k] || 0) + -v;
    });

    const rows = Object.entries(byCat).map(([cat, months]) => {
      const avg = (keys: string[]) => keys.reduce((a, k) => a + (months[k] || 0), 0) / keys.length;
      const now = avg(recent);
      const before = avg(prior);
      const delta = now - before;
      const pct = before > 0 ? (delta / before) * 100 : now > 0 ? 100 : 0;
      return { cat, now, before, delta, pct, monthly: recent.map(k => months[k] || 0) };
    }).filter(r => r.now >= 5 || r.before >= 5)
      .sort((a, b) => b.now - a.now);

    return {
      rows, recent,
      total: rows.reduce((a, r) => a + r.now, 0),
      totalBefore: rows.reduce((a, r) => a + r.before, 0),
    };
  }, [entries, excluded]);

  const trendOf = (pct: number) =>
    pct > 8 ? { Icon: TrendingUp, cls: "text-amber-600", label: "up" }
      : pct < -8 ? { Icon: TrendingDown, cls: "text-emerald-600", label: "down" }
        : { Icon: Minus, cls: "text-muted-foreground", label: "steady" };

  const totalPct = analysis.totalBefore > 0
    ? ((analysis.total - analysis.totalBefore) / analysis.totalBefore) * 100 : 0;

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-sm">Typical monthly expenses</p>
            <p className="text-xs text-muted-foreground">
              Average of the last three months, against the three before it. Live from FreeAgent's explained bank entries.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {lastSync.at && (
              <span className="text-[11px] text-muted-foreground">
                {lastSync.status === "error" ? "Last sync failed" : "Synced"}{" "}
                {new Date(lastSync.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button size="sm" variant="outline" onClick={refresh} disabled={syncing}>
              {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              {syncing ? "Refreshing…" : "Refresh from FreeAgent"}
            </Button>
          </div>
        </div>

        {lastSync.status === "error" && lastSync.detail && (
          <p className="text-xs text-red-600 bg-red-500/5 border border-red-300/50 rounded-md px-3 py-2">
            {lastSync.detail}
          </p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : analysis.rows.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium">No expense data yet</p>
            <p>Hit “Refresh from FreeAgent” to pull your explained bank entries.</p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-2xl font-bold tabular-nums">{gbp(analysis.total)}</span>
              <span className="text-sm text-muted-foreground">typical month</span>
              <Badge variant="outline" className={cn("text-[10px]",
                totalPct > 8 ? "border-amber-300 text-amber-600"
                  : totalPct < -8 ? "border-emerald-300 text-emerald-600" : "")}>
                {totalPct >= 0 ? "+" : ""}{totalPct.toFixed(0)}% vs previous 3 months
              </Badge>
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Category</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px]">Typical /mo</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px]">Previous</th>
                    <th className="text-right font-medium px-3 py-2 w-[130px]">Trend</th>
                    {analysis.recent.map(k => (
                      <th key={k} className="text-right font-medium px-3 py-2 w-[90px]">{monthLabel(k)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {analysis.rows.map(r => {
                    const { Icon, cls } = trendOf(r.pct);
                    // A category swinging between zero and a large number can't be
                    // summarised by an average — flag it rather than implying stability.
                    const lumpy = Math.max(...r.monthly) > 0 && Math.min(...r.monthly) === 0;
                    return (
                      <tr key={r.cat} className="border-b last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-2 font-medium">
                          {r.cat}
                          {lumpy && <Badge variant="outline" className="ml-2 text-[9px] border-amber-300 text-amber-600">lumpy</Badge>}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">{gbp(r.now)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{gbp(r.before)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums", cls)}>
                          <span className="inline-flex items-center gap-1 justify-end">
                            <Icon className="h-3.5 w-3.5" />
                            {r.delta >= 0 ? "+" : "−"}{gbp(Math.abs(r.delta))}
                          </span>
                        </td>
                        {r.monthly.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                            {v > 0 ? gbp(v) : "—"}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Operating spend only. Transfers between your own accounts, VAT and Corporation Tax remittances, and
              salary, dividends and pension are excluded — the first isn't spend at all, and the rest are either lumpy
              tax payments or already counted as payroll and beneficial costs in the P&amp;L. A “lumpy” category was zero
              in at least one of the three months, so its average is a poor guide to any single month. The current month
              is still in progress, so it will read low until month end.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
