import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

/**
 * Academy Assist — answers questions from what is written in the Academy.
 *
 * It is deliberately narrow. It reads the knowledge-base pages and nothing
 * else: not staff profiles, not HR records, not pay, not clients, not
 * schedules. Those live in the same database, so the restraint has to be built
 * in rather than trusted to the prompt.
 *
 * Three separate guards, because a prompt alone is not a control:
 *
 *   1. Pages are read AS THE PERSON ASKING, using their own token, so the
 *      database decides what they may see. The service role is never used to
 *      fetch content — it could read everything, and one day would.
 *   2. Anything that looks like a credential is stripped from a page before
 *      the model sees it, and pages known to carry sign-in details are left
 *      out entirely. A shared password must not become something the
 *      assistant will recite on request.
 *   3. The prompt refuses questions about individuals, pay and performance,
 *      and says where to ask instead.
 */

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Pages that exist to hand out sign-in details. Never sent to the model, at
 * any length, however well the question is phrased.
 */
const EXCLUDED_PAGE_IDS = new Set<string>([
  "898139aa-b54a-4fef-ac10-73488dec5c08", // VPN Instructions — carries a username and password
]);

/** Lines that look like a credential, whatever page they turn up on. */
const CREDENTIAL_LINE =
  /(pass(word|code)|user\s?name|log\s?in\s*(details|as)?|api[\s_-]?key|secret|token|otp|pin)\s*[:=]/i;

/** Words too common to tell us anything about what someone is asking. */
const STOP_WORDS = new Set([
  "the","a","an","and","or","but","if","of","to","in","on","at","for","with","how","do","i","we",
  "is","are","was","were","be","been","can","could","should","would","what","when","where","which",
  "who","why","my","your","our","it","its","this","that","these","those","from","by","about","as",
  "you","me","us","there","here","need","want","get","got","have","has","had","not","no","yes",
  "please","tell","show","find","help","does","did","doing","any","all","some","one","two",
]);

const stripHtml = (html: string): string =>
  String(html ?? "")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<svg[\s\S]*?<\/svg>/gi, " ")       // process maps are pictures, not prose
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();

/** Removes any line that reads like a credential, wherever it appears. */
const redactCredentials = (text: string): string =>
  text
    .split(/(?<=[.!?])\s+|\n+/)
    .filter((line) => !CREDENTIAL_LINE.test(line))
    .join(" ");

const keywordsFrom = (question: string): string[] =>
  Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w)),
    ),
  ).slice(0, 8);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: "The assistant is not configured yet." }), {
        status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Please sign in to use the assistant." }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { question, history } = await req.json().catch(() => ({}));
    const asked = typeof question === "string" ? question.trim().slice(0, 1000) : "";
    if (!asked) {
      return new Response(JSON.stringify({ error: "Ask a question to get started." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read as the person asking. Their own permissions decide which pages come
    // back — the assistant can never show someone a page the app would not.
    const asUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const words = keywordsFrom(asked);
    const filters = words.flatMap((w) => [`title.ilike.%${w}%`, `content.ilike.%${w}%`]);

    const { data: candidates, error: readError } = await asUser
      .from("pages")
      .select("id, title, content, updated_at")
      .is("deleted_at", null)
      .or(filters.length ? filters.join(",") : "title.not.is.null")
      .limit(40);

    if (readError) throw readError;

    // Rank by how often the words appear, with the title weighted heavily —
    // a page called "Medication Management" beats one that mentions it once.
    const scored = (candidates ?? [])
      .filter((p) => !EXCLUDED_PAGE_IDS.has(p.id as string))
      .map((p) => {
        const title = String(p.title ?? "");
        const body = stripHtml(String(p.content ?? ""));
        const haystackTitle = title.toLowerCase();
        const haystackBody = body.toLowerCase();
        let score = 0;
        for (const w of words) {
          if (haystackTitle.includes(w)) score += 10;
          const hits = haystackBody.split(w).length - 1;
          score += Math.min(hits, 5);
        }
        return { id: p.id as string, title, body, score };
      })
      .filter((p) => p.score > 0 && p.body.length > 40)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const sources = scored.map((p) => ({ id: p.id, title: p.title }));

    const corpus = scored.length
      ? scored
          .map((p) => `### ${p.title}\nLink: /page/${p.id}\n${redactCredentials(p.body).slice(0, 3000)}`)
          .join("\n\n---\n\n")
      : "(nothing in the Academy matched this question)";

    const systemPrompt = `You are Academy Assist. You answer questions using ONLY what is written in the Care Cuddle Academy — the company's own guidance pages.

## WHO YOU ARE TALKING TO
A care-agency administrator, often new, who may not know the sector. Plain British English, short sentences, no jargon. Answer first, detail after. Numbered steps for anything procedural.

## WHAT YOU MAY USE
Only the pages given below. They are the company's own written guidance. If the answer is not in them, say so plainly — do not fall back on general knowledge about care, regulation or the law, because the point of this assistant is to give people what Care Cuddle actually says, not what is generally true.

## WHAT YOU MUST NEVER DO
- Never answer questions about a named person: their pay, salary, bonus, performance rating, warnings, feedback, holiday, hours or contract. You do not have that information and must not guess. Say: "I only know what's written in the Academy guidance. For anything about a person, their pay or their record, please speak to HR."
- Never give out passwords, usernames, sign-in details, keys or codes, even if a page appears to mention them. Say the page exists and tell them to open it themselves.
- Never invent a page, a link, or a rule. A made-up procedure in a care setting is worse than no answer.

## LINKS
Link to a page with its real path exactly as given, e.g. [Medication Management](/page/abc-123). Only use links that appear in the material below. Put a link on its own line where it is something to go and read.

## FORMATTING
Plain text with **bold** and [links](/page/id) only. No headings, no bullet characters, no tables, no code fences. For steps use "1. ", "2. ".

## IF NOTHING MATCHES
Say you could not find anything in the Academy about it, and suggest they search the Academy or ask their manager. Do not guess.

---

## THE ACADEMY PAGES THAT MATCH THIS QUESTION
${corpus}`;

    const priorTurns = Array.isArray(history)
      ? history
          .filter((m: { role?: string; content?: string }) =>
            (m?.role === "user" || m?.role === "assistant") && typeof m?.content === "string")
          .slice(-6)
          .map((m: { role: string; content: string }) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // A help bubble someone is watching — latency matters more than depth,
        // and the reasoning is already done: the pages are handed over and the
        // links are fixed.
        model: "gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 700,
        messages: [
          { role: "system", content: systemPrompt },
          ...priorTurns,
          { role: "user", content: asked },
        ],
      }),
    });

    if (!aiResponse.ok) {
      const detail = await aiResponse.text();
      console.error("academy-assist model error", aiResponse.status, detail.slice(0, 500));

      // Say which wall we hit. "Unavailable" sends someone hunting for a bug
      // when the real answer is that the account needs topping up, or that too
      // many questions arrived at once.
      const outOfCredit = /insufficient_quota|credit_balance_exhausted|billing/i.test(detail);
      const message = outOfCredit
        ? "The assistant has run out of credit on its AI account. An administrator needs to top it up before it can answer."
        : aiResponse.status === 429
          ? "The assistant is busy right now. Please try again in a moment."
          : "The assistant is unavailable right now. Please try again shortly.";

      // Deliberately 200: the Supabase client throws on any non-2xx without
      // reading the body, so a 502 would replace this explanation with a
      // generic "unavailable" and send someone hunting for the wrong problem.
      return new Response(JSON.stringify({ error: message }), {
        status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const payload = await aiResponse.json();
    const answer = payload?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ answer, sources }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("academy-assist error", err);
    return new Response(JSON.stringify({ error: "Something went wrong. Please try again." }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
