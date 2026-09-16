import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RichTextEditor } from "@/components/ui/RichTextEditor";
import { Mail, FileSignature, Loader2, Save } from "lucide-react";

interface OnboardingSettings {
  id: string;
  offer_email_enabled: boolean;
  offer_email_subject: string;
  offer_email_body_html: string;
  contract_enabled: boolean;
  contract_template_id: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  is_archived: boolean;
}

export function OnboardingAutomationSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<OnboardingSettings | null>(null);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: s }, { data: t }] = await Promise.all([
      supabase
        .from("onboarding_settings")
        .select("id, offer_email_enabled, offer_email_subject, offer_email_body_html, contract_enabled, contract_template_id")
        .limit(1)
        .maybeSingle(),
      // Archived templates too — never to offer them, but so a setting still
      // pointing at one can be named and flagged instead of showing as a blank.
      supabase
        .from("contract_templates")
        .select("id, name, is_archived")
        .order("name"),
    ]);
    setSettings((s as OnboardingSettings) ?? null);
    setTemplates((t ?? []) as TemplateOption[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { error } = await supabase
      .from("onboarding_settings")
      .update({
        offer_email_enabled: settings.offer_email_enabled,
        offer_email_subject: settings.offer_email_subject,
        offer_email_body_html: settings.offer_email_body_html,
        contract_enabled: settings.contract_enabled,
        contract_template_id: settings.contract_template_id,
        updated_by: user?.id ?? null,
      })
      .eq("id", settings.id);
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't save", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Onboarding settings saved" });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (!settings) {
    return <p className="text-sm text-muted-foreground py-8">Onboarding settings could not be loaded.</p>;
  }

  const set = (patch: Partial<OnboardingSettings>) => setSettings({ ...settings, ...patch });

  const liveTemplates = templates.filter((t) => !t.is_archived);
  const chosen = templates.find((t) => t.id === settings.contract_template_id);
  // start-onboarding won't issue from a missing or archived template, so each of
  // these means new starters get their offer and nothing to sign. It has to be
  // said in words: an archived template isn't one of the options, so the
  // dropdown alone used to show an empty box and look like nothing was wrong.
  const templateProblem = !settings.contract_enabled
    ? null
    : !settings.contract_template_id
      ? "No template is chosen, so new starters are sent their offer but no contract."
      : !chosen
        ? "The template chosen here no longer exists, so new starters are sent their offer but no contract."
        : chosen.is_archived
          ? `"${chosen.name}" has been archived, so new starters are sent their offer but no contract.`
          : null;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-base font-semibold">Onboarding Automation</h3>
        <p className="text-sm text-muted-foreground">
          New staff are emailed a link to start onboarding when their profile is created. These configure what they
          receive when they click <strong>Receive my offer &amp; contract</strong> on their onboarding page.
        </p>
      </div>

      {/* Offer email */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-primary"><Mail className="h-5 w-5" /></div>
              <div>
                <p className="font-medium">Offer Email</p>
                <p className="text-sm text-muted-foreground">Sent to the staff member when onboarding starts.</p>
              </div>
            </div>
            <Switch
              checked={settings.offer_email_enabled}
              onCheckedChange={(v) => set({ offer_email_enabled: v })}
            />
          </div>

          {settings.offer_email_enabled && (
            <div className="space-y-3 ml-8 pl-3 border-l-2 border-muted">
              <div className="grid gap-1.5">
                <Label htmlFor="offer-subject">Subject</Label>
                <Input
                  id="offer-subject"
                  value={settings.offer_email_subject}
                  onChange={(e) => set({ offer_email_subject: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>Body</Label>
                <RichTextEditor
                  value={settings.offer_email_body_html}
                  onChange={(html) => set({ offer_email_body_html: html })}
                  minHeight={220}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employment contract */}
      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 text-primary"><FileSignature className="h-5 w-5" /></div>
              <div>
                <p className="font-medium">Employment Contract</p>
                <p className="text-sm text-muted-foreground">Automatically issued for signature when onboarding starts.</p>
              </div>
            </div>
            <Switch
              checked={settings.contract_enabled}
              onCheckedChange={(v) => set({ contract_enabled: v })}
            />
          </div>

          {settings.contract_enabled && (
            <div className="space-y-2 ml-8 pl-3 border-l-2 border-muted">
              <Label>Contract template</Label>
              <Select
                value={settings.contract_template_id ?? "none"}
                onValueChange={(v) => set({ contract_template_id: v === "none" ? null : v })}
              >
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Select a contract template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No template selected</SelectItem>
                  {chosen?.is_archived && (
                    <SelectItem value={chosen.id} disabled>{chosen.name} (archived)</SelectItem>
                  )}
                  {liveTemplates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {templateProblem && (
                <div className="max-w-md rounded-lg border border-destructive/50 bg-destructive/10 p-3 space-y-1">
                  <p className="text-sm font-medium text-destructive">New starters aren't getting a contract</p>
                  <p className="text-sm text-foreground">{templateProblem} Choose a current template and save.</p>
                </div>
              )}
              {liveTemplates.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  No contract templates yet — create one under Configuration → Contracts → Templates.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
          Save
        </Button>
      </div>
    </div>
  );
}
