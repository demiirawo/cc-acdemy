import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffPayManager } from "../hr/StaffPayManager";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2 } from "lucide-react";

// GBP per 1 unit of currency (fallbacks; overridden by manual_currency_rates).
const FALLBACK_RATES: Record<string, number> = {
  GBP: 1, EUR: 0.85, USD: 0.79, INR: 0.0095, AED: 0.21, AUD: 0.52, CAD: 0.58, PHP: 0.014, ZAR: 0.044, NGN: 0.00052,
};
const gbp = (n: number) => `£${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const gbp2 = (n: number) => `£${(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${(n * 100).toFixed(0)}%`;

// Which processor a client's revenue flows through.
const processorOf = (software: string | null): "zoho" | "freeagent" | "other" => {
  const s = (software || "").trim().toLowerCase();
  if (s.startsWith("zoho")) return "zoho";
  if (s.startsWith("free")) return "freeagent";
  return "other";
};

interface ClientRow { id: string; name: string; mrr: number | null; software: string | null; status: string | null; }
interface StaffPay { user_id: string; base_salary: number; base_currency: string; }
interface HrRow { user_id: string; pay_frequency: string | null; employment_end_date: string | null; }
interface Profile { user_id: string; display_name: string | null; email: string | null; }
interface Assignment { staff_user_id: string; client_name: string | null; }
interface Expense { id: string; name: string; amount_gbp: number; category: string; vat_able: boolean | null; recurring: boolean; notes: string | null; active: boolean; }
interface Settings { vat_rate: number; corporation_tax_rate: number; monthly_growth_pct: number; projection_months: number; }

const monthlyFromFreq = (base: number, freq: string | null) => {
  const f = (freq || "monthly").toLowerCase();
  if (f === "annual" || f === "yearly") return base / 12;
  if (f === "weekly") return (base * 52) / 12;
  if (f === "fortnightly" || f === "biweekly") return (base * 26) / 12;
  return base; // monthly
};

const FINANCE_TABS = ["overview", "clients", "staff", "payroll", "expenses"];

export function FinanceSection() {
  const { isAdmin } = useUserRole();
  const { toast } = useToast();

  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState(FINANCE_TABS.includes(tabParam || "") ? (tabParam as string) : "overview");
  useEffect(() => {
    if (tabParam && FINANCE_TABS.includes(tabParam) && tabParam !== activeTab) setActiveTab(tabParam);
  }, [tabParam]);
  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  const [loading, setLoading] = useState(true);
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [pay, setPay] = useState<StaffPay[]>([]);
  const [hr, setHr] = useState<Record<string, HrRow>>({});
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [rates, setRates] = useState<Record<string, number>>(FALLBACK_RATES);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [settings, setSettings] = useState<Settings>({ vat_rate: 0.2, corporation_tax_rate: 0.19, monthly_growth_pct: 0, projection_months: 6 });

  const load = useCallback(async () => {
    setLoading(true);
    const [cl, sp, hrp, pr, asg, rt, ex, st] = await Promise.all([
      supabase.from("clients").select("id, name, mrr, software, status"),
      (supabase as any).from("staff_salaries").select("user_id, base_salary, base_currency"),
      supabase.from("hr_profiles").select("user_id, pay_frequency, employment_end_date"),
      supabase.from("profiles").select("user_id, display_name, email"),
      (supabase as any).from("staff_client_assignments").select("staff_user_id, client_name"),
      (supabase as any).from("manual_currency_rates").select("currency_code, rate_to_gbp"),
      (supabase as any).from("expenses").select("*").order("sort_order"),
      (supabase as any).from("finance_settings").select("*").maybeSingle(),
    ]);
    setClients((cl.data as ClientRow[]) || []);
    setPay(((sp.data as StaffPay[]) || []).filter(s => (s.base_salary ?? 0) > 0));
    const hrMap: Record<string, HrRow> = {}; ((hrp.data as HrRow[]) || []).forEach(h => { hrMap[h.user_id] = h; }); setHr(hrMap);
    const pMap: Record<string, Profile> = {}; ((pr.data as Profile[]) || []).forEach(p => { pMap[p.user_id] = p; }); setProfiles(pMap);
    setAssignments((asg.data as Assignment[]) || []);
    const r: Record<string, number> = { ...FALLBACK_RATES };
    ((rt.data as any[]) || []).forEach(x => { if (x.rate_to_gbp) r[x.currency_code] = Number(x.rate_to_gbp); });
    setRates(r);
    setExpenses((ex.data as Expense[]) || []);
    if (st.data) setSettings({
      vat_rate: Number(st.data.vat_rate), corporation_tax_rate: Number(st.data.corporation_tax_rate),
      monthly_growth_pct: Number(st.data.monthly_growth_pct), projection_months: Number(st.data.projection_months),
    });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // ---- Core computations -----------------------------------------------------
  const model = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    const activeStaff = pay.filter(s => {
      const h = hr[s.user_id];
      return !h?.employment_end_date || h.employment_end_date >= today;
    });
    const staffCostByUser: Record<string, number> = {};
    activeStaff.forEach(s => {
      const monthlyNative = monthlyFromFreq(s.base_salary, hr[s.user_id]?.pay_frequency ?? "monthly");
      const rate = rates[s.base_currency] ?? 1;
      staffCostByUser[s.user_id] = monthlyNative * (rate > 0 ? rate : 1);
    });
    const payrollCost = Object.values(staffCostByUser).reduce((a, b) => a + b, 0);

    const withMrr = clients.filter(c => (c.mrr ?? 0) > 0);
    const revZoho = withMrr.filter(c => processorOf(c.software) === "zoho").reduce((a, c) => a + Number(c.mrr), 0);
    const revFree = withMrr.filter(c => processorOf(c.software) === "freeagent").reduce((a, c) => a + Number(c.mrr), 0);
    const revOther = withMrr.filter(c => processorOf(c.software) === "other").reduce((a, c) => a + Number(c.mrr), 0);
    const revenue = revZoho + revFree + revOther;

    const businessExp = expenses.filter(e => e.active && e.category === "Business Cost").reduce((a, e) => a + Number(e.amount_gbp), 0);
    const beneficialExp = expenses.filter(e => e.active && e.category === "Beneficial Cost").reduce((a, e) => a + Number(e.amount_gbp), 0);
    const otherExp = expenses.filter(e => e.active && e.category !== "Business Cost" && e.category !== "Beneficial Cost").reduce((a, e) => a + Number(e.amount_gbp), 0);
    const opExpenses = businessExp + otherExp;                 // running the business
    const totalCost = payrollCost + opExpenses + beneficialExp;
    const netProfit = revenue - totalCost;
    const margin = revenue > 0 ? netProfit / revenue : 0;

    // UK tax estimate: Zoho is personal (Dubai, tax-free); FreeAgent is the UK company.
    // Approximate UK taxable profit = FreeAgent revenue − all costs (conservative).
    const ukProfit = revFree + revOther - totalCost;
    const corpTax = Math.max(0, ukProfit) * settings.corporation_tax_rate;
    const afterTaxNet = revZoho + (ukProfit - corpTax);

    // Per-client profit (cost allocated pro-rata to revenue share).
    const clientRows = withMrr.map(c => {
      const mrr = Number(c.mrr);
      const share = revenue > 0 ? mrr / revenue : 0;
      const profit = mrr - share * totalCost;
      return { ...c, mrr, processor: processorOf(c.software), profit, margin: mrr > 0 ? profit / mrr : 0 };
    }).sort((a, b) => b.profit - a.profit);

    // Per-staff contribution: split each client's MRR across its assigned staff.
    const clientByName: Record<string, number> = {};
    withMrr.forEach(c => { clientByName[c.name.trim().toLowerCase()] = Number(c.mrr); });
    const staffForClient: Record<string, string[]> = {};
    assignments.forEach(a => {
      const key = (a.client_name || "").trim().toLowerCase();
      if (!key) return;
      (staffForClient[key] ||= []).push(a.staff_user_id);
    });
    const revByStaff: Record<string, number> = {};
    Object.entries(clientByName).forEach(([key, mrr]) => {
      const team = staffForClient[key];
      if (team && team.length) { const each = mrr / team.length; team.forEach(u => { revByStaff[u] = (revByStaff[u] || 0) + each; }); }
    });
    const staffRows = activeStaff.map(s => {
      const cost = staffCostByUser[s.user_id] || 0;
      const attributed = revByStaff[s.user_id] || 0;
      const clientCount = Object.entries(staffForClient).filter(([, team]) => team.includes(s.user_id)).length;
      return {
        user_id: s.user_id,
        name: profiles[s.user_id]?.display_name || profiles[s.user_id]?.email || "Staff",
        cost, attributed, clientCount, net: attributed - cost,
      };
    }).sort((a, b) => b.net - a.net);

    return {
      payrollCost, revenue, revZoho, revFree, revOther, businessExp, beneficialExp, otherExp, opExpenses,
      totalCost, netProfit, margin, corpTax, afterTaxNet, ukProfit,
      zohoCount: withMrr.filter(c => processorOf(c.software) === "zoho").length,
      freeCount: withMrr.filter(c => processorOf(c.software) === "freeagent").length,
      clientRows, staffRows, activeStaffCount: activeStaff.length,
    };
  }, [clients, pay, hr, profiles, assignments, rates, expenses, settings]);

  // Projection over the coming months.
  const projection = useMemo(() => {
    const g = settings.monthly_growth_pct / 100;
    const fixed = model.totalCost;
    const now = new Date();
    return Array.from({ length: Math.max(1, settings.projection_months) }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const rev = model.revenue * Math.pow(1 + g, i);
      return { label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), rev, cost: fixed, net: rev - fixed };
    });
  }, [model, settings]);

  const saveSetting = async (patch: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...patch }));
    await (supabase as any).from("finance_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  };

  if (loading) return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading finance…</div>;
  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">You do not have permission to view this page.</div>;

  const netTone = model.netProfit >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className={cn(activeTab === "payroll" ? "w-full" : "max-w-7xl mx-auto", "space-y-4")}>
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground text-sm">Profitability, revenue by processor, per-client & per-staff contribution, expenses and projections.</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly revenue</p><p className="text-2xl font-bold tabular-nums">{gbp(model.revenue)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly costs</p><p className="text-2xl font-bold tabular-nums">{gbp(model.totalCost)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Net profit / mo</p><p className={cn("text-2xl font-bold tabular-nums", netTone)}>{gbp(model.netProfit)}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Margin</p><p className={cn("text-2xl font-bold tabular-nums", netTone)}>{pct(model.margin)}</p></CardContent></Card>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-5 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="staff">Staff</TabsTrigger>
            <TabsTrigger value="payroll">Payroll</TabsTrigger>
            <TabsTrigger value="expenses">Expenses</TabsTrigger>
          </TabsList>

          {/* ---- Overview ---- */}
          <TabsContent value="overview" className="space-y-4 mt-0">
            {/* Revenue by processor */}
            <div className="grid md:grid-cols-2 gap-3">
              <Card className="border-emerald-300/40">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">Zoho — Dubai (tax-free)</p>
                    <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">{model.zohoCount} clients</Badge>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{gbp(model.revZoho)}<span className="text-sm font-normal text-muted-foreground"> /mo</span></p>
                  <p className="text-xs text-muted-foreground">Paid into your personal Dubai account — kept in full, no UK tax.</p>
                </CardContent>
              </Card>
              <Card className="border-blue-300/40">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">FreeAgent — UK company (taxable)</p>
                    <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">{model.freeCount} clients</Badge>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{gbp(model.revFree)}<span className="text-sm font-normal text-muted-foreground"> /mo</span></p>
                  <p className="text-xs text-muted-foreground">UK-invoiced — subject to VAT ({pct(settings.vat_rate)}) and Corporation Tax ({pct(settings.corporation_tax_rate)}).</p>
                </CardContent>
              </Card>
            </div>

            {/* Monthly P&L */}
            <Card>
              <CardContent className="p-5 space-y-1.5 text-sm">
                <p className="font-semibold mb-1">Monthly profit &amp; loss (UK company — FreeAgent only)</p>
                <Line label="Revenue — FreeAgent" value={model.revFree} />
                {model.revOther > 0 && <Line label="Revenue — other" value={model.revOther} />}
                <Line label="Total revenue" value={model.revFree + model.revOther} strong />
                <div className="border-t my-1.5" />
                <Line label={`Payroll — ${model.activeStaffCount} staff (live)`} value={-model.payrollCost} />
                <Line label="Business expenses" value={-model.opExpenses} />
                <Line label="Beneficial costs (owner salary, dividends, pension…)" value={-model.beneficialExp} />
                <Line label="Total costs" value={-model.totalCost} strong />
                <div className="border-t my-1.5" />
                <Line label="Net profit (before UK tax)" value={model.ukProfit} strong tone />
                <div className="border-t my-1.5" />
                <Line label={`Est. UK Corporation Tax (${pct(settings.corporation_tax_rate)} on UK profit)`} value={-model.corpTax} />
                <Line label="Net profit after UK tax" value={model.ukProfit - model.corpTax} strong tone />
                <p className="text-[11px] text-muted-foreground pt-2">
                  Estimate only. This P&amp;L covers the UK company (FreeAgent) only — Zoho income is personal (Dubai account, tax-free) and shown separately above, not mixed into this table. VAT on FreeAgent invoices is collected from clients and passed to HMRC, so it isn't a cost here.
                </p>
              </CardContent>
            </Card>

            {/* Assumptions */}
            <Card>
              <CardContent className="p-4">
                <p className="font-semibold text-sm mb-2">Assumptions</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <SettingField label="VAT rate %" value={settings.vat_rate * 100} onSave={v => saveSetting({ vat_rate: v / 100 })} />
                  <SettingField label="Corp. tax %" value={settings.corporation_tax_rate * 100} onSave={v => saveSetting({ corporation_tax_rate: v / 100 })} />
                  <SettingField label="MRR growth %/mo" value={settings.monthly_growth_pct} onSave={v => saveSetting({ monthly_growth_pct: v })} />
                  <SettingField label="Projection months" value={settings.projection_months} step={1} onSave={v => saveSetting({ projection_months: Math.max(1, Math.round(v)) })} />
                </div>
              </CardContent>
            </Card>

            {/* Projection */}
            <Card>
              <CardContent className="p-0">
                <div className="px-5 pt-4 pb-2"><p className="font-semibold text-sm">Projected profitability</p></div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-y bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                        <th className="text-left font-medium px-4 py-2">Month</th>
                        <th className="text-right font-medium px-4 py-2">Revenue</th>
                        <th className="text-right font-medium px-4 py-2">Costs</th>
                        <th className="text-right font-medium px-4 py-2">Net profit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {projection.map((m, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="px-4 py-2">{m.label}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{gbp(m.rev)}</td>
                          <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{gbp(m.cost)}</td>
                          <td className={cn("px-4 py-2 text-right tabular-nums font-medium", m.net >= 0 ? "text-emerald-600" : "text-red-600")}>{gbp(m.net)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---- Clients ---- */}
          <TabsContent value="clients" className="mt-0">
            <div className="rounded-lg border overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Client</th>
                    <th className="text-left font-medium px-3 py-2 w-[120px]">Processor</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px]">MRR</th>
                    <th className="text-right font-medium px-3 py-2 w-[120px]">Est. profit</th>
                    <th className="text-right font-medium px-3 py-2 w-[90px]">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {model.clientRows.map(c => (
                    <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{c.name}</td>
                      <td className="px-3 py-2">
                        {c.processor === "zoho" ? <Badge variant="outline" className="text-[10px] border-emerald-300 text-emerald-600">Zoho</Badge>
                          : c.processor === "freeagent" ? <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">FreeAgent</Badge>
                          : <Badge variant="outline" className="text-[10px]">Other</Badge>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{gbp2(c.mrr)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium", c.profit >= 0 ? "text-emerald-600" : "text-red-600")}>{gbp2(c.profit)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums", c.margin >= 0 ? "text-muted-foreground" : "text-red-600")}>{pct(c.margin)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">Profit allocates total monthly cost (payroll + expenses) across clients in proportion to revenue.</p>
            </div>
          </TabsContent>

          {/* ---- Staff ---- */}
          <TabsContent value="staff" className="mt-0">
            <div className="rounded-lg border overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-3 py-2">Staff</th>
                    <th className="text-right font-medium px-3 py-2 w-[90px]">Clients</th>
                    <th className="text-right font-medium px-3 py-2 w-[130px]">Revenue attributed</th>
                    <th className="text-right font-medium px-3 py-2 w-[110px]">Cost /mo</th>
                    <th className="text-right font-medium px-3 py-2 w-[130px]">Net contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {model.staffRows.map(s => (
                    <tr key={s.user_id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{s.clientCount || "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{gbp2(s.attributed)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{gbp2(s.cost)}</td>
                      <td className={cn("px-3 py-2 text-right tabular-nums font-medium", s.net >= 0 ? "text-emerald-600" : "text-red-600")}>{gbp2(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">Revenue is attributed by splitting each client's MRR across the staff assigned to it. Cost is each staff member's monthly pay in GBP.</p>
            </div>
          </TabsContent>

          {/* ---- Payroll ---- */}
          <TabsContent value="payroll" className="mt-0">
            <StaffPayManager />
          </TabsContent>

          {/* ---- Expenses ---- */}
          <TabsContent value="expenses" className="mt-0">
            <ExpensesTable expenses={expenses} setExpenses={setExpenses} reload={load} toast={toast} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function Line({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: boolean }) {
  const neg = value < 0;
  const toneCls = tone ? (value >= 0 ? "text-emerald-600" : "text-red-600") : "";
  return (
    <div className={cn("flex items-center justify-between gap-3", strong && "font-semibold")}>
      <span className={cn(strong ? "text-foreground" : "text-muted-foreground")}>{label}</span>
      <span className={cn("tabular-nums", toneCls)}>{neg ? `−${gbp2(Math.abs(value))}` : gbp2(value)}</span>
    </div>
  );
}

function SettingField({ label, value, onSave, step }: { label: string; value: number; onSave: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <Input type="number" step={step ?? 0.5} defaultValue={value} className="h-8"
        onBlur={e => { const v = parseFloat(e.target.value); if (!isNaN(v) && v !== value) onSave(v); }} />
    </div>
  );
}

// ---- Expenses CRUD table ----
const EXP_CATEGORIES = ["Business Cost", "Beneficial Cost", "Other"];
function ExpensesTable({ expenses, setExpenses, reload, toast }: {
  expenses: Expense[]; setExpenses: (fn: (p: Expense[]) => Expense[]) => void; reload: () => void; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [edit, setEdit] = useState<{ id: string; field: string } | null>(null);

  const patch = async (id: string, p: Partial<Expense>) => {
    setExpenses(prev => prev.map(e => e.id === id ? { ...e, ...p } : e));
    setEdit(null);
    const { error } = await (supabase as any).from("expenses").update({ ...p, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't update", description: error.message, variant: "destructive" }); reload(); }
  };
  const add = async () => {
    const { data, error } = await (supabase as any).from("expenses").insert({ name: "New expense", amount_gbp: 0, category: "Business Cost" }).select("*").single();
    if (error) { toast({ title: "Couldn't add", description: error.message, variant: "destructive" }); return; }
    setExpenses(prev => [...prev, data as Expense]);
  };
  const remove = async (id: string) => {
    setExpenses(prev => prev.filter(e => e.id !== id));
    await (supabase as any).from("expenses").delete().eq("id", id);
  };

  const total = expenses.filter(e => e.active).reduce((a, e) => a + Number(e.amount_gbp), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Recurring monthly costs. Payroll is computed separately from staff pay.</p>
        <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add expense</Button>
      </div>
      <div className="rounded-lg border overflow-x-auto bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium px-3 py-2">Name</th>
              <th className="text-left font-medium px-3 py-2 w-[160px]">Category</th>
              <th className="text-right font-medium px-3 py-2 w-[130px]">Amount /mo</th>
              <th className="text-center font-medium px-3 py-2 w-[80px]">VAT-able</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          <tbody>
            {expenses.map(e => (
              <tr key={e.id} className={cn("border-b last:border-0 hover:bg-muted/30", !e.active && "opacity-50")}>
                <td className="px-3 py-2 font-medium cursor-text" onDoubleClick={() => setEdit({ id: e.id, field: "name" })}>
                  {edit?.id === e.id && edit.field === "name" ? (
                    <Input autoFocus defaultValue={e.name} className="h-8"
                      onBlur={ev => patch(e.id, { name: ev.target.value.trim() || e.name })}
                      onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEdit(null); }} />
                  ) : e.name}
                </td>
                <td className="px-3 py-2">
                  {edit?.id === e.id && edit.field === "category" ? (
                    <Select defaultOpen value={e.category} onValueChange={v => patch(e.id, { category: v })} onOpenChange={o => { if (!o) setEdit(null); }}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{EXP_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <span className="cursor-pointer text-muted-foreground" onClick={() => setEdit({ id: e.id, field: "category" })}>{e.category}</span>}
                </td>
                <td className="px-3 py-2 text-right cursor-text" onDoubleClick={() => setEdit({ id: e.id, field: "amount" })}>
                  {edit?.id === e.id && edit.field === "amount" ? (
                    <Input autoFocus type="number" step="0.01" defaultValue={e.amount_gbp} className="h-8 text-right"
                      onBlur={ev => patch(e.id, { amount_gbp: parseFloat(ev.target.value) || 0 })}
                      onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEdit(null); }} />
                  ) : <span className="tabular-nums">{gbp2(Number(e.amount_gbp))}</span>}
                </td>
                <td className="px-3 py-2 text-center text-muted-foreground">{e.vat_able === true ? "Yes" : e.vat_able === false ? "No" : "—"}</td>
                <td className="px-2 py-2 text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader><AlertDialogTitle>Delete "{e.name}"?</AlertDialogTitle><AlertDialogDescription>This expense will be removed from the finance model.</AlertDialogDescription></AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => remove(e.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </td>
              </tr>
            ))}
            <tr className="bg-muted/30 font-semibold">
              <td className="px-3 py-2" colSpan={2}>Total (excl. payroll)</td>
              <td className="px-3 py-2 text-right tabular-nums">{gbp2(total)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">Double-click name or amount to edit · click the category to change it.</p>
      </div>
    </div>
  );
}
