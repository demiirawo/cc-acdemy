import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StaffPayManager } from "../hr/StaffPayManager";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { Loader2, Plus, Trash2, ChevronDown, ChevronRight, Lock, RefreshCw, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { ComposedChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ExpenseTrendPanel } from "./ExpenseTrendPanel";

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

interface ClientRow { id: string; name: string; mrr: number | null; software: string | null; status: string | null; contract_start_date: string | null; contract_end_date: string | null; }
interface PriceChange { id: string; client_id: string; previous_mrr: number | null; new_mrr: number; effective_date: string; reason: string | null; }
interface ClientChange { id: string; client_id: string; field: "status" | "contract_end_date"; previous_value: string | null; new_value: string | null; effective_date: string; reason: string | null; }
interface StaffPay { user_id: string; base_salary: number; base_currency: string; }
interface HrRow { user_id: string; pay_frequency: string | null; employment_end_date: string | null; start_date: string | null; created_at: string | null; }
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
  // Fully-computed per-staff monthly pay (GBP) published by the Payroll tab —
  // includes holiday overtime, bonuses, deductions, pro-rata etc. Used as Cost /mo
  // so Finance matches the Payroll tab exactly.
  const [payrollFromTab, setPayrollFromTab] = useState<{ month: string; totals: Record<string, number> } | null>(null);
  // The Payroll tab's saved totals for the selected month, read from the database
  // so they apply even when that tab hasn't been opened this session.
  const [payrollStored, setPayrollStored] = useState<Record<string, number>>({});
  // Cash actually received per month from FreeAgent, keyed 'YYYY-MM' on the payment
  // date. Lets the trend show money in the bank rather than back-projecting today's MRR.
  const [paidByMonth, setPaidByMonth] = useState<Record<string, number>>({});
  const [outstanding, setOutstanding] = useState(0);
  const [revenueMode, setRevenueMode] = useState<"actual" | "runrate">("actual");
  // 0 = window ends at the current month; negative steps the chart back in time.
  const [monthOffset, setMonthOffset] = useState(0);
  const [syncingInvoices, setSyncingInvoices] = useState(false);
  const [invoiceSync, setInvoiceSync] = useState<{ at: string | null; status: string | null; detail: string | null }>({
    at: null, status: null, detail: null,
  });
  const [priceChanges, setPriceChanges] = useState<PriceChange[]>([]);
  const [changeLog, setChangeLog] = useState<ClientChange[]>([]);
  const handlePayrollSummary = useCallback((data: { month: string; totals: Record<string, number> }) => setPayrollFromTab(data), []);

  // Which month the headline cards, split cards and P&L describe. Everything
  // month-shaped below reads from this; the trend chart keeps its own window.
  const [finMonthKey, setFinMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const shiftFinMonth = (delta: number) => setFinMonthKey(k => {
    const [y, m] = k.split("-").map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date();
    const [fy, fm] = finMonthKey.split("-").map(Number);
    const monthStart = `${finMonthKey}-01`;
    const nextM = new Date(fy, fm, 1);
    const monthEnd = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}-01`;
    const [cl, sp, hrp, pr, asg, rt, ex, st, pr2, pat, inv, fa, pc, ccl, pmt] = await Promise.all([
      supabase.from("clients").select("id, name, mrr, software, status, contract_start_date, contract_end_date"),
      (supabase as any).from("staff_salaries").select("user_id, base_salary, base_currency"),
      supabase.from("hr_profiles").select("user_id, pay_frequency, employment_end_date, start_date, created_at"),
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
      // The real ledger behind the chart. Payment dates matter more than invoice
      // dates here: the chart reports cash received, so a 30-day-terms client lands
      // in the month the money actually arrived.
      (supabase as any).from("client_invoices")
        .select("invoice_date, paid_date, paid_amount, total_value, status")
        .gte("invoice_date", `${now.getFullYear() - 2}-01-01`),
      (supabase as any).from("freeagent_oauth")
        .select("last_invoice_sync_at, last_invoice_sync_status, last_invoice_sync_detail")
        .eq("id", true).maybeSingle(),
      (supabase as any).from("client_price_changes")
        .select("id, client_id, previous_mrr, new_mrr, effective_date, reason")
        .order("effective_date", { ascending: true }),
      (supabase as any).from("client_change_log")
        .select("id, client_id, field, previous_value, new_value, effective_date, reason")
        .order("effective_date", { ascending: true }),
      // What the Payroll tab computed for this month, if it has run. This is the
      // same number that tab shows — holiday overtime, bonuses, deductions and
      // pro-rata included — so both pages report one figure for the month.
      (supabase as any).from("payroll_month_totals")
        .select("user_id, total_gbp").eq("month", finMonthKey),
    ]);
    setClients((cl.data as ClientRow[]) || []);
    // Cash received, bucketed by the month the payment landed rather than the month
    // the invoice was raised. Unpaid invoices contribute nothing until they're paid.
    const paidRows = ((inv.data as {
      invoice_date: string; paid_date: string | null; paid_amount: number | null;
      total_value: number; status: string | null;
    }[]) || []).filter(r => !["Cancelled", "Draft"].includes(r.status ?? ""));

    const byMonth: Record<string, number> = {};
    paidRows.forEach(r => {
      if (!r.paid_date) return;
      const k = String(r.paid_date).slice(0, 7);
      byMonth[k] = (byMonth[k] || 0) + Number(r.paid_amount ?? r.total_value ?? 0);
    });
    setPaidByMonth(byMonth);
    setPriceChanges((pc.data as PriceChange[]) || []);
    setChangeLog((ccl.data as ClientChange[]) || []);
    setInvoiceSync({
      at: fa.data?.last_invoice_sync_at ?? null,
      status: fa.data?.last_invoice_sync_status ?? null,
      detail: fa.data?.last_invoice_sync_detail ?? null,
    });
    setOutstanding(
      paidRows.filter(r => !r.paid_date)
        .reduce((a, r) => a + Number(r.total_value || 0), 0)
    );
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
    setPayrollStored(
      Object.fromEntries(((pmt.data as { user_id: string; total_gbp: number }[]) || [])
        .map(r => [r.user_id, Number(r.total_gbp)]))
    );
    setLoading(false);
  }, [finMonthKey]);
  useEffect(() => { load(); }, [load]);

  // Keep the P&L's payroll line live: StaffPayManager (Payroll tab) writes every
  // bonus pot recalc, manual bonus/overtime/deduction straight to staff_pay_records,
  // so a realtime subscription here means edits made there don't need a page reload.
  const refreshPayAdjustments = useCallback(async () => {
    const [fy, fm] = finMonthKey.split("-").map(Number);
    const monthStart = `${finMonthKey}-01`;
    const nextM = new Date(fy, fm, 1);
    const monthEnd = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}-01`;
    const { data } = await (supabase as any).from("staff_pay_records").select("user_id, record_type, amount, currency")
      .gte("pay_period_start", monthStart).lt("pay_period_start", monthEnd);
    setPayAdjustments((data as PayAdjustment[]) || []);
  }, [finMonthKey]);
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
    const [fy, fm] = finMonthKey.split("-").map(Number);
    const mStartStr = `${finMonthKey}-01`;
    const mStartDate = new Date(fy, fm - 1, 1);
    const mEndDate = new Date(fy, fm, 0);
    const mEndStr = `${finMonthKey}-${String(mEndDate.getDate()).padStart(2, "0")}`;

    // Who was on this month's payroll. Deliberately the same test the Payroll tab
    // applies — a salary on file, a live profile, and employment overlapping the
    // month — because the two pages counting staff differently is exactly how
    // they came to report different payroll costs for one month.
    const activeStaff = pay.filter(s => {
      if (!s.base_salary || Number(s.base_salary) <= 0) return false;
      if (!profiles[s.user_id]) return false;
      const h = hr[s.user_id];
      const startRaw = h?.start_date || h?.created_at || null;
      if (startRaw && startRaw.slice(0, 10) > mEndStr) return false;
      if (h?.employment_end_date && h.employment_end_date < mStartStr) return false;
      return true;
    });
    // Payroll's own figures win, in this order: the tab live on screen for this
    // month, then what it last saved for this month. Only if it has never run
    // for the month do we project from base salary.
    const tabTotals = payrollFromTab && payrollFromTab.month === finMonthKey
      ? payrollFromTab.totals
      : (Object.keys(payrollStored).length > 0 ? payrollStored : null);
    const tabIsLive = !!(payrollFromTab && payrollFromTab.month === finMonthKey);

    // What was actually recorded for this month, per person. A salary record
    // means their pay run happened — that snapshot IS the month's truth, and
    // adding live base salary on top would double-count it.
    const recordsByUser: Record<string, { hasSalary: boolean; total: number }> = {};
    payAdjustments.forEach(a => {
      const rate = rates[a.currency] ?? 1;
      const gbpAmount = Number(a.amount) * (rate > 0 ? rate : 1);
      const signed = a.record_type === "deduction" ? -gbpAmount : gbpAmount;
      const r = (recordsByUser[a.user_id] ??= { hasSalary: false, total: 0 });
      r.total += signed;
      if (a.record_type === "salary") r.hasSalary = true;
    });

    const staffCostByUser: Record<string, number> = {};
    let usedRecords = false;
    activeStaff.forEach(s => {
      if (tabTotals && tabTotals[s.user_id] != null) {
        staffCostByUser[s.user_id] = tabTotals[s.user_id]; // authoritative, all-in
        return;
      }
      const rec = recordsByUser[s.user_id];
      if (rec?.hasSalary) {
        staffCostByUser[s.user_id] = rec.total; // the month's run, as paid
        usedRecords = true;
        return;
      }
      // No run yet for this person: project base salary + any logged adjustments.
      const monthlyNative = monthlyFromFreq(s.base_salary, hr[s.user_id]?.pay_frequency ?? "monthly");
      const rate = rates[s.base_currency] ?? 1;
      staffCostByUser[s.user_id] = monthlyNative * (rate > 0 ? rate : 1) + (rec?.total ?? 0);
    });
    // Someone paid that month but gone since still cost money that month.
    Object.entries(recordsByUser).forEach(([uid, rec]) => {
      if (staffCostByUser[uid] == null && rec.hasSalary && !(tabTotals && tabTotals[uid] != null)) {
        staffCostByUser[uid] = rec.total;
        usedRecords = true;
      }
    });
    // When the Payroll tab has published its figures, the P&L payroll line is its
    // exact "Total Payroll" (sum of every staff member's all-in total); otherwise
    // fall back to the per-staff figures we derived above.
    const payrollCost = tabTotals
      ? Object.values(tabTotals).reduce((a, b) => a + b, 0)
      : Object.values(staffCostByUser).reduce((a, b) => a + b, 0);

    // Revenue for the SELECTED month: which clients billed in it, at the fee in
    // force then. Same rules the trend chart uses — contract windows and dated
    // stage changes decide membership, the price-change log decides the fee — so
    // the cards and the chart tell one story.
    const dateOfS = (v: string | null) => (v ? new Date(v) : null);
    const wentInactiveOn = (clientId: string): Date | null => {
      const moves = changeLog
        .filter(l => l.client_id === clientId && l.field === "status")
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
      const last = moves[moves.length - 1];
      if (!last || (last.new_value ?? "active") === "active") return null;
      return dateOfS(last.effective_date);
    };
    const billsInMonth = (c: ClientRow) => {
      const start = dateOfS(c.contract_start_date);
      if (start && start > mEndDate) return false;
      const end = dateOfS(c.contract_end_date);
      const inactiveFrom = wentInactiveOn(c.id);
      const stops = end && inactiveFrom ? (end < inactiveFrom ? end : inactiveFrom) : (end ?? inactiveFrom);
      if (stops) return stops >= mEndDate;
      return (c.status ?? "active") === "active";
    };
    const feeInForce = (c: ClientRow) => {
      const applicable = priceChanges
        .filter(pc => pc.client_id === c.id && pc.effective_date <= mEndStr)
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
        .pop();
      return applicable ? Number(applicable.new_mrr) : Number(c.mrr ?? 0);
    };
    const withMrr = clients.filter(c => feeInForce(c) > 0 && billsInMonth(c));
    const vatDivisor = 1 + settings.vat_rate;
    // FreeAgent MRR is what the client is invoiced — VAT-inclusive. Back the VAT out
    // to get real revenue. Zoho is a personal Dubai account, outside the UK VAT
    // scheme, so it needs no adjustment.
    const netOf = (c: ClientRow) => processorOf(c.software) === "freeagent" ? feeInForce(c) / vatDivisor : feeInForce(c);
    const revZoho = withMrr.filter(c => processorOf(c.software) === "zoho").reduce((a, c) => a + feeInForce(c), 0);
    const revFreeGross = withMrr.filter(c => processorOf(c.software) === "freeagent").reduce((a, c) => a + feeInForce(c), 0);
    const revFree = revFreeGross / vatDivisor; // ex-VAT — the real revenue figure
    const revFreeVat = revFreeGross - revFree;
    const revOther = withMrr.filter(c => processorOf(c.software) === "other").reduce((a, c) => a + feeInForce(c), 0);
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

    // Per-client rows for the Clients tab. Every priced client is listed — Pending
    // and Inactive included so the pipeline/churn picture stays visible — but
    // profit (cost allocated pro-rata to ex-VAT revenue share) is only computed
    // for clients at the "Active" stage; the rest carry no revenue or profit.
    const stageRank = (s: string | null) => ((s ?? "active") === "active" ? 0 : s === "pending" ? 1 : 2);
    // A client with no price yet still belongs on the list. Hiding them meant a
    // client created moments ago simply wasn't there, with nothing to explain
    // why — the row is how you get to the field that sets the price. Only the
    // internal placeholders are excluded; they aren't customers.
    const INTERNAL = new Set(["care cuddle", "unassigned"]);
    const clientRows = clients.filter(c => !INTERNAL.has((c.name ?? "").trim().toLowerCase())).map(c => {
      const isActive = (c.status ?? "active") === "active";
      const mrrGross = Number(c.mrr ?? 0);
      const priced = mrrGross > 0;
      const netRevenue = isActive && priced ? netOf(c) : null;
      const share = isActive && priced && revenue > 0 ? (netRevenue as number) / revenue : 0;
      const profit = isActive && priced ? (netRevenue as number) - share * totalCost : null;
      return {
        ...c, mrr: mrrGross, netRevenue, processor: processorOf(c.software), profit,
        margin: isActive && priced && (netRevenue as number) > 0 ? (profit as number) / (netRevenue as number) : null,
      };
    }).sort((a, b) =>
      stageRank(a.status) - stageRank(b.status) || (b.profit ?? 0) - (a.profit ?? 0) || b.mrr - a.mrr
    );

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
      clientRows, staffRows,
      activeStaffCount: tabTotals ? Object.keys(tabTotals).length : Object.keys(staffCostByUser).length,
      scheduledStaffCount: Object.keys(hoursStaffTotal).length,
      payrollFromTabLive: tabIsLive,
      payrollFromSaved: !!tabTotals && !tabIsLive,
      payrollFromRecords: !tabTotals && usedRecords,
    };
  }, [clients, pay, hr, profiles, assignments, rates, expenses, settings, payAdjustments, patterns, payrollFromTab, payrollStored, priceChanges, changeLog, finMonthKey]);

  // Last 12 months of (reconstructed) revenue + next 6 months projected, for the trend chart.
  const revenueSeries = useMemo(() => {
    // Gross — what clients are actually invoiced, VAT included. Deliberately different
    // from the ex-VAT figures in the KPI cards and P&L above, so the chart is labelled
    // "incl. VAT" to keep the two from being read as the same number.
    // The fee in force for a client in a given month: the latest change effective
    // on or before it, falling back to today's number. A rise scheduled for next
    // month therefore lifts the projection from next month, not from now.
    const grossOf = (c: ClientRow, monthEnd?: Date) => {
      if (!monthEnd) return Number(c.mrr);
      const cutoff = monthEnd.toISOString().slice(0, 10);
      const applicable = priceChanges
        .filter(pc => pc.client_id === c.id && pc.effective_date <= cutoff)
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date))
        .pop();
      return applicable ? Number(applicable.new_mrr) : Number(c.mrr);
    };
    const billing = clients.filter(c => (c.mrr ?? 0) > 0);
    const dateOf = (s: string | null) => (s ? new Date(s) : null);

    // Does this client get invoiced in this month?
    //
    // They start billing in the month their contract starts, even part-way through it
    // — the first recurring invoice goes out on the start date. They stop in the month
    // their contract ends, because the recurring profile lapses before that month's
    // invoice would go out; the end month must be covered in full to be billed. So a
    // contract ending 20 Aug bills through July and drops off in August, while one
    // ending 31 Aug still bills August.
    //
    // A client with no end date is only counted while they're still at an active stage
    // — we can't date a departure we were never told about; fill the end date in and
    // they show up across the months they actually billed, then drop off.
    // When a client stopped being active, if we know. A dated stage change is a
    // better answer than the bare current status: it means a client who left in
    // March counts for January and February instead of vanishing from the whole
    // history, which is what happens when all you have is "inactive today".
    const wentInactiveOn = (clientId: string): Date | null => {
      const moves = changeLog
        .filter(l => l.client_id === clientId && l.field === "status")
        .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
      const last = moves[moves.length - 1];
      if (!last || (last.new_value ?? "active") === "active") return null;
      return dateOf(last.effective_date);
    };

    const billsIn = (c: ClientRow, monthStart: Date, monthEnd: Date) => {
      const start = dateOf(c.contract_start_date);
      if (start && start > monthEnd) return false;

      // Whichever came first ends the billing: the contract lapsing, or the
      // client being moved out of Active.
      const end = dateOf(c.contract_end_date);
      const inactiveFrom = wentInactiveOn(c.id);
      const stops = end && inactiveFrom ? (end < inactiveFrom ? end : inactiveFrom) : (end ?? inactiveFrom);
      if (stops) return stops >= monthEnd;

      // No dated end of any kind — fall back to the current stage, which can only
      // speak for today, so an undated inactive client stays out of the history.
      return (c.status ?? "active") === "active";
    };
    const inMonth = (d: string | null, monthStart: Date, monthEnd: Date) => {
      const t = dateOf(d);
      return !!t && t >= monthStart && t <= monthEnd;
    };

    const isZoho = (c: ClientRow) => processorOf(c.software) === "zoho";

    const monthPoint = (d: Date, growth: number, useActual = false) => {
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const live = billing.filter(c => billsIn(c, monthStart, monthEnd));
      const zoho = live.filter(isZoho).reduce((a, c) => a + grossOf(c, monthEnd), 0) * growth;
      // FreeAgent is the only stream we hold a ledger for. In paid mode its band is
      // the cash that actually cleared that month — which carries the annual uplifts,
      // discounts, add-ons and one-offs a flat MRR figure can't, and puts
      // deferred-terms clients in the month they really paid. Zoho is billed outside
      // FreeAgent, so that band stays run-rate derived either way.
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      // A month with no cash in it is worth nothing on this basis — don't fall back
      // to the run-rate, which would draw a month nobody has paid yet as though it
      // were complete. Only future months are run-rate, and they say so.
      const other = useActual
        ? (paidByMonth[key] ?? 0)
        : live.filter(c => !isZoho(c)).reduce((a, c) => a + grossOf(c, monthEnd), 0) * growth;
      // A won/lost marker has to describe money actually arriving or leaving the
      // book. A prospect signed up and dropped before their contract started
      // never billed a penny, so it is neither a win nor churn — showing it as
      // "ended −£909.50" reads as revenue lost that was never there.
      const prevMonthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), 0);
      const prevMonthStart = new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1);
      const billedLastMonth = (c: ClientRow) => billsIn(c, prevMonthStart, prevMonthEnd);

      const started = billing
        .filter(c => inMonth(c.contract_start_date, monthStart, monthEnd) && billsIn(c, monthStart, monthEnd))
        .map(c => ({ name: c.name, amount: grossOf(c, monthEnd), zoho: isZoho(c) })).sort((a, b) => b.amount - a.amount);
      const endedIds = new Set<string>();
      const ended = billing.filter(c => {
        if (endedIds.has(c.id)) return false;
        // Nothing to lose if they weren't billing the month before.
        if (!billedLastMonth(c)) return false;
        const byContract = inMonth(c.contract_end_date, monthStart, monthEnd);
        const inactiveFrom = wentInactiveOn(c.id);
        const byStage = !!inactiveFrom && inactiveFrom >= monthStart && inactiveFrom <= monthEnd;
        if (byContract || byStage) { endedIds.add(c.id); return true; }
        return false;
      }).map(c => ({ name: c.name, amount: grossOf(c, prevMonthEnd), zoho: isZoho(c) })).sort((a, b) => b.amount - a.amount);
      // Fee changes taking effect this month, so a step in the line can be told
      // apart from a client arriving or leaving.
      const repriced = priceChanges
        .filter(pc => inMonth(pc.effective_date, monthStart, monthEnd))
        // A move from nothing is a client being priced, not a fee change.
        .filter(pc => Number(pc.previous_mrr ?? 0) > 0)
        .map(pc => ({
          name: clients.find(c => c.id === pc.client_id)?.name ?? "Client",
          delta: Number(pc.new_mrr) - Number(pc.previous_mrr ?? pc.new_mrr),
          reason: pc.reason,
        }))
        .filter(pc => pc.delta !== 0)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      const repriceDelta = repriced.reduce((a, c) => a + c.delta, 0);

      const won = started.reduce((a, c) => a + c.amount, 0);
      const lost = ended.reduce((a, c) => a + c.amount, 0);
      return {
        label: d.toLocaleDateString(undefined, { month: "short", year: "2-digit" }),
        monthLabel: d.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
        zoho, other, total: zoho + other,
        started, ended, repriced, repriceDelta,
        won, lost, net: won - lost,
      };
    };

    const now = new Date();
    const useActual = revenueMode === "actual";
    const projMonths = Math.max(1, settings.projection_months);
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // The window slides with monthOffset, but what counts as history is fixed by the
    // real calendar: a month is actual once it has finished. So scrolling back turns
    // the whole window solid rather than carrying a "projection" into the past, and
    // the month in progress stays dashed because only part of its cash has arrived.
    const anchor = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const g = settings.monthly_growth_pct / 100;

    const points = Array.from({ length: 12 + projMonths }, (_, i) => {
      const d = new Date(anchor.getFullYear(), anchor.getMonth() - 12 + i, 1);
      const monthsAhead =
        (d.getFullYear() - thisMonth.getFullYear()) * 12 + (d.getMonth() - thisMonth.getMonth());
      const isFuture = monthsAhead >= 0;
      // Growth only compounds beyond the current month; the current one is already here.
      const growth = isFuture ? Math.pow(1 + g, monthsAhead) : 1;
      return { p: monthPoint(d, growth, !isFuture && useActual), isFuture };
    });

    // Split each month's two bands into actual vs projected keys so the solid and
    // dashed halves stack independently. The last finished month carries both,
    // bridging them so the areas meet with no gap.
    const lastActualIdx = points.reduce((last, pt, i) => (pt.isFuture ? last : i), -1);

    return points.map(({ p, isFuture }, i) => ({
      ...p,
      isProjected: isFuture,
      zohoActual: isFuture ? null : p.zoho,
      otherActual: isFuture ? null : p.other,
      zohoProjected: isFuture || i === lastActualIdx ? p.zoho : null,
      otherProjected: isFuture || i === lastActualIdx ? p.other : null,
    }));
  }, [clients, settings, paidByMonth, revenueMode, monthOffset, priceChanges, changeLog]);

  // Pull invoices straight from FreeAgent. Writes to the same table the spreadsheet
  // import fills, on the same key, so this refreshes rather than duplicates.
  const syncInvoices = async () => {
    setSyncingInvoices(true);
    try {
      const { data, error } = await supabase.functions.invoke("freeagent-sync-invoices", { body: {} });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({ title: "Invoices refreshed", description: `${(data as any)?.synced ?? 0} invoices pulled from FreeAgent.` });
      await load();
    } catch (e: any) {
      toast({ title: "Couldn't refresh invoices", description: String(e?.message ?? e), variant: "destructive" });
    } finally {
      setSyncingInvoices(false);
    }
  };

  // A client's first price. Deliberately not a change-log entry: recording
  // "£0 → £909.50" would draw a fake price rise on the revenue chart and start
  // the annual-uplift clock from the day someone got round to typing the fee in.
  const setInitialPrice = async (client: ClientTableRow, mrr: number) => {
    await patchClient(client.id, { mrr });
    toast({ title: "Fee set", description: `${client.name} is ${gbp2(mrr)}/mo.` });
    await load();
  };

  // Cancel a scheduled fee change, or undo one that already applied. The chart
  // derives each month's fee from this log, so an entry that is currently
  // setting the price has to take the live fee back with it — otherwise the
  // table would show one number and the chart another.
  const removePriceChange = async (client: ClientTableRow, change: PriceChange, revertFee: boolean) => {
    const { error } = await (supabase as any).from("client_price_changes").delete().eq("id", change.id);
    if (error) {
      toast({ title: "Couldn't remove the fee change", description: error.message, variant: "destructive" });
      return;
    }
    const scheduled = change.effective_date > new Date().toISOString().slice(0, 10);
    if (revertFee) await patchClient(client.id, { mrr: Number(change.previous_mrr ?? 0) });
    toast({
      title: scheduled ? "Scheduled change cancelled" : "Fee change undone",
      description: revertFee
        ? `${client.name} is back to ${gbp2(Number(change.previous_mrr ?? 0))}/mo.`
        : `${client.name} stays at ${gbp2(Number(client.mrr))}/mo.`,
    });
    await load();
  };

  // Record a fee change. The live mrr only moves once the effective date has
  // arrived — a rise agreed today for next month must not restate this month's
  // revenue, but it should still show in the projection, which reads the log.
  const applyPriceChange = async (client: ClientTableRow, newMrr: number, effectiveDate: string, reason: string) => {
    const { error } = await (supabase as any).from("client_price_changes").insert({
      client_id: client.id,
      previous_mrr: client.mrr,
      new_mrr: newMrr,
      effective_date: effectiveDate,
      reason: reason || null,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    });
    if (error) {
      toast({ title: "Couldn't record the fee change", description: error.message, variant: "destructive" });
      return;
    }
    const startsToday = effectiveDate <= new Date().toISOString().slice(0, 10);
    if (startsToday) await patchClient(client.id, { mrr: newMrr });
    toast({
      title: startsToday ? "Fee updated" : "Fee change scheduled",
      description: startsToday
        ? `${client.name} is now ${gbp2(newMrr)}/mo.`
        : `${client.name} moves to ${gbp2(newMrr)}/mo from ${new Date(effectiveDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.`,
    });
    await load();
  };

  // Record a stage or contract-end change with the date it took effect, then
  // apply it. Both move revenue, and both were previously set with no record of
  // when — which is why an inactive client had to be dropped from every past
  // month rather than just the ones after they left.
  const applyFieldChange = async (
    client: ClientTableRow,
    field: "status" | "contract_end_date",
    newValue: string | null,
    effectiveDate: string,
    reason: string,
  ) => {
    const previous = field === "status" ? (client.status ?? "active") : client.contract_end_date;
    if (String(previous ?? "") === String(newValue ?? "")) { toast({ title: "Nothing changed" }); return; }

    const { error } = await (supabase as any).from("client_change_log").insert({
      client_id: client.id,
      field,
      previous_value: previous,
      new_value: newValue,
      effective_date: effectiveDate,
      reason: reason || null,
      created_by: (await supabase.auth.getUser()).data.user?.id ?? null,
    });
    if (error) {
      toast({ title: "Couldn't record the change", description: error.message, variant: "destructive" });
      return;
    }
    await patchClient(client.id, field === "status" ? { status: newValue } : { contract_end_date: newValue });
    toast({
      title: field === "status" ? "Sales stage updated" : "Contract end updated",
      description: `Recorded as effective ${new Date(effectiveDate).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}.`,
    });
    await load();
  };

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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">Finance</h1>
            <p className="text-muted-foreground text-sm">Profitability, revenue by processor, per-client & per-staff contribution, expenses and projections.</p>
          </div>
          {(() => {
            const [fy, fm] = finMonthKey.split("-").map(Number);
            const [cy, cm] = currentMonthKey.split("-").map(Number);
            const monthDelta = (fy - cy) * 12 + (fm - cm);
            const monthLabel = new Date(fy, fm - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
            return (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftFinMonth(-1)}
                  disabled={monthDelta <= -24} aria-label="Previous month">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-[150px] text-center">
                  <div className="text-sm font-semibold leading-tight">{monthLabel}</div>
                  {monthDelta === 0 ? (
                    <div className="text-[10px] text-muted-foreground">current month</div>
                  ) : (
                    <button type="button" className="text-[10px] text-primary hover:underline"
                      onClick={() => setFinMonthKey(currentMonthKey)}>
                      back to current month
                    </button>
                  )}
                </div>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftFinMonth(1)}
                  disabled={monthDelta >= 3} aria-label="Next month">
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            );
          })()}
        </div>

        {/* KPI row — describes the selected month */}
        {(() => {
          const [fy, fm] = finMonthKey.split("-").map(Number);
          const isCur = finMonthKey === currentMonthKey;
          const ml = new Date(fy, fm - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{isCur ? "Monthly revenue (ex. VAT)" : `${ml} revenue (ex. VAT)`}</p><p className="text-2xl font-bold tabular-nums">{gbp(model.revenue)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{isCur ? "Monthly costs" : `${ml} costs`}</p><p className="text-2xl font-bold tabular-nums">{gbp(model.totalCost)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{isCur ? "Net profit / mo" : `Net profit — ${ml}`}</p><p className={cn("text-2xl font-bold tabular-nums", netTone)}>{gbp(model.netProfit)}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Margin</p><p className={cn("text-2xl font-bold tabular-nums", netTone)}>{pct(model.margin)}</p></CardContent></Card>
            </div>
          );
        })()}

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
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">
                      Revenue trend — last 12 months &amp; {Math.max(1, settings.projection_months)} projected{" "}
                      <span className="font-normal text-muted-foreground">(incl. VAT)</span>
                    </p>
                    <div className="inline-flex rounded-md border bg-background p-0.5">
                      {([["actual", "Paid"], ["runrate", "Run-rate"]] as const).map(([v, label]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setRevenueMode(v)}
                          className={cn("rounded px-2 py-0.5 text-[11px] font-medium transition",
                            revenueMode === v ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                        >{label}</button>
                      ))}
                    </div>
                    {/* Step the window back through history. Forward stops at the
                        present — there's nothing beyond the projection to show. */}
                    <div className="inline-flex items-center gap-0.5">
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        title="Earlier months" onClick={() => setMonthOffset(o => o - 3)}>
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7"
                        title="Later months" disabled={monthOffset >= 0}
                        onClick={() => setMonthOffset(o => Math.min(0, o + 3))}>
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                      {monthOffset !== 0 && (
                        <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2"
                          onClick={() => setMonthOffset(0)}>
                          Back to now
                        </Button>
                      )}
                    </div>
                    <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={syncInvoices} disabled={syncingInvoices}>
                      {syncingInvoices ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                      {syncingInvoices ? "Refreshing…" : "Refresh from FreeAgent"}
                    </Button>
                    {invoiceSync.at && (
                      <span className="text-[11px] text-muted-foreground">
                        {invoiceSync.status === "error" ? "Last sync failed" : `Synced ${invoiceSync.detail ?? ""}`}
                        {" · "}
                        {new Date(invoiceSync.at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap justify-end">
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: ZOHO_COLOR }} /> Zoho</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: FREEAGENT_COLOR }} /> FreeAgent</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-3 h-[2px] rounded-full" style={{ backgroundImage: "repeating-linear-gradient(90deg, currentColor 0 3px, transparent 3px 6px)" }} /> Projected</span>
                    <span className="inline-flex items-center gap-1" style={{ color: WON_COLOR }}>▲ Contract won</span>
                    <span className="inline-flex items-center gap-1" style={{ color: LOST_COLOR }}>▼ Contract ended</span>
                    <span className="inline-flex items-center gap-1.5"><span className="inline-block w-2 h-2 rounded-sm bg-muted-foreground" /> Fee change</span>
                  </div>
                </div>
                <RevenueChart data={revenueSeries} />
                <p className="text-[11px] text-muted-foreground mt-2">
                  {revenueMode === "actual"
                    ? `Paid: the solid FreeAgent band is cash that actually cleared, counted in the month the payment landed — so it carries the annual uplifts, discounts, add-ons and one-offs a flat monthly figure can't, and puts clients on deferred terms in the month they really paid. It ends at the last complete month; the month in progress is dashed, alongside the months ahead, because only part of its cash has arrived${outstanding > 0 ? ` — ${gbp2(outstanding)} is outstanding right now` : ""}. Projected months are valued at the current run-rate rather than collected cash, so expect a step where the two meet. Zoho is billed outside FreeAgent, so that band is run-rate throughout.`
                    : "Run-rate: every month valued at each client's current monthly fee, so the line shows the shape of the book rather than money received. Switch to Paid for actual cash."}
                  {" "}Gross — VAT included — so this runs higher than the ex-VAT revenue in the cards above and in the P&amp;L. Markers show months where contracts started or ended; hover one to see which clients and what each was worth. A contract end date removes that client from the month it lapses onward.
                </p>
              </CardContent>
            </Card>

            {/* Monthly P&L */}
            <Card>
              <CardContent className="p-5 space-y-1.5 text-sm">
                <p className="font-semibold mb-1">Profit &amp; loss — {new Date(Number(finMonthKey.slice(0, 4)), Number(finMonthKey.slice(5, 7)) - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" })} (UK company — FreeAgent only, ex. VAT)</p>
                <Line label="Revenue — FreeAgent (ex. VAT)" value={model.revFree} />
                {model.revOther > 0 && <Line label="Revenue — other" value={model.revOther} />}
                <Line label="Total revenue" value={model.revFree + model.revOther} strong />
                <div className="border-t my-1.5" />
                <Line label={`Payroll — ${model.activeStaffCount} staff, full pay${model.payrollFromTabLive ? " (live from Payroll)" : model.payrollFromSaved ? " (from Payroll)" : model.payrollFromRecords ? " (as paid, from records)" : " (projected)"}`} value={-model.payrollCost} />
                <Line label="Business expenses" value={-model.opExpenses} />
                <Line label="Beneficial costs (owner salary, dividends, pension…)" value={-model.beneficialExp} />
                <Line label="Total costs" value={-model.totalCost} strong />
                <div className="border-t my-1.5" />
                <Line label="Net profit (before UK tax)" value={model.ukProfit} strong tone />
                <div className="border-t my-1.5" />
                <Line label={`Est. UK Corporation Tax (${pct(settings.corporation_tax_rate)} on UK profit)`} value={-model.corpTax} />
                <Line label="Net profit after UK tax" value={model.ukProfit - model.corpTax} strong tone />
                <p className="text-[11px] text-muted-foreground pt-2">
                  Estimate only. This P&amp;L covers the UK company (FreeAgent) only — Zoho income is personal (Dubai account, tax-free) and shown separately above, not mixed into this table. FreeAgent revenue is shown ex. VAT: the 20% VAT clients are invoiced is collected on HMRC's behalf and isn't real revenue or a cost here. Payroll is each staff member's full monthly pay from the Payroll tab — base salary plus bonuses, overtime, holiday-overtime bonuses, unused-holiday payouts and any deductions/pro-rata — so this line matches the Payroll tab's "Total Payroll". Only clients at the "Active" sales stage are counted.
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
            <ClientsTable rows={model.clientRows} onPatch={patchClient} onPriceChange={applyPriceChange} onSetInitialPrice={setInitialPrice} onRemovePriceChange={removePriceChange}
              onFieldChange={applyFieldChange} priceChanges={priceChanges} changeLog={changeLog} />
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
                Hours /mo are weighted monthly shift hours from the schedule (overtime counts 1.5×). Each client's revenue (ex. VAT) is split across its admins in proportion to those hours — so a client shared by several admins is divided by how much each actually works it, not evenly. Cost /mo is each admin's full monthly pay from the Payroll tab (base salary + bonuses, overtime, holiday-overtime bonuses, unused-holiday payouts, deductions and pro-rata); net contribution = revenue attributed − cost. Admins with no scheduled shifts fall back to an equal split of any clients they're assigned to.
              </p>
            </div>
          </TabsContent>

          {/* ---- Payroll ---- */}
          {/* forceMount keeps this computing in the background so its per-staff totals
              (incl. holiday overtime, bonuses, deductions) feed Cost /mo on every tab. */}
          <TabsContent value="payroll" forceMount className={cn("mt-0", activeTab !== "payroll" && "hidden")}>
            <StaffPayManager onSummaryComputed={handlePayrollSummary} />
          </TabsContent>

          {/* ---- Expenses ---- */}
          <TabsContent value="expenses" className="mt-0 space-y-4">
            {/* What we actually spend, from the accounting data — above the manually
                maintained list, which is the plan rather than the record. */}
            <ExpenseTrendPanel />
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
// Contract wins/losses are annotations on the revenue line, not a second series —
// the step in the line *is* the impact, the marker just says what caused it. Colours
// are validated for colourblind separation, and every marker carries a ▲/▼ and a
// signed amount so direction never rests on hue alone.
// Series colours follow the entity (FreeAgent keeps its blue, Zoho its amber) and
// stay clear of the marker colours. Validated for CVD separation in light and dark.
const FREEAGENT_COLOR = "#2a78d6";
const ZOHO_COLOR = "#eda100";
const WON_COLOR = "#1baf7a";
const LOST_COLOR = "#d03b3b";

interface RevenueEvent { name: string; amount: number; zoho: boolean }
interface RevenuePoint {
  label: string; monthLabel: string;
  zoho: number; other: number; total: number;
  isProjected: boolean;
  zohoActual: number | null; otherActual: number | null;
  zohoProjected: number | null; otherProjected: number | null;
  started: RevenueEvent[];
  ended: RevenueEvent[];
  repriced: { name: string; delta: number; reason: string | null }[];
  repriceDelta: number;
  won: number; lost: number; net: number;
}

/** Marker on the revenue line for a month where contracts started and/or ended. */
function EventDot({ cx, cy, payload, index, labelled, count }: any) {
  const p = payload as RevenuePoint;
  const hasEvent = p.started.length || p.ended.length || p.repriced.length;
  if (cx == null || cy == null || !hasEvent) return null;
  // A month with only a fee change gets its own mark — the line moves without
  // anyone joining or leaving, which is otherwise unexplained.
  const priceOnly = !p.started.length && !p.ended.length;
  const gained = (priceOnly ? p.repriceDelta : p.net) >= 0;
  const color = gained ? WON_COLOR : LOST_COLOR;
  const show = labelled.has(p.label);
  // Anchor labels inward at the edges so they don't overflow the axis or the card.
  const anchor = index <= 0 ? "start" : index >= count - 1 ? "end" : "middle";
  return (
    <g>
      {/* 2px surface ring keeps the marker legible where it overlaps the line */}
      <circle cx={cx} cy={cy} r={5} fill="hsl(var(--card))" />
      {priceOnly
        ? <rect x={cx - 3} y={cy - 3} width={6} height={6} rx={1} fill={color} />
        : <circle cx={cx} cy={cy} r={3.5} fill={color} />}
      {show && (
        <text
          x={anchor === "start" ? cx - 4 : anchor === "end" ? cx + 4 : cx}
          y={cy - 11} textAnchor={anchor} fontSize={10} fontWeight={600} fill={color}
        >
          {gained ? "▲" : "▼"} {gained ? "+" : "−"}£{Math.abs(Math.round(priceOnly ? p.repriceDelta : p.net)).toLocaleString()}
        </text>
      )}
    </g>
  );
}

function RevenueTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p: RevenuePoint = payload[0].payload;
  const evt = (s: RevenueEvent) => `${s.name} (${s.zoho ? "Zoho" : "FreeAgent"})`;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-md max-w-[280px]">
      <p className="font-semibold text-foreground">
        {p.monthLabel}{p.isProjected ? " · projected" : ""}
      </p>
      <div className="mt-1 space-y-0.5">
        <p className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: ZOHO_COLOR }} /> Zoho
          </span>
          <span className="tabular-nums text-foreground">{gbp2(p.zoho)}</span>
        </p>
        <p className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ background: FREEAGENT_COLOR }} /> FreeAgent
          </span>
          <span className="tabular-nums text-foreground">{gbp2(p.other)}</span>
        </p>
        <p className="flex items-center justify-between gap-3 font-medium border-t pt-0.5 mt-0.5">
          <span>Total</span><span className="tabular-nums">{gbp2(p.total)}</span>
        </p>
      </div>
      {p.repriced.length > 0 && (
        <div className="mt-1.5 pt-1.5 border-t">
          <p className="font-medium text-foreground">■ Fee changes · {p.repriceDelta >= 0 ? "+" : "−"}{gbp2(Math.abs(p.repriceDelta))}/mo</p>
          {p.repriced.map(r => (
            <p key={r.name} className="text-muted-foreground pl-3">
              {r.name} {r.delta >= 0 ? "+" : "−"}{gbp2(Math.abs(r.delta))}
              {r.reason ? <span className="opacity-70"> · {r.reason}</span> : null}
            </p>
          ))}
        </div>
      )}
      {(p.started.length > 0 || p.ended.length > 0) && (
        <div className="mt-1.5 pt-1.5 border-t space-y-1">
          {p.started.length > 0 && (
            <div>
              <p className="font-medium" style={{ color: WON_COLOR }}>▲ Started · +{gbp2(p.won)}/mo</p>
              {p.started.map(s => (
                <p key={s.name} className="text-muted-foreground pl-3">{evt(s)} +{gbp2(s.amount)}</p>
              ))}
            </div>
          )}
          {p.ended.length > 0 && (
            <div>
              <p className="font-medium" style={{ color: LOST_COLOR }}>▼ Ended · −{gbp2(p.lost)}/mo</p>
              {p.ended.map(s => (
                <p key={s.name} className="text-muted-foreground pl-3">{evt(s)} −{gbp2(s.amount)}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RevenueChart({ data }: { data: RevenuePoint[] }) {
  const fmt = (v: number) => v >= 1000 ? `£${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `£${v.toFixed(0)}`;
  // Label only the months that moved the needle most — a number on every marker
  // would be unreadable when most months have some churn. Take them biggest-first
  // but never two neighbouring months, whose labels would sit on top of each other.
  const labelled = useMemo(() => {
    const picked: number[] = [];
    data.map((d, i) => ({ d, i }))
      .filter(({ d }) => d.started.length || d.ended.length || d.repriced.length)
      .sort((a, b) => Math.abs(b.d.net + b.d.repriceDelta) - Math.abs(a.d.net + a.d.repriceDelta))
      .forEach(({ i }) => {
        if (picked.length < 3 && picked.every(p => Math.abs(p - i) >= 2)) picked.push(i);
      });
    return new Set(picked.map(i => data[i].label));
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={230}>
      <ComposedChart data={data} margin={{ top: 18, right: 8, left: 0, bottom: 0 }}>
        {/* Vertical lines mark every month boundary, so a reader can tell which
            month a point belongs to without counting across from the axis. */}
        <CartesianGrid vertical stroke="hsl(var(--border))" strokeOpacity={0.6} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          axisLine={{ stroke: "hsl(var(--border))" }}
          tickLine={{ stroke: "hsl(var(--border))" }}
          interval={0}
          tickMargin={6}
        />
        <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} tickFormatter={fmt} width={46} />
        <Tooltip content={<RevenueTooltip />} cursor={{ stroke: "hsl(var(--border))" }} />

        {/* Actual: the two revenue streams stacked, so the top edge stays the total.
            A 1px surface stroke keeps the two fills from touching. */}
        <Area type="monotone" stackId="actual" dataKey="otherActual" stroke={FREEAGENT_COLOR} strokeWidth={2} fill={FREEAGENT_COLOR} fillOpacity={0.22} isAnimationActive={false} dot={false} activeDot={false} />
        <Area type="monotone" stackId="actual" dataKey="zohoActual" stroke={ZOHO_COLOR} strokeWidth={2} fill={ZOHO_COLOR} fillOpacity={0.22} isAnimationActive={false} dot={<EventDot labelled={labelled} count={data.length} />} activeDot={{ r: 4 }} />

        {/* Projected: same stack, dashed and lighter. */}
        <Area type="monotone" stackId="projected" dataKey="otherProjected" stroke={FREEAGENT_COLOR} strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.7} fill={FREEAGENT_COLOR} fillOpacity={0.08} isAnimationActive={false} dot={false} activeDot={false} />
        <Area type="monotone" stackId="projected" dataKey="zohoProjected" stroke={ZOHO_COLOR} strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.7} fill={ZOHO_COLOR} fillOpacity={0.08} isAnimationActive={false} dot={<EventDot labelled={labelled} count={data.length} />} activeDot={{ r: 4 }} />
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
  other: { label: "NO BILLING SET", cls: "border-amber-300 text-amber-600 bg-amber-50", bar: "bg-amber-400" },
  // Churned clients sit apart from the billing groups: which system used to
  // invoice them stops being the useful fact once they've left.
  inactive: { label: "INACTIVE / CHURNED", cls: "border-muted-foreground/30 text-muted-foreground", bar: "bg-muted-foreground/40" },
};
/**
 * How long we've had a client, and whether their annual uplift is due.
 *
 * "Due" is measured from the last fee change rather than the contract start —
 * once someone has had a rise, the next one is a year after that, not a year
 * after they joined. With no recorded change, the contract start is the clock.
 */
function clientTenure(contractStart: string | null, lastUplift: string | null) {
  if (!contractStart) return null;
  const start = new Date(contractStart);
  if (isNaN(start.getTime())) return null;
  const now = new Date();
  const months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth())
    - (now.getDate() < start.getDate() ? 1 : 0);
  if (months < 0) return { label: "Not started", upliftDue: false };
  const y = Math.floor(months / 12), m = months % 12;
  const label = y ? `${y} yr${y === 1 ? "" : "s"}${m ? ` ${m} mo` : ""}` : `${m} mo`;

  const since = lastUplift ? new Date(lastUplift) : start;
  const monthsSince = (now.getFullYear() - since.getFullYear()) * 12 + (now.getMonth() - since.getMonth())
    - (now.getDate() < since.getDate() ? 1 : 0);
  return { label, upliftDue: monthsSince >= 12 };
}

type ClientTableRow = ClientRow & { mrr: number; netRevenue: number | null; processor: "zoho" | "freeagent" | "other"; profit: number | null; margin: number | null };

function ClientsTable({ rows, onPatch, onPriceChange, onSetInitialPrice, onRemovePriceChange, onFieldChange, priceChanges, changeLog }: {
  rows: ClientTableRow[];
  onPatch: (id: string, patch: Partial<ClientRow>) => void;
  onSetInitialPrice: (client: ClientTableRow, mrr: number) => Promise<void>;
  onRemovePriceChange: (client: ClientTableRow, change: PriceChange, revertFee: boolean) => Promise<void>;
  onPriceChange: (client: ClientTableRow, newMrr: number, effectiveDate: string, reason: string) => Promise<void>;
  onFieldChange: (client: ClientTableRow, field: "status" | "contract_end_date", newValue: string | null, effectiveDate: string, reason: string) => Promise<void>;
  priceChanges: PriceChange[];
  changeLog: ClientChange[];
}) {
  const today = new Date().toISOString().slice(0, 10);
  // Latest change that has actually taken effect — a future-dated one hasn't
  // restarted the uplift clock yet.
  const lastUpliftOf = (clientId: string) =>
    priceChanges.filter(p => p.client_id === clientId && p.effective_date <= today)
      .map(p => p.effective_date).sort().pop() ?? null;
  const lastChangeOf = (clientId: string, field: "status" | "contract_end_date") =>
    changeLog.filter(l => l.client_id === clientId && l.field === field)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date)).pop() ?? null;
  const pendingOf = (clientId: string) =>
    priceChanges.filter(p => p.client_id === clientId && p.effective_date > today)
      .sort((a, b) => a.effective_date.localeCompare(b.effective_date))[0] ?? null;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [edit, setEdit] = useState<{ id: string; field: string } | null>(null);
  // A fee change goes through a dialog rather than an inline edit: it needs a date
  // it takes effect from, which an in-cell number box has nowhere to put.
  const [priceEdit, setPriceEdit] = useState<ClientTableRow | null>(null);
  // Fee history for one client, where a change can be cancelled or undone.
  const [historyFor, setHistoryFor] = useState<ClientTableRow | null>(null);
  const [removingChange, setRemovingChange] = useState<string | null>(null);
  const [priceValue, setPriceValue] = useState("");
  const [priceDate, setPriceDate] = useState("");
  const [priceReason, setPriceReason] = useState("");
  const [savingPrice, setSavingPrice] = useState(false);

  // Stage and contract-end changes carry a date the field itself can't hold —
  // when it took effect, which is what revenue needs — so both go through a
  // dialog rather than an inline control.
  const [billingEdit, setBillingEdit] = useState<ClientTableRow | null>(null);
  const [changeEdit, setChangeEdit] = useState<{ client: ClientTableRow; field: "status" | "contract_end_date" } | null>(null);
  const [changeValue, setChangeValue] = useState("");
  const [changeDate, setChangeDate] = useState("");
  const [changeReason, setChangeReason] = useState("");
  const [savingChange, setSavingChange] = useState(false);

  const openChangeDialog = (client: ClientTableRow, field: "status" | "contract_end_date") => {
    setChangeEdit({ client, field });
    setChangeValue(field === "status" ? (client.status ?? "active") : (client.contract_end_date ?? ""));
    setChangeDate(
      field === "contract_end_date"
        ? (client.contract_end_date ?? new Date().toISOString().slice(0, 10))
        : new Date().toISOString().slice(0, 10),
    );
    setChangeReason("");
  };

  const saveChange = async () => {
    if (!changeEdit || !changeDate) return;
    setSavingChange(true);
    await onFieldChange(changeEdit.client, changeEdit.field, changeValue || null, changeDate, changeReason.trim());
    setSavingChange(false);
    setChangeEdit(null);
  };

  const openPriceDialog = (c: ClientTableRow) => {
    setPriceEdit(c);
    setPriceValue(c.mrr > 0 ? String(c.mrr) : "");
    // A client with no fee yet is being priced for the first time, not repriced:
    // it starts when their contract does (or today for one already running), and
    // nothing is logged, because "£0 → £909.50" is not a price rise.
    const d = new Date();
    setPriceDate(
      c.mrr > 0
        ? new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().slice(0, 10)
        : (c.contract_start_date ?? d.toISOString().slice(0, 10)),
    );
    setPriceReason("");
  };

  const savePrice = async () => {
    if (!priceEdit) return;
    const v = parseFloat(priceValue);
    if (isNaN(v)) return;
    const isFirstPrice = Number(priceEdit.mrr) <= 0;
    if (!isFirstPrice && !priceDate) return;
    setSavingPrice(true);
    if (isFirstPrice) await onSetInitialPrice(priceEdit, v);
    else await onPriceChange(priceEdit, v, priceDate, priceReason.trim());
    setSavingPrice(false);
    setPriceEdit(null);
  };

  // Sorting applies inside each processor group — the grouping is the point of
  // this table, so sorting across it would destroy the thing it's showing.
  type ClientSortKey = "name" | "status" | "contract_start_date" | "contract_end_date" | "mrr" | "profit" | "tenure";
  const [sortKey, setSortKey] = useState<ClientSortKey>("mrr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const toggleSort = (k: ClientSortKey) => {
    if (sortKey === k) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(k); setSortDir(k === "name" ? "asc" : "desc"); }
  };
  const sortRows = (items: ClientTableRow[]) => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...items].sort((a, b) => {
      const pick = (r: ClientTableRow) => {
        switch (sortKey) {
          case "name": return r.name?.toLowerCase() ?? "";
          case "status": return r.status ?? "";
          case "contract_start_date":
          case "tenure": return r.contract_start_date ?? "";
          case "contract_end_date": return r.contract_end_date ?? "";
          case "mrr": return Number(r.mrr) || 0;
          case "profit": return r.profit ?? -Infinity;
        }
      };
      const av = pick(a), bv = pick(b);
      if (typeof av === "string" || typeof bv === "string") {
        // Blank dates sort last whichever way the column is pointing, so an
        // empty cell never looks like the oldest or newest value.
        if (!av && bv) return 1;
        if (av && !bv) return -1;
        return String(av).localeCompare(String(bv)) * dir;
      }
      return ((av as number) - (bv as number)) * dir;
    });
  };

  // Rendered as a function, not an inline component: a component defined in the
  // render body gets a new identity every pass, and React then replaces the
  // header cell instead of reconciling it — which loses clicks.
  const sortHead = (k: ClientSortKey, label: string, extra = "", align: "left" | "right" = "left") => {
    const active = sortKey === k;
    const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th className={cn("font-medium px-4 py-2.5", align === "right" ? "text-right" : "text-left", extra)}>
        <button type="button" onClick={() => toggleSort(k)} aria-label={`Sort by ${label}`}
          className={cn("inline-flex items-center gap-1 hover:text-primary transition-colors",
            align === "right" && "ml-auto", active && "text-primary")}>
          <span>{label}</span><Icon className="h-3 w-3 opacity-70" />
        </button>
      </th>
    );
  };

  // Inactive clients group together regardless of who used to bill them, so the
  // Zoho and FreeAgent sums read as live books rather than history.
  const isChurned = (r: ClientTableRow) => (r.status ?? "active") === "inactive";
  const groups = (["zoho", "freeagent", "other", "inactive"] as const)
    .map(key => ({
      key,
      meta: PROCESSOR_META[key],
      items: sortRows(rows.filter(r => (key === "inactive" ? isChurned(r) : !isChurned(r) && r.processor === key))),
    }))
    .filter(g => g.items.length > 0);

  return (
    <div className="rounded-lg border overflow-hidden bg-card">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            {sortHead("name", "Client")}
            {sortHead("status", "Sales Stage", "w-[150px]")}
            <th className="text-left font-medium px-4 py-2.5 w-[110px]">Billing</th>
            {sortHead("contract_start_date", "Contract start", "w-[120px]")}
            {sortHead("tenure", "Tenure", "w-[150px]")}
            {sortHead("contract_end_date", "Contract end", "w-[120px]")}
            {sortHead("mrr", "MRR (gross)", "w-[130px]", "right")}
            {sortHead("profit", "Est. profit", "w-[130px]", "right")}
            <th className="text-right font-medium px-4 py-2.5 w-[90px]">Margin</th>
          </tr>
        </thead>
        {groups.map(g => {
          const isCollapsed = collapsed[g.key];
          // Group sum counts Active clients only, so totals keep matching the
          // revenue figures even with Pending/Inactive clients listed below.
          const sum = g.items.filter(c => (c.status ?? "active") === "active").reduce((a, c) => a + c.mrr, 0);
          return (
            <tbody key={g.key}>
              <tr
                className="cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors border-b"
                onClick={() => setCollapsed(prev => ({ ...prev, [g.key]: !isCollapsed }))}
              >
                <td colSpan={9} className="px-4 py-2">
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
                const isActive = (c.status ?? "active") === "active";
                return (
                  <tr key={c.id} className={cn("border-b last:border-0 hover:bg-muted/20 transition-colors", !isActive && "opacity-60")}>
                    <td className="px-4 py-3 font-medium">
                      <div className="flex items-center gap-2">
                        <span className={cn("h-4 w-1 rounded-full flex-shrink-0", isActive ? g.meta.bar : "bg-muted-foreground/30")} />
                        {c.name}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] cursor-pointer", stageMeta(c.status).cls)}
                        onClick={() => openChangeDialog(c, "status")}
                        title="Change sales stage — records when it took effect"
                      >{stageMeta(c.status).label}</Badge>
                      {(() => {
                        const last = lastChangeOf(c.id, "status");
                        if (!last) return null;
                        return (
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            since {new Date(last.effective_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "2-digit" })}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] cursor-pointer", PROCESSOR_META[c.processor].cls)}
                        onClick={() => setBillingEdit(c)}
                        title="Which system invoices this client"
                      >{c.processor === "other" ? "Set billing" : PROCESSOR_META[c.processor].label}</Badge>
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
                    <td className="px-4 py-3">
                      {(() => {
                        const t = clientTenure(c.contract_start_date, lastUpliftOf(c.id));
                        if (!t) return <span className="text-muted-foreground">—</span>;
                        return (
                          <div className="flex items-center gap-2">
                            <span className="text-muted-foreground">{t.label}</span>
                            {t.upliftDue && (
                              <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600 whitespace-nowrap">
                                Uplift due
                              </Badge>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td
                      className="px-4 py-3 text-muted-foreground cursor-pointer hover:text-primary"
                      onClick={() => openChangeDialog(c, "contract_end_date")}
                      title="Set or change the contract end date — recorded with a reason"
                    >
                      {c.contract_end_date ? new Date(c.contract_end_date).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </td>
                    <td
                      className="px-4 py-3 text-right tabular-nums cursor-pointer hover:text-primary"
                      onClick={() => openPriceDialog(c)}
                      title="Change fee — records when it takes effect"
                    >
                      {c.mrr > 0 ? gbp2(c.mrr) : (
                        <span className="text-amber-600 text-xs font-medium">No price set</span>
                      )}
                      {/* Only offered when there's something to undo. */}
                      {priceChanges.some(pc => pc.client_id === c.id) && !pendingOf(c.id) && (
                        <button type="button" onClick={e => { e.stopPropagation(); setHistoryFor(c); }}
                          className="block ml-auto text-[10px] text-muted-foreground hover:text-primary hover:underline">
                          fee history
                        </button>
                      )}
                      {(() => {
                        const p = pendingOf(c.id);
                        if (!p) return null;
                        return (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); setHistoryFor(c); }}
                            title="Scheduled fee change — click to cancel it"
                            className={cn("text-[10px] font-medium hover:underline",
                              Number(p.new_mrr) > Number(c.mrr) ? "text-emerald-600" : "text-amber-600")}
                          >
                            → {gbp2(p.new_mrr)} on {new Date(p.effective_date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                          </button>
                        );
                      })()}
                    </td>
                    <td className={cn("px-4 py-3 text-right tabular-nums font-medium", c.profit == null ? "text-muted-foreground/60" : c.profit >= 0 ? "text-emerald-600" : "text-red-600")}>{c.profit == null ? "—" : gbp2(c.profit)}</td>
                    <td className={cn("px-4 py-3 text-right tabular-nums", c.margin == null ? "text-muted-foreground/60" : c.margin >= 0 ? "text-muted-foreground" : "text-red-600")}>{c.margin == null ? "—" : pct(c.margin)}</td>
                  </tr>
                );
              })}
            </tbody>
          );
        })}
      </table>
      <p className="px-4 py-2 text-[11px] text-muted-foreground border-t bg-muted/20">
        Pending and Inactive clients are listed (dimmed) but only "Active" stage clients count toward revenue, profit and the group sums. Profit is ex-VAT revenue minus total monthly cost allocated pro-rata. Contract start and end dates feed the revenue trend chart above — an end date stops that client counting from the month it falls in, in both the history and the projection. Inactive clients are grouped separately from the billing systems. Click a fee to set or change it — an existing fee asks when the new price takes effect and is logged on the chart; a first fee is just recorded. Click a scheduled change or "fee history" to cancel or undo one. Click the billing pill to say whether Zoho or FreeAgent invoices them · double-click either contract date to edit · click the stage pill to change it · click a group header to collapse it.
      </p>

      {/* Fee history — where a scheduled change is cancelled and an applied one
          is undone. The chart reads this log, so removing an entry that is
          currently setting the price has to move the live fee back with it,
          otherwise the table and the chart would disagree. */}
      <Dialog open={!!historyFor} onOpenChange={o => { if (!o && !removingChange) setHistoryFor(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fee history — {historyFor?.name}</DialogTitle>
            <DialogDescription>
              Cancel a change that hasn't happened yet, or undo one that has.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-1 max-h-[50vh] overflow-y-auto">
            {(() => {
              if (!historyFor) return null;
              const mine = priceChanges
                .filter(pc => pc.client_id === historyFor.id)
                .sort((a, b) => b.effective_date.localeCompare(a.effective_date));
              if (mine.length === 0) {
                return <p className="text-sm text-muted-foreground">No fee changes recorded.</p>;
              }
              // The one setting the price right now: the most recent that has
              // taken effect. Undoing it is what has to move the live fee.
              const inForce = mine.filter(pc => pc.effective_date <= today)[0] ?? null;
              return mine.map(pc => {
                const scheduled = pc.effective_date > today;
                const isInForce = inForce?.id === pc.id;
                const up = Number(pc.new_mrr) > Number(pc.previous_mrr ?? 0);
                return (
                  <div key={pc.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium tabular-nums">
                          {gbp2(Number(pc.previous_mrr ?? 0))} → {gbp2(Number(pc.new_mrr))}
                        </span>
                        <Badge variant="outline" className={cn("text-[10px]",
                          up ? "border-emerald-300 text-emerald-600" : "border-amber-300 text-amber-600")}>
                          {up ? "increase" : "decrease"}
                        </Badge>
                        {scheduled && (
                          <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600">scheduled</Badge>
                        )}
                        {isInForce && (
                          <Badge variant="outline" className="text-[10px]">currently in force</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {scheduled ? "Takes effect " : "Took effect "}
                        {new Date(pc.effective_date).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}
                        {pc.reason ? ` · ${pc.reason}` : ""}
                      </p>
                      {isInForce && (
                        <p className="text-[11px] text-amber-600 mt-1">
                          Undoing this puts the fee back to {gbp2(Number(pc.previous_mrr ?? 0))}/mo.
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline" size="sm" className="flex-shrink-0"
                      disabled={removingChange === pc.id}
                      onClick={async () => {
                        setRemovingChange(pc.id);
                        await onRemovePriceChange(historyFor, pc, isInForce);
                        setRemovingChange(null);
                        setHistoryFor(null);
                      }}
                    >
                      {removingChange === pc.id ? "Removing…" : scheduled ? "Cancel" : "Undo"}
                    </Button>
                  </div>
                );
              });
            })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* Which system invoices this client. A plain attribute, not a dated change:
          moving a client between Zoho and FreeAgent doesn't alter what they pay. */}
      <Dialog open={!!billingEdit} onOpenChange={o => { if (!o) setBillingEdit(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Billing system — {billingEdit?.name}</DialogTitle>
            <DialogDescription>Which system raises this client's invoices.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 py-1">
            {[
              { value: "Zoho", label: "Zoho" },
              { value: "FreeAgent", label: "FreeAgent" },
              { value: null, label: "Not set" },
            ].map(opt => {
              const current = processorOf(billingEdit?.software ?? null);
              const selected = opt.value ? processorOf(opt.value) === current : current === "other";
              return (
                <Button
                  key={opt.label}
                  variant={selected ? "default" : "outline"}
                  className="justify-start"
                  onClick={() => {
                    if (billingEdit) onPatch(billingEdit.id, { software: opt.value } as Partial<ClientRow>);
                    setBillingEdit(null);
                  }}
                >
                  {opt.label}{selected && " ✓"}
                </Button>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Stage / contract-end change — the effective date is the point of it. */}
      <Dialog open={!!changeEdit} onOpenChange={o => { if (!o && !savingChange) setChangeEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {changeEdit?.field === "status" ? "Change sales stage" : "Contract end date"} — {changeEdit?.client.name}
            </DialogTitle>
            <DialogDescription>
              {changeEdit?.field === "status"
                ? "Moving a client out of Active stops them counting toward revenue from the date you set — not from today."
                : "Revenue stops counting this client from the month their contract lapses."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {changeEdit?.field === "status" ? (
              <div className="space-y-1.5">
                <Label>New stage</Label>
                <Select value={changeValue} onValueChange={setChangeValue}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{SALES_STAGES.map(st => <SelectItem key={st.value} value={st.value}>{st.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="change-date">
                {changeEdit?.field === "status" ? "Effective from" : "Contract ends"}
              </Label>
              <Input id="change-date" type="date"
                value={changeEdit?.field === "contract_end_date" ? changeValue : changeDate}
                onChange={e => (changeEdit?.field === "contract_end_date" ? setChangeValue(e.target.value) : setChangeDate(e.target.value))} />
              {changeEdit?.field === "contract_end_date" && (
                <button type="button" onClick={() => setChangeValue("")}
                  className="text-[11px] text-primary hover:underline">Clear end date (contract continues)</button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="change-reason">Reason</Label>
              <Textarea id="change-reason" rows={2} value={changeReason} onChange={e => setChangeReason(e.target.value)}
                placeholder="e.g. gave notice, went in-house, agency closed, moved to annual contract" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangeEdit(null)} disabled={savingChange}>Cancel</Button>
            <Button onClick={saveChange} disabled={savingChange}>{savingChange ? "Saving…" : "Save change"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fee change — captures the effective date, so a rise agreed today but
          starting next month is projected from next month, not applied to history. */}
      <Dialog open={!!priceEdit} onOpenChange={o => { if (!o && !savingPrice) setPriceEdit(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {priceEdit && Number(priceEdit.mrr) > 0 ? "Change fee" : "Set fee"} — {priceEdit?.name}
            </DialogTitle>
            <DialogDescription>
              {priceEdit && Number(priceEdit.mrr) > 0
                ? `Currently ${gbp2(priceEdit.mrr)}/mo. The new price applies from the date you set.`
                : "Their agreed monthly fee. Revenue starts counting from their contract start date."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className={cn("grid gap-3", priceEdit && Number(priceEdit.mrr) > 0 ? "grid-cols-2" : "grid-cols-1")}>
              <div className="space-y-1.5">
                <Label htmlFor="new-fee">Monthly fee</Label>
                <Input id="new-fee" type="number" step="0.01" value={priceValue}
                  onChange={e => setPriceValue(e.target.value)} className="text-right" />
              </div>
              {priceEdit && Number(priceEdit.mrr) > 0 && (
                <div className="space-y-1.5">
                  <Label htmlFor="fee-date">Effective from</Label>
                  <Input id="fee-date" type="date" value={priceDate} onChange={e => setPriceDate(e.target.value)} />
                </div>
              )}
            </div>
            {priceEdit && !isNaN(parseFloat(priceValue)) && parseFloat(priceValue) !== Number(priceEdit.mrr) && (
              <p className={cn("text-xs font-medium",
                parseFloat(priceValue) > Number(priceEdit.mrr) ? "text-emerald-600" : "text-amber-600")}>
                {parseFloat(priceValue) > Number(priceEdit.mrr) ? "Increase" : "Decrease"} of{" "}
                {gbp2(Math.abs(parseFloat(priceValue) - Number(priceEdit.mrr)))}/mo
                {Number(priceEdit.mrr) > 0 && ` (${((parseFloat(priceValue) - Number(priceEdit.mrr)) / Number(priceEdit.mrr) * 100).toFixed(1)}%)`}
              </p>
            )}
            {priceEdit && Number(priceEdit.mrr) > 0 && (
              <div className="space-y-1.5">
                <Label htmlFor="fee-reason">Reason</Label>
                <Textarea id="fee-reason" rows={2} value={priceReason} onChange={e => setPriceReason(e.target.value)}
                  placeholder="e.g. annual 5% uplift, added Airtable, reduced to 2 days" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPriceEdit(null)} disabled={savingPrice}>Cancel</Button>
            <Button onClick={savePrice}
              disabled={savingPrice || isNaN(parseFloat(priceValue))
                || (Number(priceEdit?.mrr ?? 0) > 0 && (!priceDate || parseFloat(priceValue) === Number(priceEdit?.mrr)))
                || (Number(priceEdit?.mrr ?? 0) <= 0 && parseFloat(priceValue) <= 0)}>
              {savingPrice ? "Saving…" : Number(priceEdit?.mrr ?? 0) > 0 ? "Save change" : "Set fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
