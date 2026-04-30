import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Send, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { downloadInvoicePdf, getInvoicePdfBlob, type InvoiceData } from "@/lib/invoice/generatePdf";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  staffUserId: string;
  staffName?: string;
  staffEmail?: string;
  month: Date; // first day of month
  defaultAmount: number;
  defaultCurrency: string;
  onInvoiceSaved?: () => void;
}

interface BillTo {
  company_name: string;
  company_number: string | null;
  address_lines: string[];
}

export function InvoiceGeneratorDialog({
  open,
  onOpenChange,
  staffUserId,
  staffName,
  staffEmail,
  month,
  defaultAmount,
  defaultCurrency,
  onInvoiceSaved,
}: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [contractor, setContractor] = useState<any>(null);
  const [billTo, setBillTo] = useState<BillTo | null>(null);
  const [description, setDescription] = useState("Remote support service");
  const [amount, setAmount] = useState(defaultAmount);
  const [currency, setCurrency] = useState(defaultCurrency);
  const [dateRequested, setDateRequested] = useState<string>(
    format(new Date(month.getFullYear(), month.getMonth() + 1, 1), "yyyy-MM-dd")
  );
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(defaultAmount);
    setCurrency(defaultCurrency);
    setDateRequested(
      format(new Date(month.getFullYear(), month.getMonth() + 1, 1), "yyyy-MM-dd")
    );
    setDescription(`Remote support service - ${format(month, "MMMM yyyy")}`);
  }, [open, defaultAmount, defaultCurrency, month]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [{ data: c }, { data: b }] = await Promise.all([
        supabase
          .from("contractor_invoice_details")
          .select("*")
          .eq("user_id", staffUserId)
          .maybeSingle(),
        supabase
          .from("invoice_bill_to_settings")
          .select("*")
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!active) return;
      setContractor(c);
      setBillTo(b as BillTo | null);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [open, staffUserId]);

  const detailsMissing = useMemo(() => {
    if (!contractor) return true;
    return (
      !contractor.company_name ||
      !contractor.bank_account_name ||
      !contractor.bank_account_number ||
      !contractor.bank_name
    );
  }, [contractor]);

  const buildInvoiceData = (invoiceNumber: number | string): InvoiceData => ({
    invoiceNumber,
    dateRequested,
    description,
    amount,
    currency,
    companyName: contractor?.company_name || "",
    contactName: contractor?.contact_name || staffName || "",
    phone: contractor?.phone || "",
    email: contractor?.email || staffEmail || "",
    address: contractor?.company_address || "",
    bankAccountName: contractor?.bank_account_name || "",
    bankAccountNumber: contractor?.bank_account_number || "",
    bankName: contractor?.bank_name || "",
    sortCode: contractor?.sort_code || "",
    iban: contractor?.iban || "",
    swift: contractor?.swift || "",
    billTo: {
      companyName: billTo?.company_name || "Care Cuddle Ltd",
      companyNumber: billTo?.company_number || undefined,
      addressLines: billTo?.address_lines || [],
    },
  });

  const persistInvoice = async (status: "draft" | "sent") => {
    if (!user) throw new Error("Not authenticated");
    const monthStr = format(month, "yyyy-MM-01");
    const { data: row, error } = await supabase
      .from("staff_invoices")
      .insert({
        user_id: staffUserId,
        month: monthStr,
        description,
        amount,
        currency,
        status,
        date_requested: dateRequested,
        created_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;
    return row;
  };

  const handleDownload = async () => {
    if (detailsMissing) return;
    setBusy(true);
    try {
      const row = await persistInvoice("draft");
      await downloadInvoicePdf(buildInvoiceData(row.invoice_number));
      toast({ title: "Invoice generated", description: `Invoice #${row.invoice_number} downloaded.` });
      onInvoiceSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handleEmail = async () => {
    if (detailsMissing) return;
    setBusy(true);
    try {
      const row = await persistInvoice("sent");
      const pdfBlob = await getInvoicePdfBlob(buildInvoiceData(row.invoice_number));

      // Upload PDF to storage to avoid edge function body size limits
      const storagePath = `${staffUserId}/${row.id}-${row.invoice_number}.pdf`;
      const { error: uploadError } = await supabase.storage
        .from("invoice-pdfs")
        .upload(storagePath, pdfBlob, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { error: fnError } = await supabase.functions.invoke("send-invoice-email", {
        body: {
          invoiceId: row.id,
          pdfStoragePath: storagePath,
          staffEmail: staffEmail,
          staffName: staffName,
        },
      });
      if (fnError) throw fnError;

      toast({
        title: "Invoice sent",
        description: `Invoice #${row.invoice_number} emailed to admins.`,
      });
      onInvoiceSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generate Invoice — {format(month, "MMMM yyyy")}</DialogTitle>
          <DialogDescription>
            Create a contractor invoice based on your Pay Forecast. Edit the
            description and amount if needed before downloading or sending.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            {detailsMissing && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Contractor / company details are missing. Add your company
                  name and bank details in the "Contractor / Invoicing Details"
                  section before generating an invoice.
                </AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Date Requested</Label>
                <Input
                  type="date"
                  value={dateRequested}
                  onChange={(e) => setDateRequested(e.target.value)}
                />
              </div>
              <div>
                <Label>Currency</Label>
                <Input
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                />
              </div>
            </div>

            <div>
              <Label>Description of Job</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
              />
            </div>

            <div>
              <Label>Amount</Label>
              <Input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              />
            </div>

            {contractor && (
              <div className="rounded-md border p-3 bg-muted/30 text-sm space-y-1">
                <div className="font-semibold">{contractor.company_name || "—"}</div>
                {contractor.contact_name && <div>{contractor.contact_name}</div>}
                {contractor.email && <div className="text-muted-foreground">{contractor.email}</div>}
                {contractor.bank_account_name && (
                  <div className="text-muted-foreground">
                    Pay to: {contractor.bank_account_name} · {contractor.bank_account_number} · {contractor.bank_name}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={handleDownload}
            disabled={busy || loading || detailsMissing || amount <= 0}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button
            onClick={handleEmail}
            disabled={busy || loading || detailsMissing || amount <= 0}
          >
            {busy ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Send to Admins
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
