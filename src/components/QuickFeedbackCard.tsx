import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { Loader2, Send, X, MessageSquarePlus } from "lucide-react";
import { FEEDBACK_KINDS, FEEDBACK_KIND_ORDER, type FeedbackKind } from "@/lib/feedbackKinds";

/**
 * Give someone feedback without going anywhere.
 *
 * Feedback gets written when it is remembered, which is rarely at a moment
 * convenient for opening HR, finding the log and filling a dialog. By then the
 * specific thing that was worth saying has usually gone. So the whole exchange
 * is three actions on the page people already have open: type a name, pick
 * which kind, say what happened.
 *
 * Everything optional is optional. Category and severity have sensible defaults
 * and are tucked behind "Add detail", because a piece of feedback with no
 * category is worth far more than one that was never written.
 *
 * It writes the same row and sends the same email as the full form in the
 * Feedback Log, so it appears on their profile identically and still has to be
 * acknowledged.
 */

const CATEGORIES = ["Communication", "Attention to Detail", "Professionalism", "Learning"];
const SEVERITIES = [
  { value: "minor", label: "Minor" },
  { value: "major", label: "Major" },
  { value: "final", label: "Final" },
];

interface StaffOption { user_id: string; name: string; email: string | null; }

const initials = (name: string) =>
  name.trim().split(/\s+/).slice(0, 2).map(p => p[0]?.toUpperCase() ?? "").join("") || "?";

export function QuickFeedbackCard() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<StaffOption | null>(null);
  const [kind, setKind] = useState<FeedbackKind>("praise");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [severity, setSeverity] = useState("minor");
  const [showDetail, setShowDetail] = useState(false);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    (async () => {
      // Only people still here — feedback for a leaver belongs on their record
      // via the full form, not on a card meant for the person in front of you.
      const [{ data: profiles }, { data: hr }] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name, email").order("display_name"),
        supabase.from("hr_profiles").select("user_id, employment_end_date"),
      ]);
      const today = new Date().toISOString().slice(0, 10);
      const gone = new Set((hr ?? [])
        .filter(h => h.employment_end_date && h.employment_end_date < today)
        .map(h => h.user_id));
      setStaff((profiles ?? [])
        .filter(p => !gone.has(p.user_id) && p.user_id !== user?.id)
        .map(p => ({ user_id: p.user_id, name: (p.display_name || p.email || "Unknown").trim(), email: p.email })));
    })();
  }, [user?.id]);

  // Type-ahead rather than a list of fifty. Matching on the whole name and on
  // the start of any word, so "sos" finds "Hannah Osondu" but "ann" does not
  // surface everybody with an A.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || picked) return [];
    return staff
      .filter(s => {
        const n = s.name.toLowerCase();
        return n.startsWith(q) || n.split(/\s+/).some(w => w.startsWith(q)) || n.includes(q);
      })
      .slice(0, 6);
  }, [query, staff, picked]);

  const style = FEEDBACK_KINDS[kind];
  const canSend = !!picked && reason.trim().length > 0 && !saving;

  const reset = () => {
    setPicked(null); setQuery(""); setReason("");
    setCategory(null); setSeverity("minor"); setShowDetail(false); setKind("praise");
  };

  const send = async () => {
    if (!picked || !reason.trim()) return;
    setSaving(true);
    const sev = style.hasSeverity ? severity : "minor";
    const { data, error } = await supabase
      .from("staff_warnings")
      .insert({
        user_id: picked.user_id, kind, category, reason: reason.trim(),
        severity: sev, client_id: null, issued_by: user?.id ?? null,
      })
      .select("id, reason")
      .single();
    setSaving(false);
    if (error) {
      toast({ title: "Couldn't add feedback", description: error.message, variant: "destructive" });
      return;
    }
    if (picked.email) {
      supabase.functions.invoke("send-feedback-email", {
        body: {
          feedbackId: data.id, recipientEmail: picked.email, recipientName: picked.name,
          kind, category, reason: data.reason, severity: sev,
        },
      }).catch(() => {});
    }
    toast({
      title: style.addedTitle,
      description: picked.email
        ? `${picked.name} has been emailed — it's on their profile too.`
        : `Added to ${picked.name}'s profile. No email on file.`,
    });
    reset();
  };

  return (
    <Card className="mb-6">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-center gap-2 mb-3">
          <MessageSquarePlus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">Give feedback</h3>
          <span className="text-xs text-muted-foreground hidden sm:inline">
            Goes straight to their profile and their inbox.
          </span>
        </div>

        {/* 1 — who */}
        {picked ? (
          <div className="flex items-center gap-2 mb-3">
            <Avatar className="h-7 w-7">
              <AvatarFallback className="text-[11px]">{initials(picked.name)}</AvatarFallback>
            </Avatar>
            <span className="text-sm font-medium">{picked.name}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2"
              onClick={() => { setPicked(null); setQuery(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ) : (
          <div className="relative mb-3">
            <Input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Start typing a name…"
              className="h-9"
              onKeyDown={e => {
                if (e.key === "Enter" && matches.length > 0) {
                  e.preventDefault();
                  setPicked(matches[0]);
                  setTimeout(() => reasonRef.current?.focus(), 0);
                }
              }}
            />
            {matches.length > 0 && (
              <div className="absolute z-20 mt-1 w-full rounded-md border bg-popover shadow-md overflow-hidden">
                {matches.map(m => (
                  <button
                    key={m.user_id}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => { setPicked(m); setTimeout(() => reasonRef.current?.focus(), 0); }}
                  >
                    <Avatar className="h-6 w-6">
                      <AvatarFallback className="text-[10px]">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                    {m.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 2 — which kind */}
        <div className="flex gap-1.5 mb-3">
          {FEEDBACK_KIND_ORDER.map(k => (
            <Button
              key={k} type="button" variant="outline" size="sm"
              className={cn("flex-1 h-8", kind === k && FEEDBACK_KINDS[k].activeButton)}
              onClick={() => setKind(k)}
            >
              {FEEDBACK_KINDS[k].short}
            </Button>
          ))}
        </div>

        {/* 3 — what happened */}
        <Textarea
          ref={reasonRef}
          rows={3}
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder={style.placeholder(picked?.name ?? "they")}
          className="mb-2 text-sm"
          onKeyDown={e => {
            // Send without reaching for the mouse.
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSend) { e.preventDefault(); void send(); }
          }}
        />

        {showDetail ? (
          <div className="space-y-2 mb-3 rounded-md border p-2.5">
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map(c => (
                <Badge
                  key={c} variant="outline"
                  className={cn("cursor-pointer font-normal", category === c && "bg-primary text-primary-foreground border-primary")}
                  onClick={() => setCategory(category === c ? null : c)}
                >{c}</Badge>
              ))}
            </div>
            {style.hasSeverity && (
              <div className="flex gap-1.5">
                {SEVERITIES.map(sv => (
                  <Badge
                    key={sv.value} variant="outline"
                    className={cn("cursor-pointer font-normal", severity === sv.value && "bg-amber-500 text-white border-amber-500")}
                    onClick={() => setSeverity(sv.value)}
                  >{sv.label}</Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <button className="text-xs text-muted-foreground hover:text-foreground mb-3"
            onClick={() => setShowDetail(true)}>
            Add detail (optional)
          </button>
        )}

        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground hidden sm:inline">
            {picked ? `${style.label} for ${picked.name}. ⌘↵ to send.` : "Pick someone to start."}
          </span>
          <Button size="sm" disabled={!canSend} onClick={send} className="ml-auto">
            {saving ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
            {style.short}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
