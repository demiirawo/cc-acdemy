import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";

interface StaffProfile {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
}

interface TemplateOption {
  id: string;
  name: string;
  body_html: string;
}

interface SendContractDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent: () => void;
}

export function SendContractDialog({ open, onOpenChange, onSent }: SendContractDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [title, setTitle] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [{ data: profiles }, { data: tpls }] = await Promise.all([
        supabase
          .from("profiles")
          .select("user_id, display_name, email, role")
          .order("display_name"),
        supabase
          .from("contract_templates")
          .select("id, name, body_html")
          .eq("is_archived", false)
          .order("name"),
      ]);
      setStaff((profiles ?? []) as StaffProfile[]);
      setTemplates((tpls ?? []) as TemplateOption[]);
    })();
  }, [open]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId),
    [templates, templateId]
  );

  // Default the contract title from the chosen template.
  useEffect(() => {
    if (selectedTemplate && !title) setTitle(selectedTemplate.name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTemplate]);

  const reset = () => {
    setTemplateId("");
    setRecipientId("");
    setTitle("");
  };

  const send = async () => {
    const recipient = staff.find((s) => s.user_id === recipientId);
    if (!selectedTemplate || !recipient || !title.trim()) {
      toast({
        title: "Missing details",
        description: "Pick a template, a recipient and a title.",
        variant: "destructive",
      });
      return;
    }
    setSending(true);
    const { data, error } = await supabase
      .from("contracts")
      .insert({
        template_id: selectedTemplate.id,
        title: title.trim(),
        body_html: selectedTemplate.body_html, // snapshot
        recipient_user_id: recipient.user_id,
        recipient_email: recipient.email,
        recipient_name: recipient.display_name,
        created_by: user?.id ?? null,
      })
      .select()
      .single();

    if (error) {
      setSending(false);
      toast({ title: "Could not send", description: error.message, variant: "destructive" });
      return;
    }

    // Fire-and-forget email notification.
    try {
      await supabase.functions.invoke("send-contract-email", {
        body: {
          type: "contract_sent",
          contractId: data.id,
          contractTitle: title.trim(),
          recipientName: recipient.display_name,
          recipientEmail: recipient.email,
        },
      });
    } catch (e) {
      console.error("contract email failed", e);
    }

    setSending(false);
    toast({
      title: "Contract sent",
      description: `${title.trim()} sent to ${recipient.display_name || recipient.email}.`,
    });
    reset();
    onOpenChange(false);
    onSent();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send a Contract</DialogTitle>
          <DialogDescription>
            Choose a template and a staff member. The current template content is captured so future
            edits won't change this contract.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-1.5">
            <Label>Template</Label>
            <Select value={templateId} onValueChange={setTemplateId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a contract template" />
              </SelectTrigger>
              <SelectContent>
                {templates.length === 0 ? (
                  <div className="px-2 py-1.5 text-sm text-muted-foreground">
                    No templates — create one first.
                  </div>
                ) : (
                  templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label>Send to</Label>
            <Select value={recipientId} onValueChange={setRecipientId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a staff member" />
              </SelectTrigger>
              <SelectContent>
                {staff.map((s) => (
                  <SelectItem key={s.user_id} value={s.user_id}>
                    {s.display_name || s.email || "Unnamed"}
                    {s.email && s.display_name ? ` · ${s.email}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="contract-title">Contract title</Label>
            <Input
              id="contract-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Contract of Employment — Jane Doe"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={send} disabled={sending}>
            {sending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Send contract
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
