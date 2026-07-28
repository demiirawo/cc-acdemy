import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RefreshCw, Loader2, TrendingUp, TrendingDown, Minus, Check, Plus } from "lucide-react";

const gbp = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 2 }).format(n);
const gbp0 = (n: number) =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: "GBP", maximumFractionDigits: 0 }).format(n);

interface Txn {
  id: string; entry_date: string; amount: number; merchant: string; category_name: string | null;
}
interface ExpenseRow {
  id: string; name: string; amount_gbp: number; category: string; active: boolean;
  match_merchants: string[] | null;
}

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
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Plugs FreeAgent's bank feed into the existing expenses tracker at merchant level.
 * The tracker rows are named the way the owner thinks ("Claude", "G Suite"), and the
 * bank statement words them its own way ("ANTHROPIC", "GOOGLE IRELAND") — so each row
 * matches on its own name plus any extra terms recorded against it.
 */
export function ExpenseTrendPanel() {
  const { toast } = useToast();
  const [txns, setTxns] = useState<Txn[]>([]);
  const [rows, setRows] = useState<ExpenseRow[]>([]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [addingFor, setAddingFor] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState("");
  const [lastSync, setLastSync] = useState<{ at: string | null; status: string | null; detail: string | null }>({
    at: null, status: null, detail: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    const since = monthKey(5) + "-01";
    const [{ data: t }, { data: e }, { data: x }, { data: meta }] = await Promise.all([
      (supabase as any).from("company_bank_transactions")
        .select("id, entry_date, amount, merchant, category_name").gte("entry_date", since).lt("amount", 0),
      (supabase as any).from("expenses").select("id, name, amount_gbp, category, active, match_merchants"),
      (supabase as any).from("expense_category_exclusions").select("category_name"),
      (supabase as any).from("freeagent_oauth").select("last_sync_at, last_sync_status, last_sync_detail").eq("id", true).maybeSingle(),
    ]);
    setTxns((t as Txn[]) || []);
    setRows((e as ExpenseRow[]) || []);
    setExcluded(new Set(((x as { category_name: string }[]) || []).map(r => r.category_name)));
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
      toast({
        title: "Refreshed from FreeAgent",
        description: `${(data as any)?.transactions ?? 0} bank transactions pulled.`,
      });
      await load();
    } catch (err: any) {
      toast({ title: "Couldn't refresh from FreeAgent", description: String(err?.message ?? err), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const months = useMemo(() => [monthKey(2), monthKey(1), monthKey(0)], []);

  const matched = useMemo(() => {
    const spend = txns.filter(t => !(t.category_name && excluded.has(t.category_name)));
    const claimed = new Set<string>();

    const result = rows.filter(r => r.active).map(r => {
      const terms = [r.name, ...(r.match_merchants ?? [])].map(norm).filter(Boolean);
      const hits = spend.filter(t => {
        const m = norm(t.merchant);
        return terms.some(term => m.includes(term));
      });
      hits.forEach(h => claimed.add(h.id));

      const byMonth: Record<string, number> = {};
      hits.forEach(h => {
        const k = String(h.entry_date).slice(0, 7);
        byMonth[k] = (byMonth[k] || 0) + -Number(h.amount);
      });
      const monthly = months.map(k => byMonth[k] || 0);
      const seen = monthly.filter(v => v > 0).length;
      const actual = seen > 0 ? monthly.reduce((a, b) => a + b, 0) / seen : 0;
      const first = monthly[0], last = monthly[2];
      const pct = first > 0 ? ((last - first) / first) * 100 : last > 0 ? 100 : 0;

      return {
        row: r, hits: hits.length, monthly, actual, pct,
        merchants: Array.from(new Set(hits.map(h => h.merchant))).slice(0, 3),
        drift: actual > 0 ? actual - Number(r.amount_gbp) : 0,
      };
    });

    // Anything the tracker doesn't already claim, grouped by merchant — the gaps.
    const unclaimed: Record<string, { total: number; n: number; months: Set<string> }> = {};
    spend.filter(t => !claimed.has(t.id) && months.includes(String(t.entry_date).slice(0, 7)))
      .forEach(t => {
        const key = t.merchant.slice(0, 40);
        unclaimed[key] ??= { total: 0, n: 0, months: new Set() };
        unclaimed[key].total += -Number(t.amount);
        unclaimed[key].n += 1;
        unclaimed[key].months.add(String(t.entry_date).slice(0, 7));
      });

    const gaps = Object.entries(unclaimed)
      .map(([merchant, v]) => ({ merchant, perMonth: v.total / Math.max(1, v.months.size), n: v.n }))
      .filter(g => g.perMonth >= 5)
      .sort((a, b) => b.perMonth - a.perMonth)
      .slice(0, 12);

    return { result, gaps };
  }, [txns, rows, excluded, months]);

  const applyActual = async (id: string, actual: number) => {
    setApplying(id);
    const value = Math.round(actual * 100) / 100;
    setRows(prev => prev.map(r => r.id === id ? { ...r, amount_gbp: value } : r));
    const { error } = await (supabase as any).from("expenses")
      .update({ amount_gbp: value, updated_at: new Date().toISOString() }).eq("id", id);
    setApplying(null);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); load(); }
    else toast({ title: "Expense updated", description: "The P&L and profit figures now use this amount." });
  };

  const addAlias = async (id: string) => {
    const term = aliasDraft.trim();
    if (!term) { setAddingFor(null); return; }
    const row = rows.find(r => r.id === id);
    const next = [...(row?.match_merchants ?? []), term];
    setRows(prev => prev.map(r => r.id === id ? { ...r, match_merchants: next } : r));
    setAddingFor(null); setAliasDraft("");
    const { error } = await (supabase as any).from("expenses")
      .update({ match_merchants: next, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't save", description: error.message, variant: "destructive" }); load(); }
  };

  const trendOf = (pct: number) =>
    pct > 8 ? { Icon: TrendingUp, cls: "text-amber-600" }
      : pct < -8 ? { Icon: TrendingDown, cls: "text-emerald-600" }
        : { Icon: Minus, cls: "text-muted-foreground" };

  const trackedTotal = matched.result.reduce((a, m) => a + Number(m.row.amount_gbp), 0);
  const actualTotal = matched.result.reduce((a, m) => a + (m.actual || Number(m.row.amount_gbp)), 0);

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <p className="font-semibold text-sm">What you're actually being charged</p>
            <p className="text-xs text-muted-foreground">
              Your expenses matched to the bank feed by merchant, averaged over the months each one appeared in.
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
          <p className="text-xs text-red-600 bg-red-500/5 border border-red-300/50 rounded-md px-3 py-2">{lastSync.detail}</p>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
          </div>
        ) : txns.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            <p className="font-medium">No bank transactions yet</p>
            <p>Hit “Refresh from FreeAgent” to pull them in.</p>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-3 flex-wrap text-sm">
              <span>Tracked <strong className="tabular-nums">{gbp0(trackedTotal)}</strong>/mo</span>
              <span className="text-muted-foreground">·</span>
              <span>Actually charged <strong className="tabular-nums">{gbp0(actualTotal)}</strong>/mo</span>
              {Math.abs(actualTotal - trackedTotal) >= 1 && (
                <Badge variant="outline" className={cn("text-[10px]",
                  actualTotal > trackedTotal ? "border-amber-300 text-amber-600" : "border-emerald-300 text-emerald-600")}>
                  {actualTotal > trackedTotal ? "+" : "−"}{gbp0(Math.abs(actualTotal - trackedTotal))} vs tracked
                </Badge>
              )}
            </div>

            <div className="rounded-lg border overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Expense</th>
                    <th className="text-right font-medium px-3 py-2 w-[100px]">Tracked</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px]">Actual /mo</th>
                    {months.map(k => <th key={k} className="text-right font-medium px-3 py-2 w-[85px]">{monthLabel(k)}</th>)}
                    <th className="text-right font-medium px-3 py-2 w-[130px]">Trend</th>
                    <th className="w-[90px]" />
                  </tr>
                </thead>
                <tbody>
                  {matched.result.map(m => {
                    const { Icon, cls } = trendOf(m.pct);
                    const off = m.actual > 0 && Math.abs(m.drift) >= 1;
                    return (
                      <tr key={m.row.id} className="border-b last:border-0 hover:bg-muted/20 align-top">
                        <td className="px-3 py-2">
                          <div className="font-medium">{m.row.name}</div>
                          {m.hits === 0 ? (
                            addingFor === m.row.id ? (
                              <Input
                                autoFocus className="h-7 mt-1 text-xs" placeholder="Bank wording, e.g. GOOGLE"
                                value={aliasDraft} onChange={e => setAliasDraft(e.target.value)}
                                onBlur={() => addAlias(m.row.id)}
                                onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") { setAddingFor(null); setAliasDraft(""); } }}
                              />
                            ) : (
                              <button className="text-[11px] text-primary hover:underline inline-flex items-center gap-0.5"
                                onClick={() => { setAddingFor(m.row.id); setAliasDraft(""); }}>
                                <Plus className="h-3 w-3" /> no match — add bank wording
                              </button>
                            )
                          ) : (
                            <p className="text-[11px] text-muted-foreground truncate max-w-[240px]" title={m.merchants.join(", ")}>
                              {m.merchants.join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{gbp(Number(m.row.amount_gbp))}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-medium", off && "text-amber-600")}>
                          {m.actual > 0 ? gbp(m.actual) : "—"}
                        </td>
                        {m.monthly.map((v, i) => (
                          <td key={i} className="px-3 py-2 text-right tabular-nums text-muted-foreground text-xs">
                            {v > 0 ? gbp(v) : "—"}
                          </td>
                        ))}
                        <td className={cn("px-3 py-2 text-right tabular-nums text-xs", cls)}>
                          {m.actual > 0 ? (
                            <span className="inline-flex items-center gap-1 justify-end">
                              <Icon className="h-3.5 w-3.5" />{m.pct >= 0 ? "+" : ""}{m.pct.toFixed(0)}%
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {off && (
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]"
                              disabled={applying === m.row.id}
                              onClick={() => applyActual(m.row.id, m.actual)}>
                              {applying === m.row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Use</>}
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {matched.gaps.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold">Charges not in your tracker</p>
                <div className="flex flex-wrap gap-1.5">
                  {matched.gaps.map(g => (
                    <Badge key={g.merchant} variant="outline" className="text-[10px] font-normal">
                      {g.merchant} · {gbp0(g.perMonth)}/mo
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground">
              Matching is on the bank's own wording, so a row only pairs up when its name appears in the statement text
              — “add bank wording” records an alias for the ones that don't, like G Suite billing as GOOGLE. “Actual /mo”
              averages only the months a charge actually appeared, so an annual or quarterly bill isn't flattened into a
              misleadingly small monthly figure. <strong>Use</strong> writes that amount to the expense, which feeds
              straight into the P&amp;L and profit. Transfers between your own accounts and tax remittances are filtered out.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
