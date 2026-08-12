import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, Loader2, CalendarClock } from "lucide-react";

// Where the acknowledge-from-email link lands. The Supabase functions domain
// refuses to serve HTML (forced text/plain + CSP sandbox), so the email links
// arrive here — the app's own domain — and this page calls the function with
// format=json to record the acknowledgement. Public on purpose: the token is
// the credential, and it can only say "seen".
const ACK_ENDPOINT =
  "https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/acknowledge-shift-change";

type AckState =
  | { phase: "working" }
  | { phase: "acknowledged"; count: number }
  | { phase: "already" }
  | { phase: "unknown" }
  | { phase: "error" };

export default function AcknowledgeShiftChangePage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<AckState>({ phase: "working" });

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${ACK_ENDPOINT}?format=json&token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!active) return;
        if (body.status === "acknowledged") setState({ phase: "acknowledged", count: body.count ?? 1 });
        else if (body.status === "already") setState({ phase: "already" });
        else if (body.status === "unknown") setState({ phase: "unknown" });
        else setState({ phase: "error" });
      } catch {
        if (active) setState({ phase: "error" });
      }
    })();
    return () => { active = false; };
  }, [token]);

  const view = (() => {
    switch (state.phase) {
      case "working":
        return {
          icon: <Loader2 className="h-10 w-10 text-primary animate-spin" />,
          title: "Recording your acknowledgement…",
          body: "One moment.",
        };
      case "acknowledged":
        return {
          icon: <CheckCircle2 className="h-10 w-10 text-emerald-600" />,
          title: "Thank you — acknowledged",
          body:
            state.count === 1
              ? "You've confirmed you've seen this schedule change. The reminders will stop, and the admin team can see it's been acknowledged."
              : `You've confirmed you've seen all ${state.count} schedule changes. The reminders will stop, and the admin team can see they've been acknowledged.`,
        };
      case "already":
        return {
          icon: <CheckCircle2 className="h-10 w-10 text-emerald-600" />,
          title: "Already acknowledged",
          body: "These changes were already confirmed — nothing more to do. Thank you!",
        };
      case "unknown":
        return {
          icon: <AlertTriangle className="h-10 w-10 text-amber-500" />,
          title: "Link not recognised",
          body: "This link doesn't match any schedule change we're tracking. If you think that's wrong, reply to the email and the admin team will check.",
        };
      case "error":
        return {
          icon: <AlertTriangle className="h-10 w-10 text-amber-500" />,
          title: "Something went wrong",
          body: "We couldn't record your acknowledgement just now. Please try the link again in a minute, or acknowledge from your profile in the portal.",
        };
    }
  })();

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardContent className="pt-8 pb-6 px-6 text-center space-y-4">
          <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
            <CalendarClock className="h-7 w-7 text-primary" />
          </div>
          <div className="flex justify-center">{view.icon}</div>
          <h1 className="text-xl font-bold">{view.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{view.body}</p>
          {state.phase !== "working" && (
            <Button asChild className="mt-2">
              <Link to="/view/schedule">See your schedule</Link>
            </Button>
          )}
          <p className="text-xs text-muted-foreground/70 pt-2">Care Cuddle</p>
        </CardContent>
      </Card>
    </div>
  );
}
