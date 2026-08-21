import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Loader2, SendHorizonal } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * A question box that answers from the Academy's own guidance pages.
 *
 * It knows about written guidance and nothing else — no staff records, no pay,
 * no schedules. That restraint is enforced in the edge function; here it is
 * simply said out loud, so nobody types a question expecting an answer the
 * assistant is never going to give.
 */

interface Source { id: string; title: string }
interface Turn { role: "user" | "assistant"; content: string; sources?: Source[] }

const SUGGESTIONS = [
  "What goes in a good care note?",
  "What are the six rights of medication?",
  "When do I have to notify the CQC?",
  "How does the complaints process work?",
];

/** Renders **bold** and [text](/page/id); everything else stays literal. */
function RichLine({ text, onNavigate }: { text: string; onNavigate: (to: string) => void }) {
  const parts: React.ReactNode[] = [];
  const pattern = /\[([^\]]+)\]\((\/[^)]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      const to = m[2];
      parts.push(
        <button
          key={`${m.index}-l`}
          onClick={() => onNavigate(to)}
          className="text-primary underline underline-offset-2 hover:no-underline text-left"
        >
          {m[1]}
        </button>,
      );
    } else if (m[3]) {
      parts.push(<strong key={`${m.index}-b`}>{m[3]}</strong>);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export function AcademyAssist() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, busy]);

  const ask = async (text: string) => {
    const asked = text.trim();
    if (!asked || busy) return;

    setError(null);
    setQuestion("");
    const history = turns.map((t) => ({ role: t.role, content: t.content }));
    setTurns((prev) => [...prev, { role: "user", content: asked }]);
    setBusy(true);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("academy-assist", {
        body: { question: asked, history },
      });

      // A non-2xx arrives here as a thrown-style error whose body has not been
      // read. The useful explanation is inside it, so dig it out rather than
      // replacing it with a shrug.
      if (fnError) {
        let detail: string | null = null;
        try {
          const res = (fnError as { context?: Response }).context;
          if (res && typeof res.json === "function") {
            const body = await res.json();
            if (typeof body?.error === "string") detail = body.error;
          }
        } catch { /* fall through to the generic message */ }
        setError(detail ?? "The assistant is unavailable right now. Please try again shortly.");
        return;
      }

      if (data?.error) {
        setError(data.error);
      } else {
        setTurns((prev) => [
          ...prev,
          { role: "assistant", content: data?.answer || "I couldn't find an answer to that.", sources: data?.sources ?? [] },
        ]);
      }
    } catch {
      setError("The assistant is unavailable right now. Please try again shortly.");
    } finally {
      setBusy(false);
    }
  };

  const go = (to: string) => {
    setOpen(false);
    navigate(to);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Ask the Academy"
        title="Ask the Academy"
        className={cn(
          "fixed bottom-0 right-4 z-40 md:right-6 flex items-center justify-center",
          "rounded-t-xl bg-primary px-4 py-2 text-primary-foreground",
          "text-[13px] font-semibold tracking-wide uppercase",
          "shadow-lg transition-all duration-200 hover:bg-primary/90 hover:scale-105 hover:shadow-xl",
          "motion-safe:animate-assist-pulse print:hidden",
        )}
      >
        <span className="inline-flex items-center gap-2 motion-safe:animate-assist-breathe">
          <span aria-hidden className="h-2 w-2 rounded-full bg-current motion-safe:animate-orb-breathe" />
          Ask the Academy
        </span>
      </button>
    );
  }

  return (
    <div
      className={cn(
        "fixed bottom-0 right-0 z-40 flex h-[560px] max-h-[85vh] w-full flex-col overflow-hidden",
        "rounded-t-xl border bg-card shadow-2xl sm:right-4 sm:w-[380px] md:right-6 print:hidden",
        "origin-bottom-right motion-safe:animate-assist-pop",
      )}
    >
      <div className="flex items-center justify-between border-b bg-primary px-4 py-3 text-primary-foreground">
        <span className="inline-flex items-center gap-2 text-sm font-semibold">
          {/* The orb is the face: slow breaths at rest, quicker while it reads. */}
          <span
            aria-hidden
            className={cn(
              "h-2 w-2 rounded-full bg-current",
              busy ? "motion-safe:animate-orb-think" : "motion-safe:animate-orb-breathe",
            )}
          />
          Ask the Academy
        </span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close"
          className="rounded p-1 transition hover:bg-white/15"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {turns.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground leading-relaxed">
              I answer from the guidance written in the Academy — how we do things here.
              I don't know anything about people, pay or rotas; ask HR for those.
            </p>
            <div className="space-y-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="w-full text-left text-sm rounded-md border px-3 py-2 hover:bg-muted/60 transition"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {turns.map((t, i) => (
          <div
            key={i}
            className={cn(
              "text-sm rounded-lg px-3 py-2 max-w-[92%] leading-relaxed",
              t.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-muted/60 whitespace-pre-wrap",
            )}
          >
            {t.role === "assistant"
              ? t.content.split("\n").map((line, j) => (
                  <p key={j} className={j > 0 ? "mt-1.5" : undefined}>
                    <RichLine text={line} onNavigate={go} />
                  </p>
                ))
              : t.content}

            {t.role === "assistant" && (t.sources?.length ?? 0) > 0 && (
              <div className="mt-2 pt-2 border-t border-border/60">
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">From</p>
                <div className="flex flex-wrap gap-1.5">
                  {t.sources!.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => go(`/page/${s.id}`)}
                      className="text-[11px] rounded border px-2 py-0.5 hover:bg-background transition"
                    >
                      {s.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading the Academy…
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(question); }}
        className="border-t p-3 flex gap-2"
      >
        <Input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="Ask about our guidance…"
          disabled={busy}
          className="text-sm"
        />
        <Button type="submit" size="icon" disabled={busy || !question.trim()} aria-label="Send">
          <SendHorizonal className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
