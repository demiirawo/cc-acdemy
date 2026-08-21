import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sparkles, X, Loader2, SendHorizonal } from "lucide-react";
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
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 shadow-lg gap-2 rounded-full h-12 px-5"
      >
        <Sparkles className="h-4 w-4" />
        Ask the Academy
      </Button>
    );
  }

  return (
    <div className="fixed bottom-5 right-5 z-40 w-[min(420px,calc(100vw-2.5rem))] rounded-xl border bg-card shadow-2xl flex flex-col max-h-[min(620px,calc(100vh-3rem))]">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="font-semibold text-sm">Ask the Academy</span>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
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
