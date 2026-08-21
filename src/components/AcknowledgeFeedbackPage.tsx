import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, AlertTriangle, Loader2, MessageSquare } from "lucide-react";

// Where the "Acknowledge this feedback" link in the email lands. Public on
// purpose: the token is the credential, and it can only confirm that feedback
// has been read and carry a reply back. Acknowledging is required; the comment
// is not.
const ACK_ENDPOINT =
  "https://pavwwgfgpykakbqkxsal.supabase.co/functions/v1/acknowledge-feedback";

interface FeedbackDetail {
  kind: string;
  kindNoun: string;
  category: string | null;
  reason: string;
  severity: string | null;
  issuedAt: string | null;
  acknowledgedAt: string | null;
  comment: string | null;
}

type Phase = "loading" | "pending" | "sending" | "done" | "already" | "unknown" | "error";

const niceDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
};

export default function AcknowledgeFeedbackPage() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [phase, setPhase] = useState<Phase>("loading");
  const [detail, setDetail] = useState<FeedbackDetail | null>(null);
  const [comment, setComment] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch(`${ACK_ENDPOINT}?format=json&token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!active) return;
        if (body.status === "unknown") return setPhase("unknown");
        setDetail(body as FeedbackDetail);
        setPhase(body.status === "already" ? "already" : "pending");
      } catch {
        if (active) setPhase("error");
      }
    })();
    return () => { active = false; };
  }, [token]);

  const acknowledge = async () => {
    setPhase("sending");
    try {
      const res = await fetch(`${ACK_ENDPOINT}?format=json&token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ comment }),
      });
      const body = await res.json();
      setPhase(body.status === "acknowledged" ? "done" : body.status === "already" ? "already" : "error");
    } catch {
      setPhase("error");
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardContent className="pt-8 pb-6 px-6 space-y-4">{children}</CardContent>
      </Card>
    </div>
  );

  if (phase === "loading") {
    return shell(
      <div className="text-center space-y-3">
        <Loader2 className="h-8 w-8 text-primary animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading your feedback…</p>
      </div>,
    );
  }

  if (phase === "unknown" || phase === "error") {
    return shell(
      <div className="text-center space-y-3">
        <AlertTriangle className="h-10 w-10 text-amber-500 mx-auto" />
        <h1 className="text-xl font-bold">
          {phase === "unknown" ? "Link not recognised" : "Something went wrong"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {phase === "unknown"
            ? "This link doesn't match any feedback we're tracking. If you think that's wrong, reply to the email and we'll look into it."
            : "We couldn't record your acknowledgement just now. Please try the link again in a minute."}
        </p>
      </div>,
    );
  }

  if (phase === "done" || phase === "already") {
    return shell(
      <div className="text-center space-y-3">
        <CheckCircle2 className="h-10 w-10 text-emerald-600 mx-auto" />
        <h1 className="text-xl font-bold">
          {phase === "done" ? "Thank you — acknowledged" : "Already acknowledged"}
        </h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {phase === "done"
            ? "Your manager and HR have been told you've read this."
            : `You confirmed this on ${niceDate(detail?.acknowledgedAt ?? null)}. There's nothing more to do.`}
        </p>
        {detail?.comment && phase === "already" && (
          <p className="text-sm text-muted-foreground italic">You said: “{detail.comment}”</p>
        )}
        <Button asChild className="mt-2">
          <Link to="/view/hr">Open your profile</Link>
        </Button>
      </div>,
    );
  }

  // pending / sending — show what they're acknowledging, then let them confirm.
  return shell(
    <>
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium">
          {detail?.kindNoun ?? "Feedback"}
          {detail?.issuedAt ? ` · ${niceDate(detail.issuedAt)}` : ""}
        </p>
        <h1 className="text-xl font-bold">Please confirm you've read this</h1>
      </div>

      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        {detail?.category && (
          <p className="text-xs text-muted-foreground">About your {detail.category}</p>
        )}
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{detail?.reason}</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ack-comment" className="text-sm font-medium flex items-center gap-1.5">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Anything you'd like to say back?
          <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <Textarea
          id="ack-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="You can leave this blank."
          maxLength={4000}
        />
        <p className="text-xs text-muted-foreground">
          Your manager and HR will see anything you write here.
        </p>
      </div>

      <Button onClick={acknowledge} disabled={phase === "sending"} className="w-full">
        {phase === "sending" ? (
          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
        ) : (
          <><CheckCircle2 className="h-4 w-4 mr-2" />I acknowledge this feedback</>
        )}
      </Button>
      <p className="text-xs text-center text-muted-foreground">Care Cuddle</p>
    </>,
  );
}
