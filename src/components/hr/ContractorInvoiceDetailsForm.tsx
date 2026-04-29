import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Save } from "lucide-react";

export interface ContractorDetails {
  id?: string;
  user_id: string;
  company_name: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  company_address: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  sort_code: string | null;
  iban: string | null;
  swift: string | null;
}

interface Props {
  userId: string;
  defaultContactName?: string;
  defaultEmail?: string;
  defaultPhone?: string;
  onSaved?: (d: ContractorDetails) => void;
}

const empty = (userId: string): ContractorDetails => ({
  user_id: userId,
  company_name: "",
  contact_name: "",
  phone: "",
  email: "",
  company_address: "",
  bank_account_name: "",
  bank_account_number: "",
  bank_name: "",
  sort_code: "",
  iban: "",
  swift: "",
});

export function ContractorInvoiceDetailsForm({
  userId,
  defaultContactName,
  defaultEmail,
  defaultPhone,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [data, setData] = useState<ContractorDetails>(empty(userId));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data: row } = await supabase
        .from("contractor_invoice_details")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (!active) return;
      if (row) {
        setData(row as ContractorDetails);
      } else {
        setData({
          ...empty(userId),
          contact_name: defaultContactName ?? "",
          email: defaultEmail ?? "",
          phone: defaultPhone ?? "",
        });
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId, defaultContactName, defaultEmail, defaultPhone]);

  const update = (patch: Partial<ContractorDetails>) =>
    setData((d) => ({ ...d, ...patch }));

  const save = async () => {
    setSaving(true);
    try {
      const payload = { ...data, user_id: userId };
      const { data: saved, error } = await supabase
        .from("contractor_invoice_details")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw error;
      toast({ title: "Saved", description: "Contractor invoice details updated." });
      setData(saved as ContractorDetails);
      onSaved?.(saved as ContractorDetails);
    } catch (e: any) {
      toast({
        title: "Error",
        description: e.message || "Failed to save details",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Building2 className="h-5 w-5 text-primary" />
          Contractor / Invoicing Details
        </CardTitle>
        <CardDescription>
          Used when generating invoices from your Pay Forecast. Populate your
          limited-company name, contact and bank details.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label>Company Name *</Label>
            <Input
              value={data.company_name ?? ""}
              onChange={(e) => update({ company_name: e.target.value })}
              placeholder="e.g. KHALE CONSULT LTD"
            />
          </div>
          <div>
            <Label>Requested By / Contact Name *</Label>
            <Input
              value={data.contact_name ?? ""}
              onChange={(e) => update({ contact_name: e.target.value })}
            />
          </div>
          <div>
            <Label>Phone Number</Label>
            <Input
              value={data.phone ?? ""}
              onChange={(e) => update({ phone: e.target.value })}
            />
          </div>
          <div>
            <Label>Email</Label>
            <Input
              type="email"
              value={data.email ?? ""}
              onChange={(e) => update({ email: e.target.value })}
            />
          </div>
        </div>
        <div>
          <Label>Company Address</Label>
          <Textarea
            value={data.company_address ?? ""}
            onChange={(e) => update({ company_address: e.target.value })}
            rows={3}
            placeholder="Street, City, Postcode, Country"
          />
        </div>
        <div className="border-t pt-4">
          <h4 className="font-semibold text-sm mb-3">Bank Account Details</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Account Name *</Label>
              <Input
                value={data.bank_account_name ?? ""}
                onChange={(e) => update({ bank_account_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Account Number *</Label>
              <Input
                value={data.bank_account_number ?? ""}
                onChange={(e) => update({ bank_account_number: e.target.value })}
              />
            </div>
            <div>
              <Label>Bank Name *</Label>
              <Input
                value={data.bank_name ?? ""}
                onChange={(e) => update({ bank_name: e.target.value })}
              />
            </div>
            <div>
              <Label>Sort Code</Label>
              <Input
                value={data.sort_code ?? ""}
                onChange={(e) => update({ sort_code: e.target.value })}
              />
            </div>
            <div>
              <Label>IBAN</Label>
              <Input
                value={data.iban ?? ""}
                onChange={(e) => update({ iban: e.target.value })}
              />
            </div>
            <div>
              <Label>SWIFT / BIC</Label>
              <Input
                value={data.swift ?? ""}
                onChange={(e) => update({ swift: e.target.value })}
              />
            </div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving}>
            <Save className="h-4 w-4 mr-2" />
            {saving ? "Saving…" : "Save Details"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
