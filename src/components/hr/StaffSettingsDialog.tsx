import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Shield, Infinity, Plus, X, Loader2, Coins } from "lucide-react";
import { calculateHolidayAllowance } from "./StaffHolidaysManager";

// Per-staff settings editor, shared between the Staffing Settings roster and
// the Staff Profile view. Self-contained: give it a userId and it fetches,
// edits and saves that person's profiles/hr_profiles/staff_client_assignments
// rows — the same fields and save steps as the Staffing Settings dialog.

type EmploymentStatus = 'onboarding_probation' | 'onboarding_passed' | 'active' | 'inactive_left' | 'inactive_fired';

const EMPLOYMENT_STATUSES = [
  { value: 'onboarding_probation', label: 'Onboarding - On Probation' },
  { value: 'onboarding_passed', label: 'Onboarding - Passed Probation' },
  { value: 'active', label: 'Active' },
  { value: 'inactive_left', label: 'Inactive - Left' },
  { value: 'inactive_fired', label: 'Inactive - Fired' },
];

const SCHEDULING_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
];

const CURRENCIES = [
  { code: 'GBP', symbol: '£' },
  { code: 'USD', symbol: '$' },
  { code: 'EUR', symbol: '€' },
  { code: 'INR', symbol: '₹' },
  { code: 'AED', symbol: 'د.إ' },
  { code: 'AUD', symbol: 'A$' },
  { code: 'CAD', symbol: 'C$' },
  { code: 'PHP', symbol: '₱' },
  { code: 'ZAR', symbol: 'R' },
  { code: 'NGN', symbol: '₦' },
];

const PAY_FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'annually', label: 'Annually' },
];

const APP_ROLES = [
  { value: 'viewer', label: 'Viewer' },
  { value: 'editor', label: 'Editor' },
  { value: 'training_manager', label: 'Training Manager' },
  { value: 'admin', label: 'Admin' },
];

const EMPTY_FORM = {
  display_name: '',
  employee_id: '',
  job_title: '',
  work_phone: '',
  start_date: '',
  employment_end_date: '',
  base_currency: 'GBP',
  base_salary: 0,
  pay_frequency: 'monthly',
  annual_holiday_allowance: 28,
  unlimited_holiday: false,
  public_holiday_pay_disabled: false,
  bonus_pot_eligible: true,
  notes: '',
  scheduling_role: 'viewer',
  employment_status: 'onboarding_probation' as EmploymentStatus,
  app_role: 'viewer',
};

interface StaffSettingsDialogProps {
  userId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful save so the parent can refetch. */
  onSaved?: () => void;
}

export function StaffSettingsDialog({ userId, open, onOpenChange, onSaved }: StaffSettingsDialogProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [existingHRId, setExistingHRId] = useState<string | null>(null);
  const [staffEmail, setStaffEmail] = useState<string | null>(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [allClients, setAllClients] = useState<{ id: string; name: string }[]>([]);
  const [staffClients, setStaffClients] = useState<string[]>([]);
  const [newClientName, setNewClientName] = useState('');
  const [selectedClient, setSelectedClient] = useState('');

  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [{ data: profile }, { data: hr }, { data: assignments }, { data: clients }] = await Promise.all([
          supabase.from('profiles').select('user_id, display_name, email, role').eq('user_id', userId).maybeSingle(),
          supabase.from('hr_profiles').select('*').eq('user_id', userId).maybeSingle(),
          supabase.from('staff_client_assignments').select('client_name').eq('staff_user_id', userId),
          supabase.from('clients').select('id, name').order('name'),
        ]);
        if (cancelled) return;
        setStaffEmail(profile?.email ?? null);
        setExistingHRId(hr?.id ?? null);
        setAllClients(clients || []);
        setStaffClients((assignments || []).map(a => a.client_name));
        setNewClientName('');
        setSelectedClient('');
        setFormData({
          display_name: profile?.display_name || '',
          employee_id: hr?.employee_id || '',
          job_title: hr?.job_title || '',
          work_phone: (hr as any)?.work_phone || '',
          start_date: hr?.start_date || '',
          employment_end_date: (hr as any)?.employment_end_date || '',
          base_currency: hr?.base_currency || 'GBP',
          base_salary: hr?.base_salary || 0,
          pay_frequency: hr?.pay_frequency || 'monthly',
          annual_holiday_allowance: hr?.annual_holiday_allowance || 28,
          unlimited_holiday: hr?.unlimited_holiday || false,
          public_holiday_pay_disabled: (hr as any)?.public_holiday_pay_disabled || false,
          bonus_pot_eligible: (hr as any)?.bonus_pot_eligible !== false,
          notes: hr?.notes || '',
          scheduling_role: hr?.scheduling_role || 'viewer',
          employment_status: (hr?.employment_status as EmploymentStatus) || 'onboarding_probation',
          app_role: profile?.role || 'viewer',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, userId]);

  const handleAddClient = async (clientName?: string) => {
    const trimmed = (clientName || newClientName).trim();
    if (!trimmed) return;
    if (staffClients.includes(trimmed)) {
      toast({ title: "Already assigned", description: "This client is already assigned to this staff member", variant: "destructive" });
      return;
    }
    const existingClient = allClients.find(c => c.name.toLowerCase() === trimmed.toLowerCase());
    if (!existingClient) {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: newClient, error } = await supabase
            .from('clients')
            .insert({ name: trimmed, created_by: user.id })
            .select()
            .single();
          if (!error && newClient) setAllClients([...allClients, newClient]);
        }
      } catch (error) {
        console.error('Error adding client to database:', error);
      }
    }
    setStaffClients([...staffClients, trimmed]);
    setNewClientName('');
    setSelectedClient('');
  };

  const handleSave = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      const profileUpdate: { display_name?: string; role?: string } = {};
      if (formData.display_name.trim()) profileUpdate.display_name = formData.display_name.trim();
      if (formData.app_role) profileUpdate.role = formData.app_role;
      if (Object.keys(profileUpdate).length > 0) {
        const { error } = await supabase.from('profiles').update(profileUpdate).eq('user_id', userId);
        if (error) throw error;
      }

      const profileData = {
        user_id: userId,
        employee_id: formData.employee_id || null,
        job_title: formData.job_title || null,
        work_phone: formData.work_phone || null,
        department: null,
        start_date: formData.start_date || null,
        employment_end_date: formData.employment_end_date || null,
        base_currency: formData.base_currency,
        base_salary: formData.base_salary || null,
        pay_frequency: formData.pay_frequency || 'monthly',
        annual_holiday_allowance: formData.annual_holiday_allowance,
        unlimited_holiday: formData.unlimited_holiday,
        public_holiday_pay_disabled: formData.public_holiday_pay_disabled,
        bonus_pot_eligible: formData.bonus_pot_eligible,
        notes: formData.notes || null,
        scheduling_role: formData.scheduling_role,
        employment_status: formData.employment_status,
      };

      if (existingHRId) {
        const { error } = await supabase.from('hr_profiles').update(profileData as any).eq('id', existingHRId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('hr_profiles').insert(profileData as any);
        if (error) throw error;
      }

      const { error: deleteError } = await supabase
        .from('staff_client_assignments')
        .delete()
        .eq('staff_user_id', userId);
      if (deleteError) throw deleteError;
      if (staffClients.length > 0) {
        const { error: insertError } = await supabase
          .from('staff_client_assignments')
          .insert(staffClients.map(clientName => ({ staff_user_id: userId, client_name: clientName })));
        if (insertError) throw insertError;
      }

      // On first-time setup in an onboarding status, email the onboarding
      // invite — same behavior as the Staffing Settings roster dialog.
      if (!existingHRId && String(formData.employment_status).startsWith('onboarding') && staffEmail) {
        try {
          await supabase.functions.invoke('send-onboarding-offer', {
            body: {
              recipientEmail: staffEmail,
              recipientName: formData.display_name || staffEmail,
              subject: 'Welcome to Care Cuddle — start your onboarding',
              bodyHtml: "<p>Your Care Cuddle account is ready. Click below to begin your onboarding — you'll be guided through each step, and you can request your offer letter and employment contract from there.</p>",
            },
          });
          await supabase.from('hr_profiles')
            .update({ onboarding_started_at: new Date().toISOString() })
            .eq('user_id', userId);
        } catch (e) {
          console.error('onboarding invite failed', e);
        }
      }

      toast({ title: "Success", description: existingHRId ? "Staff settings updated" : "Staff profile created" });
      onOpenChange(false);
      onSaved?.();
    } catch (error: any) {
      console.error('Error saving staff settings:', error);
      toast({ title: "Error", description: error.message || "Failed to save settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl w-[90vw] max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>{existingHRId ? 'Edit Staff Settings' : 'Set Up Staff Profile'}</DialogTitle>
          <DialogDescription>
            Configure details for <strong>{formData.display_name || staffEmail || 'this staff member'}</strong>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <ScrollArea className="flex-1 pr-4 max-h-[calc(90vh-180px)] overflow-y-auto">
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                <h3 className="font-semibold">Employment Details</h3>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Display Name</Label>
                  <Input
                    value={formData.display_name}
                    onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                    placeholder="How their name appears in the system"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input
                    value={formData.employee_id}
                    onChange={(e) => setFormData({ ...formData, employee_id: e.target.value })}
                    placeholder="EMP001"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Employment Status</Label>
                <Select
                  value={formData.employment_status}
                  onValueChange={(value) => setFormData({ ...formData, employment_status: value as EmploymentStatus })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {EMPLOYMENT_STATUSES.map(status => (
                      <SelectItem key={status.value} value={status.value}>{status.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Employment Start Date</Label>
                  <Input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Employment End Date</Label>
                  <Input
                    type="date"
                    value={formData.employment_end_date}
                    onChange={(e) => setFormData({ ...formData, employment_end_date: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Leave blank if currently employed</p>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Infinity className="h-5 w-5 text-primary" />
                  <div>
                    <Label className="text-base font-medium">Unlimited Holiday</Label>
                    <p className="text-sm text-muted-foreground">
                      No accrual, no balance tracking, no June refund/deduction
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.unlimited_holiday}
                  onCheckedChange={(checked) => setFormData({ ...formData, unlimited_holiday: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-primary" />
                  <div>
                    <Label className="text-base font-medium">Disable Public Holiday Pay</Label>
                    <p className="text-sm text-muted-foreground">
                      Exclude this staff member from public holiday overtime (0.5× bonus)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={!!formData.public_holiday_pay_disabled}
                  onCheckedChange={(checked) => setFormData({ ...formData, public_holiday_pay_disabled: checked })}
                />
              </div>

              <div className="flex items-center justify-between p-4 border rounded-lg bg-muted/30">
                <div className="flex items-center gap-3">
                  <Coins className="h-5 w-5 text-amber-500" />
                  <div>
                    <Label className="text-base font-medium">Eligible for bonus pot</Label>
                    <p className="text-sm text-muted-foreground">
                      When off, this staff member never receives a share of the monthly bonus pot. (A D rating is excluded automatically regardless.)
                    </p>
                  </div>
                </div>
                <Switch
                  checked={formData.bonus_pot_eligible !== false}
                  onCheckedChange={(checked) => setFormData({ ...formData, bonus_pot_eligible: checked })}
                />
              </div>

              {formData.start_date && !formData.unlimited_holiday && (
                <Card className="bg-muted/50">
                  <CardContent className="p-3">
                    <div className="text-sm space-y-1">
                      {(() => {
                        const allowanceInfo = calculateHolidayAllowance(formData.start_date);
                        return (
                          <>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Annual Allowance:</span>
                              <span className="font-medium">{allowanceInfo.annualAllowance} days</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted-foreground">Accrued to date:</span>
                              <span className="font-medium">{allowanceInfo.accruedAllowance} days</span>
                            </div>
                          </>
                        );
                      })()}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input
                    value={formData.job_title}
                    onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                    placeholder="Care Assistant"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Work Phone Number</Label>
                  <Input
                    value={formData.work_phone}
                    onChange={(e) => setFormData({ ...formData, work_phone: e.target.value })}
                    placeholder="+44 7700 900000"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Application Role</Label>
                  <Select
                    value={formData.app_role}
                    onValueChange={(value) => setFormData({ ...formData, app_role: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {APP_ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Scheduling Role</Label>
                  <Select
                    value={formData.scheduling_role}
                    onValueChange={(value) => setFormData({ ...formData, scheduling_role: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {SCHEDULING_ROLES.map(role => (
                        <SelectItem key={role.value} value={role.value}>{role.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Assigned Clients</Label>
                {allClients.filter(c => !staffClients.includes(c.name)).length > 0 && (
                  <Select
                    value={selectedClient}
                    onValueChange={(clientName) => {
                      if (clientName && !staffClients.includes(clientName)) {
                        setStaffClients([...staffClients, clientName]);
                      }
                      setSelectedClient('');
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select existing client..." />
                    </SelectTrigger>
                    <SelectContent>
                      {allClients
                        .filter(c => !staffClients.includes(c.name))
                        .map(client => (
                          <SelectItem key={client.id} value={client.name}>{client.name}</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex gap-2">
                  <Input
                    value={newClientName}
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Or add new client..."
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddClient();
                      }
                    }}
                  />
                  <Button type="button" variant="secondary" onClick={() => handleAddClient()}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {staffClients.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {staffClients.map((client, idx) => (
                      <Badge key={idx} variant="secondary" className="flex items-center gap-1 pr-1">
                        {client}
                        <button
                          type="button"
                          onClick={() => setStaffClients(staffClients.filter(c => c !== client))}
                          className="ml-1 rounded-full hover:bg-destructive/20 p-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Base Salary</Label>
                  <Input
                    type="number"
                    value={formData.base_salary}
                    onChange={(e) => setFormData({ ...formData, base_salary: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Currency</Label>
                  <Select
                    value={formData.base_currency}
                    onValueChange={(value) => setFormData({ ...formData, base_currency: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map(currency => (
                        <SelectItem key={currency.code} value={currency.code}>
                          {currency.symbol} {currency.code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Pay Frequency</Label>
                  <Select
                    value={formData.pay_frequency}
                    onValueChange={(value) => setFormData({ ...formData, pay_frequency: value })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAY_FREQUENCIES.map(freq => (
                        <SelectItem key={freq.value} value={freq.value}>{freq.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
        )}

        <DialogFooter className="pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            {existingHRId ? 'Update Settings' : 'Create Profile'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
