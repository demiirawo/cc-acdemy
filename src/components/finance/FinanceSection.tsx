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
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, Lock } from "lucide-react";
import { ComposedChart, Area, Line as RLine, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

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

// Sales stage — only "active" clients count toward every revenue figure below.
const SALES_STAGES = [
  { value: "active", label: "Active", cls: "border-emerald-300 text-emerald-600" },
  { value: "pending", label: "Pending", cls: "border-amber-300 text-amber-600" },
  { value: "inactive", label: "Inactive / Churned", cls: "border-muted-foreground/30 text-muted-foreground" },
];
const stageMeta = (v: string | null) => SALES_STAGES.find(s => s.value === (v || "active")) ?? SALES_STAGES[0];

interface ClientRow { id: string; name: string; mrr: number | null; software: string | null; status: string | null; contract_start_date: string | null; }
interface StaffPay { user_id: string; base_salary: number; base_currency: string; }
interface HrRow { user_id: string; pay_frequency: string | null; employment_end_date: string | null; }
interface Profile { user_id: string; display_name: string | null; email: string | null; }
interface Assignment { staff_user_id: string; client_name: string | null; }
interface Expense { id: string; name: string; amount_gbp: number; category: string; vat_able: boolean | null; recurring: boolean; notes: string | null; active: boolean; }
interface Settings { vat_rate: number; corporation_tax_rate: number; monthly_growth_pct: number; projection_months: number; }
interface PayAdjustment { user_id: string; record_type: string; amount: number; currency: string; }
interface ShiftPattern { user_id: string; client_name: string | null; days_of_week: string[] | null; start_time: string | null; end_time: string | null; recurrence_interval: string | null; is_overtime: boolean | null; }

// Overtime hours are weighted heavier than regular hours when allocating cost &
// revenue, reflecting their premium cost and the extra effort a client demands.
const OVERTIME_WEIGHT = 1.5;
const WEEKS_PER_MONTH = 52 / 12;      // 4.333…
const FORTNIGHTS_PER_MONTH = 26 / 12; // 2.166…

// A recurring shift pattern → the monthly "effort hours" it represents. Effort
// hours = clock hours × occurrences-per-month × (overtime ? 1.5 : 1). This is the
// currency we split each admin's cost and each client's revenue by.
const patternEffortHours = (p: ShiftPattern): number => {
  const parse = (t: string | null) => { const [h, m] = (t || "0:0").split(":").map(Number); return (h || 0) + (m || 0) / 60; };
  let dur = parse(p.end_time) - parse(p.start_time);
  if (dur <= 0) dur += 24; // overnight shift wraps past midnight
  const days = Math.max(1, p.days_of_week?.length || 0);
  const iv = (p.recurrence_interval || "weekly").toLowerCase();
  const occ = iv === "biweekly" ? days * FORTNIGHTS_PER_MONTH
    : iv === "daily" ? 7 * WEEKS_PER_MONTH
    : iv === "one_off" ? days              // sporadic overtime — counts once this month
    : days * WEEKS_PER_MONTH;              // weekly (default)
  const hours = dur * occ;
  return hours * (p.is_overtime ? OVERTIME_WEIGHT : 1);
};

const monthlyFromFreq = (base: number, freq: string | null) => {
  const f = (freq || "monthly").toLowerCase();
  if (f === "annual" || f === "yearly") return base / 12;
  if (f === "weekly") return (base * 52) / 12;
  if (f === "fortnightly" || f === "biweekly") return (base * 26) / 12;
  return base; // monthly
};

const FINANCE_TABS = ["overview", "clients", "staff", "payroll", "expenses"];

const FINANCE_PASSCODE = "4210";
const FINANCE_UNLOCK_KEY = "finance-unlocked";

export function FinanceSection() {
  const { isAdmin } = useUserRole();
  const { toast } = useToast();

  const [unlocked, setUnlocked] = useState(() => sessionStorage.getItem(FINANCE_UNLOCK_KEY) === "1");

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
  const [payAdjustments, setPayAdjustments] = useState<PayAdjustment[]>([]);
  const [patterns, setPatterns] = useState<ShiftPattern[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const [cl, sp, hrp, pr, asg, rt, ex, st, pr2, pat] = await Promise.all([
      supabase.from("clients").select("id, name, mrr, software, status, contract_start_date"),
      (supabase as any).from("staff_salaries").select("user_id, base_salary, base_currency"),
      supabase.from("hr_profiles").select("user_id, pay_frequency, employment_end_date"),
      supabase.from("profiles").select("user_id, display_name, email"),
      (supabase as any).from("staff_client_assignments").select("staff_user_id, client_name"),
      (supabase as any).from("manual_currency_rates").select("currency_code, rate_to_gbp"),
      (supabase as any).from("expenses").select("*").order("sort_order"),
      (supabase as any).from("finance_settings").select("*").maybeSingle(),
      // This month's bonus pot / manual bonuses / overtime / deductions — the same
      // records the Payroll tab's "Total Payroll" figure is built from, so the two
      // stay in sync instead of Finance re-deriving base salary alone.
      (supabase as any).from("staff_pay_records").select("user_id, record_type, amount, currency")
        .gte("pay_period_start", monthStart).lt("pay_period_start", monthEnd),
      // Recurring shift patterns active this month — the schedule that tells us how each
      // admin's time is split across clients, so cost & revenue follow the actual work.
      (supabase as any).from("recurring_shift_patterns")
        .select("user_id, client_name, days_of_week, start_time, end_time, recurrence_interval, is_overtime")
        .lte("start_date", monthEnd).or(`end_date.is.null,end_date.gte.${monthStart}`),
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
    setPayAdjustments((pr2.data as PayAdjustment[]) || []);
    setPatterns((pat.data as ShiftPattern[]) || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  // Keep the P&L's payroll line live: StaffPayManager (Payroll tab) writes every
  // bonus pot recalc, manual bonus/overtime/deduction straight to staff_pay_records,
  // so a realtime subscription here means edits made there don't need a page reload.
  const refreshPayAdjustments = useCallback(async () => {
    const now = new Date();
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 10);
    const { data } = await (supabase as any).from("staff_pay_records").select("user_id, record_type, amount, currency")
      .gte("pay_period_start", monthStart).lt("pay_period_start", monthEnd);
    setPayAdjustments((data as PayAdjustment[]) || []);
  }, []);
  useEffect(() => {
    const channel = supabase
      .channel("finance-payroll-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff_pay_records" }, () => { refreshPayAdjustments(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [refreshPayAdjustments]);

  const patchClient = async (id: string, patch: Partial<ClientRow>) => {
    setClients(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    const { error } = await (supabase as any).from("clients").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast({ title: "Couldn't update client", description: error.message, variant: "destructive" }); load(); }
  };

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
    // Fold in this month's bonus pot / manual bonuses / overtime / deductions — the
    // same records the Payroll tab totals, so the two don't drift apart.
    payAdjustments.forEach(a => {
      const rate = rates[a.currency] ?? 1;
      const gbpAmount = Number(a.amount) * (rate > 0 ? rate : 1);
      const signed = a.record_type === "deduction" ? -gbpAmount : gbpAmount;
      staffCostByUser[a.user_id] = (staffCostByUser[a.user_id] || 0) + signed;
    });
    const payrollCost = Object.values(staffCostByUser).reduce((a, b) => a + b, 0);

    // Only clients at the "Active" sales stage count toward revenue — Pending /
    // Inactive stages are tracked but excluded from every figure below.
    const withMrr = clients.filter(c => (c.mrr ?? 0) > 0 && (c.status ?? "active") === "active");
    const vatDivisor = 1 + settings.vat_rate;
    // FreeAgent MRR is what the client is invoiced — VAT-inclusive. Back the VAT out
    // to get real revenue. Zoho is a personal Dubai account, outside the UK VAT
    // scheme, so it needs no adjustment.
    const netOf = (c: ClientRow) => processorOf(c.software) === "freeagent" ? Number(c.mrr) / vatDivisor : Number(c.mrr);
    const revZoho = withMrr.filter(c => processorOf(c.software) === "zoho").reduce((a, c) => a + Number(c.mrr), 0);
    const revFreeGross = withMrr.filter(c => processorOf(c.software) === "freeagent").reduce((a, c) => a + Number(c.mrr), 0);
    const revFree = revFreeGross / vatDivisor; // ex-VAT — the real revenue figure
    const revFreeVat = revFreeGross - revFree;
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
    // revFree is already ex-VAT, so this is a clean estimate of taxable UK profit.
    const ukProfit = revFree + revOther - totalCost;
    const corpTax = Math.max(0, ukProfit) * settings.corporation_tax_rate;
    const afterTaxNet = revZoho + (ukProfit - corpTax);

    // Per-client profit (cost allocated pro-rata to each client's ex-VAT revenue share).
    const clientRows = withMrr.map(c => {
      const mrrGross = Number(c.mrr);
      const netRevenue = netOf(c);
      const share = revenue > 0 ? netRevenue / revenue : 0;
      const profit = netRevenue - share * totalCost;
      return { ...c, mrr: mrrGross, netRevenue, processor: processorOf(c.software), profit, margin: netRevenue > 0 ? profit / netRevenue : 0 };
    }).sort((a, b) => b.profit - a.profit);

    // ---- Per-staff contribution, allocated by the schedule ------------------
    // How each admin's month splits across clients, in weighted "effort hours"
    // (overtime counts 1.5×). This is the basis for both revenue attribution and
    // cost allocation, so both follow the work actually done — and a client shared
    // by several admins splits proportionally to the hours each puts in.
    const hoursStaffClient: Record<string, Record<string, number>> = {};
    const hoursStaffTotal: Record<string, number> = {};
    patterns.forEach(p => {
      if (!p.user_id || !p.client_name) return;
      const eff = patternEffortHours(p);
      if (eff <= 0) return;
      const key = p.client_name.trim().toLowerCase();
      (hoursStaffClient[p.user_id] ||= {});
      hoursStaffClient[p.user_id][key] = (hoursStaffClient[p.user_id][key] || 0) + eff;
      hoursStaffTotal[p.user_id] = (hoursStaffTotal[p.user_id] || 0) + eff;
    });

    // Explicit assignments — the fallback split when a client has no scheduled hours.
    const staffForClient: Record<string, string[]> = {};
    assignments.forEach(a => {
      const key = (a.client_name || "").trim().toLowerCase();
      if (!key) return;
      (staffForClient[key] ||= []).push(a.staff_user_id);
    });

    // Split each active client's ex-VAT revenue across its team, weighted by hours
    // (falling back to an equal split among assigned staff when the schedule is silent).
    const revByStaff: Record<string, number> = {};
    const clientTeamCount: Record<string, number> = {};   // # admins sharing each client
    withMrr.forEach(c => {
      const key = c.name.trim().toLowerCase();
      const net = netOf(c);
      const team: { u: string; w: number }[] = [];
      Object.entries(hoursStaffClient).forEach(([u, m]) => { if ((m[key] || 0) > 0) team.push({ u, w: m[key] }); });
      const usingSchedule = team.length > 0;
      const roster = usingSchedule ? team : (staffForClient[key] || []).map(u => ({ u, w: 1 }));
      clientTeamCount[key] = roster.length;
      const totalW = roster.reduce((a, t) => a + t.w, 0);
      if (totalW > 0) roster.forEach(t => { revByStaff[t.u] = (revByStaff[t.u] || 0) + net * (t.w / totalW); });
    });

    // Which clients each staff member touches (scheduled hours ∪ explicit assignment).
    const clientsForStaff: Record<string, Set<string>> = {};
    Object.entries(hoursStaffClient).forEach(([u, m]) => { (clientsForStaff[u] ||= new Set()); Object.keys(m).forEach(k => clientsForStaff[u].add(k)); });
    Object.entries(staffForClient).forEach(([key, team]) => team.forEach(u => { (clientsForStaff[u] ||= new Set()).add(key); }));

    const staffRows = activeStaff.map(s => {
      const cost = staffCostByUser[s.user_id] || 0;
      const attributed = revByStaff[s.user_id] || 0;
      const hours = hoursStaffTotal[s.user_id] || 0;
      const clientCount = clientsForStaff[s.user_id]?.size || 0;
      return {
        user_id: s.user_id,
        name: profiles[s.user_id]?.display_name || profiles[s.user_id]?.email || "Staff",
        cost, attributed, clientCount, hours, net: attributed - cost,
      };
    }).sort((a, b) => b.net - a.net);

    return {
      payrollCost, revenue, revZoho, revFree, revFreeGross, revFreeVat, revOther, businessExp, beneficialExp, otherExp, opExpenses,
      totalCost, netProfit, margin, corpTax, afterTaxNet, ukProfit,
      zohoCount: withMrr.filter(c => processorOf(c.software) === "zoho").length,
      freeCount: withMrr.filter(c => processorOf(c.software) === "freeagent").length,
      clientRows, staffRows, activeStaffCount: activeStaff.length,
      scheduledStaffCount: Object.keys(hoursStaffTotal).length,
    };
  }, [clients, pay, hr, profiles, assignments, rates, expenses, settings, payAdjustments, patterns]);

  // Last 12 months of (reconstructed) revenue + next 6 months projected, for the trend chart.
  const revenueSeries = useMemo(() => {
    const vatDivisor = 1 + settings.vat_rate;
    const netOf = (c: ClientRow) => processorOf(c.software) === "freeagent" ? Number(c.mrr) / vatDivisor : Number(c.mrr);
    const activeClients = clients.filter(c => (c.mrr ?? 0) > 0 && (c.status ?? "active") === "active");
    const now = new Date();
    const months = Array.from({ length: 12 }, (_, idx) => {
      const i = 11 - idx;
      return new Date(now.getFullYear(), now.getMonth() - i, 1);
    });
    const actual = months.map(d => {
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const total = activeClients
        .filter(c => !c.contract_start_date || new Date(c.contract_start_date) <= monthEnd)
        .reduce((a, c) => a + netOf(c), 0);
      return { label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), actual: total, projected: null as number | null };
    });
    const g = settings.monthly_growth_pct / 100;
    const currentTotal = actual.length ? actual[actual.length - 1].actual : 0;
    const projected = Array.from({ length: Math.max(1, settings.projection_months) }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      return { label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }), actual: null as number | null, projected: currentTotal * Math.pow(1 + g, i + 1) };
    });
    // Bridge point so the projected line visually connects onto the actual line's end.
    if (actual.length) actual[actual.length - 1] = { ...actual[actual.length - 1], projected: actual[actual.length - 1].actual };
    return [...actual, ...projected];
  }, [clients, settings]);

  const saveSetting = async (patch: Partial<Settings>) => {
    setSettings(s => ({ ...s, ...patch }));
    await (supabase as any).from("finance_settings").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", true);
  };

  if (!isAdmin) return <div className="p-8 text-center text-muted-foreground">You do not have permission to view this page.</div>;
  if (!unlocked) return <PasscodeGate onUnlock={() => { sessionStorage.setItem(FINANCE_UNLOCK_KEY, "1"); setUnlocked(true); }} />;
  if (loading) return <div className="flex-1 flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading finance…</div>;

  const netTone = model.netProfit >= 0 ? "text-emerald-600" : "text-red-600";

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className={cn("max-w-7xl mx-auto space-y-4")}>
        <div>
          <h1 className="text-2xl font-bold">Finance</h1>
          <p className="text-muted-foreground text-sm">Profitability, revenue by processor, per-client & per-staff contribution, expenses and projections.</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Monthly revenue (ex. VAT)</p><p className="text-2xl font-bold tabular-nums">{gbp(model.revenue)}</p></CardContent></Card>
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
                  <p className="text-xs text-muted-foreground">Paid into your personal Dubai account — kept in full, no UK tax, no VAT.</p>
                </CardContent>
              </Card>
              <Card className="border-blue-300/40">
                <CardContent className="p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">FreeAgent — UK company (taxable)</p>
                    <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">{model.freeCount} clients</Badge>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{gbp(model.revFree)}<span className="text-sm font-normal text-muted-foreground"> /mo ex. VAT</span></p>
                  <p className="text-xs text-muted-foreground">
                    Clients are invoiced {gbp(model.revFreeGross)} — {gbp(model.revFreeVat)} of that is VAT ({pct(settings.vat_rate)}) collected and passed to HMRC, not revenue. Also subject to Corporation Tax ({pct(settings.corporation_tax_rate)}).
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Revenue trend */}
            <Card>
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-sm">Revenue trend — last 12 months &amp; next 6 projected</p>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-[2px] bg-primary rounded-full" /> Actual</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-[2px] bg-primary/50 rounded-full" style={{ backgroundImage: "repeating-linear-gradient(90deg, hsl(var(--primary)) 0 3px, transparent 3px 6px)" }} /> Projected</span>
                  </div>
                </div>
                <RevenueChart data={revenueSeries} />
              </CardContent>
            </Card>

            {/* Monthly P&L */}
            <Card>
              <CardContent className="p-5 space-y-1.5 text-sm">
                <p className="font-semibold mb-1">Monthly profit &amp; loss (UK company — FreeAgent only, ex. VAT)</p>
                <Line label="Revenue — FreeAgent (ex. VAT)" value={model.revFree} />
                {model.revOther > 0 && <Line label="Revenue — other" value={model.revOther} />}
                <Line label="Total revenue" value={model.revFree + model.revOther} strong />
                <div className="border-t my-1.5" />
                <Line label={`Payroll — ${model.activeStaffCount} staff, incl. bonus pot (live)`} value={-model.payrollCost} />
                <Line label="Business expenses" value={-model.opExpenses} />
                <Line label="Beneficial costs (owner salary, dividends, pension…)" value={-model.beneficialExp} />
                <Line label="Total costs" value={-model.totalCost} strong />
                <div className="border-t my-1.5" />
                <Line label="Net profit (before UK tax)" value={model.ukProfit} strong tone />
                <div className="border-t my-1.5" />
                <Line label={`Est. UK Corporation Tax (${pct(settings.corporation_tax_rate)} on UK profit)`} value={-model.corpTax} />
                <Line label="Net profit after UK tax" value={model.ukProfit - model.corpTax} strong tone />
                <p className="text-[11px] text-muted-foreground pt-2">
                  Estimate only. This P&amp;L covers the UK company (FreeAgent) only — Zoho income is personal (Dubai account, tax-free) and shown separately above, not mixed into this table. FreeAgent revenue is shown ex. VAT: the 20% VAT clients are invoiced is collected on HMRC's behalf and isn't real revenue or a cost here. Payroll = base salary + this month's bonus pot / manual bonuses, overtime and deductions logged on the Payroll tab; it doesn't yet include schedule-derived holiday-overtime bonuses or unused-holiday payouts, so it can run slightly under the Payroll tab's "Total Payroll" figure in months with those. Only clients at the "Active" sales stage are counted.
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

          </TabsContent>

          {/* ---- Clients ---- */}
          <TabsContent value="clients" className="mt-0">
            <ClientsTable rows={model.clientRows} onPatch={patchClient} />
          </TabsContent>

          {/* ---- Staff ---- */}
          <TabsContent value="staff" className="mt-0">
            <div className="rounded-lg border overflow-x-auto bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="text-left font-medium px-4 py-2.5">Staff</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[80px]">Clients</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[100px]">Hours /mo</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[140px]">Revenue attributed</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[110px]">Cost /mo</th>
                    <th className="text-right font-medium px-4 py-2.5 w-[140px]">Net contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {model.staffRows.map(s => (
                    <tr key={s.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{s.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.clientCount || "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{s.hours > 0 ? `${s.hours.toFixed(0)}h` : "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{gbp2(s.attributed)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{gbp2(s.cost)}</td>
                      <td className={cn("px-4 py-3 text-right tabular-nums font-medium", s.net >= 0 ? "text-emerald-600" : "text-red-600")}>{gbp2(s.net)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">
                Hours /mo are weighted monthly shift hours from the schedule (overtime counts 1.5×). Each client's revenue (ex. VAT) is split across its admins in proportion to those hours — so a client shared by several admins is divided by how much each actually works it, not evenly. Cost is each admin's monthly pay in GBP incl. this month's bonuses; net contribution = revenue attributed − cost. Admins with no scheduled shifts fall back to an equal split of any clients they're assigned to.
              </p>
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

// ---- Passcode gate (admin already required; this is a second, per-session lock) ----
function PasscodeGate({ onUnlock }: { onUnlock: () => void }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState(false);

  const submit = (code: string) => {
    if (code === FINANCE_PASSCODE) { onUnlock(); return; }
    setError(true);
    setValue("");
  };

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardContent className="p-6 space-y-4 text-center">
          <div className="space-y-1">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-full bg-muted">
              <Lock className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="font-semibold">Finance is locked</p>
            <p className="text-xs text-muted-foreground">Enter the 4-digit passcode to continue.</p>
          </div>
          <Input
            autoFocus
            type="password"
            inputMode="numeric"
            name="finance-passcode"
            autoComplete="one-time-code"
            data-1p-ignore
            data-lpignore="true"
            maxLength={4}
            value={value}
            className={cn("h-12 text-center text-2xl tracking-[0.5em]", error && "border-destructive")}
            onChange={e => {
              const v = e.target.value.replace(/\D/g, "").slice(0, 4);
              setValue(v);
              setError(false);
              if (v.length === 4) submit(v);
            }}
            onKeyDown={e => { if (e.key === "Enter") submit(value); }}
          />
          {error && <p className="text-xs text-destructive">Incorrect passcode — try again.</p>}
          <Button className="w-full" onClick={() => submit(value)} disabled={value.length !== 4}>Unlock</Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ---- Revenue trend chart ----
function RevenueChart({ data }: { data: { label: string; actual: number | null; projected: number | null }[] }) {
  const fmt = (v: number) => v >= 1000 ? `£${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `£${v.toFixed(0)}`;
  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.18} />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.6} />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={{ stroke: "hsl(var(--border))" }} tickLine={false} interval={2} />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={46} />
        <Tooltip
          formatter={(v: number) => gbp2(v)}
          contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
        />
        <Area type="monotone" dataKey="actual" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#revFill)" connectNulls dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
        <RLine type="monotone" dataKey="projected" stroke="hsl(var(--primary))" strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.65} dot={false} connectNulls activeDot={{ r: 4 }} isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
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

// ---- Clients: Airtable-style, grouped by payment processor ----
const PROCESSOR_META: Record<string, { label: string; cls: string; bar: string }> = {
  zoho: { label: "ZOHO", cls: "border-emerald-300 text-emerald-600 bg-emerald-50", bar: "bg-emerald-400" },
  freeagent: { label: "FREEAGENT", cls: "border-blue-300 text-blue-600 bg-blue-50", bar: "bg-blue-400" },
  other: { label: "OTHER", cls: "border-muted-foreground/30 text-muted-foreground", bar: "bg-muted-foreground/40" },
};
type ClientTableRow = ClientRow & { mrr: number; netRevenue: number; processor: "zoho" | "freeagent" | "other"; profit: number; margin: number };

function ClientsTable({ rows, onPatch }: { rows: ClientTableRow[]; onPatch: (id: string, patch: Partial<ClientRow>) => void }) {
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ id: string; field: string } | null>(null);

  const groups = (["zoho", "freeagent", "other"] as const)
    .map(key => ({ key, meta: PROCESSOR_META[key], items: rows.filter(r => r.processor === key) }))
    .filter(g => g.items.length > 0);

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="text-left font-medium px-4 py-2.5">Client</th>
            <th className="text-left font-medium px-4 py-2.5 w-[150px]">Sales Stage</th>
            <th className="text-left font-medium px-4 py-2.5 w-[120px]">Contract start</th>
            <th className="text-right font-medium px-4 py-2.5 w-[120px]">MRR (gross)</th>
            <th className="text-right font-medium px-4 py-2.5 w-[130px]">Est. profit</th>
            <th className="text-right font-medium px-4 py-2.5 w-[90px]">Margin</th>
          </tr>
        </thead>
        {groups.map(g => {
          const isCollapsed = collapsed[g.key];
          const sum = g.items.reduce((a, c) => a + c.mrr, 0);
          return (
            <tbody key={g.key}>
              <tr
                className="cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors border-b"
                onClick={() => setCollapsed(prev => ({ ...prev, [g.key]: !isCollapsed }))}
              >
                <td colSpan={6} className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                    <span className={cn("h-3 w-1 rounded-full", g.meta.bar)} />
                    <Badge variant="outline" className={cn("text-[10px] font-semibold", g.meta.cls)}>{g.meta.label}</Badge>
                    <span className="text-xs text-muted-foreground">{g.items.length}</span>
                    <span className="ml-auto text-xs font-semibold text-foreground">Sum {gbp2(sum)}</span>
                  </div>
                </td>
              </tr>
              {!isCollapsed && g.items.map(c => {
                const st = stageMeta(c.status);
                return (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-4 w-1 rounded-full flex-shrink-0", g.meta.bar)} />
                        {c.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {edit?.id === c.id && edit.field === "status" ? (
                        <Select
                          defaultOpen
                          value={c.status ?? "active"}
                          onValueChange={v => { onPatch(c.id, { status: v }); setEdit(null); }}
                          onOpenChange={o => { if (!o) setEdit(null); }}
                        >
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{SALES_STAGES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Badge
                          variant="outline"
                          className={cn("text-[10px] cursor-pointer", st.cls)}
                          onClick={() => setEdit({ id: c.id, field: "status" })}
                        >{st.label}</Badge>
                      )}
                    </td>
                    <td
                      className="px-4 py-3 text-muted-foreground cursor-text"
                      onDoubleClick={() => setEdit({ id: c.id, field: "contract_start_date" })}
                      title="Double-click to edit"
                    >
                      {edit?.id === c.id && edit.field === "contract_start_date" ? (
                        <Input
                          autoFocus type="date" defaultValue={c.contract_start_date ?? ""} className="h-8"
                          onBlur={e => { onPatch(c.id, { contract_start_date: e.target.value || null }); setEdit(null); }}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }}
                        />
                      ) : c.contract_start_date ? new Date(c.contract_start_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums cursor-text"
                      onDoubleClick={() => setEdit({ id: c.id, field: "mrr" })}
                      title="Double-click to edit"
                    >
                      {edit?.id === c.id && edit.field === "mrr" ? (
                        <Input
                          autoFocus type="number" step="0.01" defaultValue={c.mrr} className="h-8 text-right"
                          onBlur={e => { const v = parseFloat(e.target.value); onPatch(c.id, { mrr: isNaN(v) ? c.mrr : v }); setEdit(null); }}
                          onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEdit(null); }}
                        />
                      ) : gbp2(c.mrr)}
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-medium", c.profit >= 0 ? "text-emerald-600" : "text-red-600")}>{gbp2(c.profit)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums", c.margin >= 0 ? "text-muted-foreground" : "text-red-600")}>{pct(c.margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
      <p className="px-4 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">
        Only "Active" stage clients count toward revenue &amp; profit. Profit is ex-VAT revenue minus total monthly cost allocated pro-rata. Contract start date feeds the revenue trend chart above. Double-click MRR or contract start to edit · click the stage pill to change it · click a group header to collapse it.
      </p>
    </div>
  );
}

// ---- Expenses CRUD table, grouped by category ----
const EXP_CATEGORIES = ["Business Cost", "Beneficial Cost", "Other"];
const CATEGORY_META: Record<string, { cls: string; bar: string }> = {
  "Business Cost": { cls: "border-blue-300 text-blue-600 bg-blue-50", bar: "bg-blue-400" },
  "Beneficial Cost": { cls: "border-violet-300 text-violet-600 bg-violet-50", bar: "bg-violet-400" },
  "Other": { cls: "border-muted-foreground/30 text-muted-foreground", bar: "bg-muted-foreground/40" },
};
function ExpensesTable({ expenses, setExpenses, reload, toast }: {
  expenses: Expense[]; setExpenses: (fn: (p: Expense[]) => Expense[]) => void; reload: () => void; toast: ReturnType<typeof useToast>["toast"];
}) {
  const [edit, setEdit] = useState<{ id: string; field: string } | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

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
  const groups = EXP_CATEGORIES
    .map(cat => ({ cat, items: expenses.filter(e => e.category === cat) }))
    .filter(g => g.items.length > 0);
  // Any category outside the known three still needs to render (defensive).
  const known = new Set(EXP_CATEGORIES);
  const extra = Array.from(new Set(expenses.filter(e => !known.has(e.category)).map(e => e.category)))
    .map(cat => ({ cat, items: expenses.filter(e => e.category === cat) }));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Recurring monthly costs, grouped by category. Payroll is computed separately from staff pay.</p>
        <Button size="sm" onClick={add}><Plus className="h-4 w-4 mr-1" /> Add expense</Button>
      </div>
      <div className="rounded-lg border overflow-hidden bg-card">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left font-medium px-4 py-2.5">Name</th>
              <th className="text-left font-medium px-4 py-2.5 w-[160px]">Category</th>
              <th className="text-right font-medium px-4 py-2.5 w-[130px]">Amount /mo</th>
              <th className="text-center font-medium px-4 py-2.5 w-[80px]">VAT-able</th>
              <th className="w-[44px]" />
            </tr>
          </thead>
          {[...groups, ...extra].map(g => {
            const isCollapsed = collapsed[g.cat];
            const meta = CATEGORY_META[g.cat] || CATEGORY_META.Other;
            const sum = g.items.filter(e => e.active).reduce((a, e) => a + Number(e.amount_gbp), 0);
            return (
              <tbody key={g.cat}>
                <tr
                  className="cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors border-b"
                  onClick={() => setCollapsed(prev => ({ ...prev, [g.cat]: !isCollapsed }))}
                >
                  <td colSpan={5} className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                      <span className={cn("h-3 w-1 rounded-full", meta.bar)} />
                      <Badge variant="outline" className={cn("text-[10px] font-semibold", meta.cls)}>{g.cat.toUpperCase()}</Badge>
                      <span className="text-xs text-muted-foreground">{g.items.length}</span>
                      <span className="ml-auto text-xs font-semibold text-foreground">Sum {gbp2(sum)}</span>
                    </div>
                  </td>
                </tr>
                {!isCollapsed && g.items.map(e => (
                  <tr key={e.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", !e.active && "opacity-50")}>
                    <td className="px-4 py-3 font-medium cursor-text" onDoubleClick={() => setEdit({ id: e.id, field: "name" })}>
                      <div className="flex items-center gap-2">
                        <span className={cn("h-4 w-1 rounded-full flex-shrink-0", meta.bar)} />
                        {edit?.id === e.id && edit.field === "name" ? (
                          <Input autoFocus defaultValue={e.name} className="h-8"
                            onBlur={ev => patch(e.id, { name: ev.target.value.trim() || e.name })}
                            onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEdit(null); }} />
                        ) : e.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {edit?.id === e.id && edit.field === "category" ? (
                        <Select defaultOpen value={e.category} onValueChange={v => patch(e.id, { category: v })} onOpenChange={o => { if (!o) setEdit(null); }}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>{EXP_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : <span className="cursor-pointer text-muted-foreground" onClick={() => setEdit({ id: e.id, field: "category" })}>{e.category}</span>}
                    </td>
                    <td className="px-4 py-3 text-right cursor-text" onDoubleClick={() => setEdit({ id: e.id, field: "amount" })}>
                      {edit?.id === e.id && edit.field === "amount" ? (
                        <Input autoFocus type="number" step="0.01" defaultValue={e.amount_gbp} className="h-8 text-right"
                          onBlur={ev => patch(e.id, { amount_gbp: parseFloat(ev.target.value) || 0 })}
                          onKeyDown={ev => { if (ev.key === "Enter") (ev.target as HTMLInputElement).blur(); if (ev.key === "Escape") setEdit(null); }} />
                      ) : <span className="tabular-nums">{gbp2(Number(e.amount_gbp))}</span>}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{e.vat_able === true ? "Yes" : e.vat_able === false ? "No" : "—"}</td>
                    <td className="px-2 py-3 text-right">
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
              </tbody>
            );
          })}
          <tbody>
            <tr className="bg-muted/30 font-semibold border-t">
              <td className="px-4 py-2.5" colSpan={2}>Total (excl. payroll)</td>
              <td className="px-4 py-2.5 text-right tabular-nums">{gbp2(total)}</td>
              <td colSpan={2} />
            </tr>
          </tbody>
        </table>
        <p className="px-4 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">Double-click name or amount to edit · click the category to change it · click a group header to collapse it.</p>
      </div>
    </div>
  );
}
