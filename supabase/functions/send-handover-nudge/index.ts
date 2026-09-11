import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Sends the handover nudge an admin triggers from the Active Handover
// Trackers dashboard — the email equivalent of the "Copy message" WhatsApp
// text: leave timing, each client's handovers with who they go to and how
// far along each is, tracker links, the how-to video, and a start-vs-finish
// ask. Also gives each person the handovers are going to a heads-up listing
// the clients they are on, and alerts admins about handovers that still have
// nobody to receive them.
//
// A handover is one person handing one client to one colleague for one leave,
// so a client can carry several: Funmi → Amaka and Funmi → Sam at Springs of
// Joy, each with its own status and its own "not required" decision.

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS
// Inlined from the shared template. Do not restyle per function: the whole
// point is that every email in a staff member's inbox looks like it came from
// the same company on the same day.
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
// Existing hosted logo — keep until a first-party asset exists.
const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

/** "Monday 11 August" — year only when it isn't this year. */
function niceDate(input: string | Date): string {
  const d = typeof input === "string" ? new Date(input) : input;
  if (isNaN(d.getTime())) return "";
  const year = d.getFullYear() === new Date().getFullYear() ? "" : ` ${d.getFullYear()}`;
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}${year}`;
}

/** "Monday 11 to Friday 15 August" (same date in and out → single niceDate). */
function niceDateRange(start: string, end: string): string {
  if (!start || !end || start === end) return niceDate(start || end);
  const s = new Date(start), e = new Date(end);
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return "";
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    const year = e.getFullYear() === new Date().getFullYear() ? "" : ` ${e.getFullYear()}`;
    return `${DAYS[s.getDay()]} ${s.getDate()} to ${DAYS[e.getDay()]} ${e.getDate()} ${MONTHS[e.getMonth()]}${year}`;
  }
  return `${niceDate(s)} to ${niceDate(e)}`;
}

/** First name for greetings. Never returns "there". */
function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

/** "Hi Sarah," — or just "Hi," when no usable name exists. */
function greeting(name?: string | null): string {
  const f = firstName(name);
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${esc(f)}` : ""},</p>`;
}

function paragraph(html: string): string {
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

/** One button per email. label = verb + what you'll see. url must be a real route. */
function button(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </div>`;
}

/**
 * The shared shell. headerTitle is the outcome in plain words ("Your holiday is
 * approved"); reason is one line saying why the reader got this email.
 */
function emailShell(headerTitle: string, bodyHtml: string, reason: string, accent: string = BRAND_COLOR): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background-color:${accent};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle" width="120" style="margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${headerTitle}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">Best wishes,<br/>The Care Cuddle team</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">${reason}</p>
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:6px 0 0;">Care Cuddle · Questions? Email <a href="mailto:hello@care-cuddle.co.uk" style="color:#9ca3af;">hello@care-cuddle.co.uk</a> · © ${new Date().getFullYear()} Care Cuddle</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

/**
 * When an email can't be sent to someone who needed it (missing address, lookup
 * failure), tell the admins instead of returning success-shaped silence.
 */
async function alertAdminsOfFailure(
  resendApiKey: string,
  what: string,      // "Cover assignment for Peace Jimoh"
  whoMissed: string, // "Oluwatosin (no email address on file)"
): Promise<void> {
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: admins } = await admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null);
    const emails: string[] = (admins ?? []).map((a: { email: string }) => a.email);
    if (emails.length === 0) return;
    const body =
      greeting(null) +
      paragraph(`We couldn't email <strong>${esc(whoMissed)}</strong> about: <strong>${esc(what)}</strong>.`) +
      paragraph(`They don't know about this yet — please tell them another way, or fix their email address and resend.`) +
      button("Open Care Cuddle", APP_URL);
    await Promise.all(emails.map((to) =>
      fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: EMAIL_SENDER,
          to: [to],
          subject: `We couldn't notify ${whoMissed.split("(")[0].trim()} — action needed`,
          html: emailShell("Someone wasn't notified", body, "You're receiving this because you're an admin at Care Cuddle.", "#d97706"),
        }),
      }).catch((e) => { console.error("send-handover-nudge admin alert send failed", e); })
    ));
  } catch (e) {
    // Alerting must never break the main send — log and move on.
    console.error("send-handover-nudge alertAdminsOfFailure error", e);
  }
}

/** Escape user-supplied text before it goes into email HTML. */
function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ============================================================================

const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NudgeHandover {
  /** client_handovers.id, or the handover key while no row exists — the value for ?handover=. */
  handoverRef?: string | null;
  /** Who it is handed to. null = no cover assigned yet. */
  toName: string | null;
  toEmail?: string | null;
  /** "not started" or e.g. "40% complete" */
  statusLabel: string;
  requirement?: "required" | "not_required";
}

interface NudgeClient {
  client: string;
  handovers?: NudgeHandover[];
  /**
   * The shape before handovers were kept per leave and coverer: one status
   * for the client and the coverers' names. Still accepted so an older build
   * of the dashboard keeps working.
   */
  statusLabel?: string;
  coverNames?: string[];
}

interface NudgeRequest {
  recipientEmail: string;
  recipientName: string;
  leaveStart: string;   // ISO date
  leaveEnd: string;     // ISO date
  daysUntil: number;    // negative/0 = ongoing/today
  ongoing: boolean;
  /** A departure reads "your last day" where a leave reads "your holiday". */
  kind?: "leave" | "departure";
  /** Old shape; worked out from the handovers when absent. */
  anyStarted?: boolean;
  clients: NudgeClient[];
}

/** One handover as this function reasons about it, whichever shape it arrived in. */
interface Handover {
  ref: string | null;
  toName: string | null;
  toEmail: string | null;
  statusLabel: string;
  required: boolean;
}

interface ClientHandovers {
  client: string;
  handovers: Handover[];
}

const str = (v: unknown) => (v == null ? "" : String(v)).trim();

/**
 * Both payload shapes become the same thing: per client, the handovers with
 * who they go to. The old shape had one status per client and names only, so
 * each named coverer becomes a required handover at that status (or one
 * unassigned handover when nobody was named).
 */
function normaliseClients(clients: NudgeClient[]): ClientHandovers[] {
  return clients
    .filter((c) => c && str(c.client))
    .map((c) => {
      const client = str(c.client);
      if (Array.isArray(c.handovers)) {
        return {
          client,
          handovers: c.handovers.filter(Boolean).map((h) => ({
            ref: str(h.handoverRef) || null,
            toName: str(h.toName) || null,
            toEmail: str(h.toEmail) || null,
            statusLabel: str(h.statusLabel),
            required: h.requirement !== "not_required",
          })),
        };
      }
      const names = (c.coverNames ?? []).map(str).filter(Boolean);
      const statusLabel = str(c.statusLabel);
      return {
        client,
        handovers: names.length > 0
          ? names.map((n) => ({ ref: null, toName: n, toEmail: null, statusLabel, required: true }))
          : [{ ref: null, toName: null, toEmail: null, statusLabel, required: true }],
      };
    })
    .filter((c) => c.handovers.length > 0);
}

/** "Jane", "Jane and Tunde", "Jane, Tunde and Bola". */
function joinNames(names: string[]): string {
  const ns = names.map((n) => (n ?? "").trim()).filter(Boolean);
  if (ns.length === 0) return "";
  if (ns.length === 1) return ns[0];
  return `${ns.slice(0, -1).join(", ")} and ${ns[ns.length - 1]}`;
}

/**
 * Client list for a subject line: falls back to "N clients" when the joined
 * names would blow the ~60-char subject budget. Body copy still names them all.
 */
function subjectClients(names: string[]): string {
  const joined = joinNames(names);
  if (names.length > 1 && joined.length > 30) return `${names.length} clients`;
  return joined;
}

/** Escape LIKE/ILIKE wildcards so a name containing % or _ matches literally. */
function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** The percentage in a statusLabel ("40% complete" → 40), or null when it has none. */
function percentOf(label: string): number | null {
  const m = (label ?? "").match(/(\d+)\s*%/);
  return m ? parseInt(m[1], 10) : null;
}

/** Turn the raw statusLabel ("not started", "40% complete") into a plain sentence fragment. */
function describeStatus(label: string): string {
  const raw = (label ?? "").trim();
  if (/not started/i.test(raw)) return "the handover hasn't been started yet";
  const n = percentOf(raw);
  if (n !== null) {
    if (n >= 100) return "the handover tasks are all ticked off — please double-check nothing is missing";
    if (n > 0) return `about ${n}% of the handover tasks are done`;
    return "the handover hasn't been started yet";
  }
  return "the handover isn't finished yet";
}

/** The client's tracker page, opened on one handover when we know which. */
function trackerUrl(client: string, ref?: string | null): string {
  const base = `${APP_URL}/public/schedule/${encodeURIComponent(client.trim())}`;
  return ref ? `${base}?handover=${encodeURIComponent(ref)}` : base;
}

function trackerLink(client: string, ref: string | null, label: string): string {
  return `<a href="${trackerUrl(client, ref)}" style="color:${BRAND_COLOR};font-weight:600;">${label}</a>`;
}

const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  try {
    const body: NudgeRequest = await req.json();
    const { recipientEmail, recipientName, leaveStart, leaveEnd, daysUntil, ongoing } = body;
    const departure = body.kind === "departure";
    const clients = Array.isArray(body.clients) ? normaliseClients(body.clients) : [];
    if (!recipientEmail || !recipientName || !leaveStart || !leaveEnd || clients.length === 0) {
      // Never fail silently: if we know who should have been reminded but have
      // no address for them, tell the admins before returning the error.
      if (!recipientEmail && recipientName) {
        await alertAdminsOfFailure(
          resendApiKey,
          `A reminder to finish their handover before ${departure ? "they leave" : "their holiday"}`,
          `${recipientName} (no email address on file)`,
        );
      }
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // A handover marked not required is mentioned but never chased, and a
    // client where every handover is not required has nothing to say at all.
    const liveClients = clients.filter((c) => c.handovers.some((h) => h.required));
    const requiredHandovers = liveClients.flatMap((c) => c.handovers.filter((h) => h.required));
    if (liveClients.length === 0) {
      return new Response(JSON.stringify({ error: "Every handover is marked not required — nothing to remind about" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leaverFirst = firstName(recipientName) || recipientName.trim();
    const safeRecipient = esc(recipientName);
    const plural = requiredHandovers.length > 1;
    const singleDay = leaveStart === leaveEnd;
    const dateRange = niceDateRange(leaveStart, leaveEnd);
    const clientNames = liveClients.map((c) => c.client);
    const anyStarted = typeof body.anyStarted === "boolean"
      ? body.anyStarted
      : requiredHandovers.some((h) => (percentOf(h.statusLabel) ?? 0) > 0);
    const covering = departure ? "taking over" : "covering";

    // ---- Email 1: the person going on holiday, or leaving ---------------------

    const handoverPhrase = `your handover${plural ? "s" : ""} for ${esc(joinNames(clientNames))} ${plural ? "aren't" : "isn't"} finished yet`;
    let opening: string;
    if (departure) {
      opening = ongoing
        ? `Your last day with Care Cuddle was ${niceDate(leaveEnd)}, and ${handoverPhrase}.`
        : daysUntil <= 0
          ? `Today is your last day with Care Cuddle, and ${handoverPhrase}.`
          : daysUntil === 1
            ? `Tomorrow is your last day with Care Cuddle, and ${handoverPhrase}.`
            : `Your last day with Care Cuddle is ${niceDate(leaveEnd)} — ${daysUntil} days away — and ${handoverPhrase}.`;
    } else if (ongoing) {
      opening = singleDay
        ? `You're on holiday today, and ${handoverPhrase}.`
        : `You're on holiday until ${niceDate(leaveEnd)}, and ${handoverPhrase}.`;
    } else if (daysUntil <= 0) {
      opening = `Your holiday starts today, and ${handoverPhrase}.`;
    } else if (daysUntil === 1) {
      opening = `Your holiday starts tomorrow, and ${handoverPhrase}.`;
    } else {
      opening = `Your holiday starts in ${daysUntil} days, and ${handoverPhrase}.`;
    }
    const awayLine = departure || ongoing
      ? ""
      : singleDay
        ? `You're away on ${niceDate(leaveStart)}.`
        : `You're away from ${dateRange}.`;

    // Who to hand to, for one handover.
    const coverSentence = (h: Handover) => h.toName
      ? `Please hand everything over to <strong>${esc(h.toName)}</strong>, who will be ${covering} your shifts here.`
      : `No one has been arranged to ${departure ? "take over" : "cover"} your shifts here yet — the admin team is sorting this and will confirm who. Please still get the handover ready so it's easy to pass on.`;

    // The first handover still required at a client is the one its links open on.
    const focusOf = (c: ClientHandovers) => c.handovers.find((h) => h.required) ?? c.handovers[0];

    const clientParagraphs = liveClients.map((c) => {
      const safeClient = esc(c.client);
      if (c.handovers.length === 1) {
        const h = c.handovers[0];
        // One client, one handover: the button below is the only link needed.
        if (liveClients.length === 1) {
          return paragraph(`${capitalise(describeStatus(h.statusLabel))}. ${coverSentence(h)}`);
        }
        return paragraph(
          `<strong>${safeClient}</strong>: ${describeStatus(h.statusLabel)}. ${coverSentence(h)} ` +
          `${trackerLink(c.client, h.ref, `Open the ${safeClient} Handover Tracker`)}.`
        );
      }
      // Several people take this client's shifts on, so each gets their own
      // handover and their own line.
      const items = c.handovers.map((h) => {
        const who = h.toName ? `<strong>${esc(h.toName)}</strong>` : `<em>cover not assigned yet</em>`;
        const state = h.required ? describeStatus(h.statusLabel) : "marked as not required, so nothing to do";
        const open = h.required ? ` ${trackerLink(c.client, h.ref, "Open this handover")}.` : "";
        return `<li style="margin-bottom:4px;">${who} — ${state}.${open}</li>`;
      }).join("");
      return paragraph(`<strong>${safeClient}</strong>: more than one person is ${covering} your shifts here, so each needs their own handover.`) +
        `<ul style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;padding-left:20px;">${items}</ul>`;
    }).join("");

    const ask = ongoing
      ? `Please finish ${plural ? "them" : "it"} as soon as you can — the people ${covering} your shifts need it now. Thank you.`
      : anyStarted
        ? `Please finish ${plural ? "each handover" : "it"} before ${departure ? "your last day" : "your holiday starts"}. Thank you.`
        : `Please make a start as soon as you can, so everything is ready before you go. Thank you.`;

    const leaverSubject = ongoing
      ? `Your handover${plural ? "s" : ""} still need${plural ? "" : "s"} finishing`
      : daysUntil <= 0
        ? `${departure ? "Today is your last day" : "Your holiday starts today"} — please finish your handover${plural ? "s" : ""}`
        : anyStarted
          ? `Please finish your handover${plural ? "s" : ""} before ${departure ? "you leave" : "your holiday"}`
          : `Please start your handover${plural ? "s" : ""} before ${departure ? "you leave" : "your holiday"}`;

    const firstClient = liveClients[0];
    const leaverBody =
      greeting(recipientName) +
      paragraph(opening + (awayLine ? ` ${awayLine}` : "")) +
      clientParagraphs +
      mutedParagraph(`Not sure how the Handover Tracker works? <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;">Watch this short video guide</a>.`) +
      paragraph(ask) +
      button(`Open the ${esc(firstClient.client)} Handover Tracker`, trackerUrl(firstClient.client, focusOf(firstClient).ref));

    await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject: leaverSubject,
      html: emailShell(
        `Your handover${plural ? "s" : ""} need${plural ? "" : "s"} finishing`,
        leaverBody,
        departure
          ? `You're receiving this because you're leaving Care Cuddle and have ${plural ? "handovers" : "a handover"} to complete before you go.`
          : `You're receiving this because you have a holiday booked with Care Cuddle and ${plural ? "handovers" : "a handover"} to complete before you go.`,
      ),
    });

    // ---- Email 2: heads-up to each person a handover is going to -------------

    let coverEmailsSent = 0;
    let adminAlertsSent = 0;
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // One email per person, listing only the handovers that are theirs and
      // still required. Keyed by name (display names are unique) so the same
      // person at two clients is one recipient, with whichever email we were
      // given for them.
      interface CovererWork { name: string; email: string | null; items: { client: string; ref: string | null }[] }
      const coverMap = new Map<string, CovererWork>();
      for (const c of liveClients) {
        for (const h of c.handovers) {
          if (!h.required || !h.toName) continue;
          const key = h.toName.toLowerCase();
          if (!coverMap.has(key)) coverMap.set(key, { name: h.toName, email: null, items: [] });
          const entry = coverMap.get(key)!;
          if (!entry.email && h.toEmail) entry.email = h.toEmail;
          if (!entry.items.some((i) => i.client === c.client)) entry.items.push({ client: c.client, ref: h.ref });
        }
      }

      const whenAway = ongoing
        ? (singleDay ? "today" : `until ${niceDate(leaveEnd)}`)
        : (singleDay ? `on ${niceDate(leaveStart)}` : `from ${dateRange}`);
      // "Funmi is away on holiday from …" / "Funmi is leaving Care Cuddle — their last day is …"
      const situation = departure
        ? (ongoing
            ? `${safeRecipient}'s last day with Care Cuddle was ${niceDate(leaveEnd)}`
            : `${safeRecipient} is leaving Care Cuddle — their last day is ${niceDate(leaveEnd)}`)
        : `${safeRecipient} is away on holiday ${whenAway}`;

      for (const { name, email: givenEmail, items } of coverMap.values()) {
        const clientList = items.map((i) => i.client);
        let email: string | null = givenEmail;
        let displayName: string | null = null;

        if (!email) {
          // No address in the payload (the old shape): look the name up.
          // Exact (case-insensitive) match first, with wildcards escaped so a
          // % or _ in a name can't match the wrong profile.
          let { data: profile } = await admin
            .from("profiles")
            .select("email, display_name")
            .ilike("display_name", escapeLike(name))
            .limit(1)
            .maybeSingle();

          // A first-name-only cover entry ("Jane") won't exact-match "Jane
          // Smith". Try a word-boundary prefix match, but only trust it when
          // it's unambiguous — otherwise fall through to the admin alert.
          if (!profile?.email) {
            const { data: candidates } = await admin
              .from("profiles")
              .select("email, display_name")
              .ilike("display_name", `${escapeLike(name)} %`)
              .limit(2);
            if (candidates?.length === 1 && candidates[0].email) profile = candidates[0];
          }
          email = profile?.email ?? null;
          displayName = profile?.display_name ?? null;
        }

        if (!email) {
          await alertAdminsOfFailure(
            resendApiKey,
            `A heads-up that ${recipientName} will hand over ${joinNames(clientList)} to them before ${departure ? "they leave" : "their holiday"}`,
            `${name} (no email address on file)`,
          );
          continue;
        }
        // The rota never has someone covering themself, but a hand-typed name could.
        if (email.toLowerCase() === recipientEmail.toLowerCase()) continue;

        const coverBody =
          greeting(displayName || name) +
          paragraph(`${situation}, and you'll be ${covering} their shifts at ${esc(joinNames(clientList))}.`) +
          paragraph(ongoing
            ? `Their handover for you isn't finished yet — we've reminded them today to get it to you as soon as possible.`
            : `Before they go, they'll use the Handover Tracker to pass over everything you need. We've reminded them today to get it finished.`) +
          paragraph(`You don't need to do anything right now — this is just so you know it's coming. You can open the tracker at any time to see how it's going.`) +
          button(`Open the ${esc(items[0].client)} Handover Tracker`, trackerUrl(items[0].client, items[0].ref)) +
          (items.length > 1
            ? mutedParagraph(`Trackers for your other clients: ${items.slice(1).map((i) => trackerLink(i.client, i.ref, esc(i.client))).join(", ")}.`)
            : "");

        await resend.emails.send({
          from: EMAIL_SENDER,
          to: [email],
          subject: `${leaverFirst} will hand over ${subjectClients(clientList)} to you`,
          html: emailShell(
            "A handover is coming your way",
            coverBody,
            departure
              ? "You're receiving this because you're taking over a colleague's shifts at Care Cuddle."
              : "You're receiving this because you're covering a colleague's shifts at Care Cuddle.",
          ),
        });
        coverEmailsSent++;
      }

      // ---- Email 3: alert admins about handovers with nobody to receive them --

      const noCoverClients = liveClients
        .filter((c) => c.handovers.some((h) => h.required && !h.toName))
        .map((c) => c.client);

      if (noCoverClients.length > 0) {
        const { data: admins } = await admin
          .from("profiles")
          .select("email, display_name")
          .eq("role", "admin")
          .not("email", "is", null);
        const adminList = (admins ?? []).filter((a: { email: string | null }) => a.email);
        if (adminList.length === 0) {
          console.error("send-handover-nudge: no admin emails on file to alert about missing cover for", noCoverClients);
        }
        for (const a of adminList) {
          const adminBody =
            greeting(a.display_name) +
            paragraph(`${situation}, but no one is ${covering} their shifts at ${esc(joinNames(noCoverClients))} yet.`) +
            paragraph(`We've reminded ${esc(leaverFirst)} about the handover today, but there's no one for them to hand over to. Please arrange ${departure ? "who takes these clients on" : "cover"} soon, so the handover can happen ${ongoing ? "without more delay" : "before they go"}.`) +
            button("Open the schedule", `${APP_URL}/view/schedule`);
          await resend.emails.send({
            from: EMAIL_SENDER,
            to: [a.email],
            subject: `Cover still needed for ${subjectClients(noCoverClients)}`,
            html: emailShell(
              "Cover still needed",
              adminBody,
              "You're receiving this because you're an admin at Care Cuddle.",
              "#d97706",
            ),
          });
          adminAlertsSent++;
        }
      }
    } catch (fanoutError) {
      // The main reminder went out; the fan-out must never turn that into a failure.
      console.error("send-handover-nudge fan-out error", fanoutError);
    }

    return new Response(JSON.stringify({ success: true, coverEmailsSent, adminAlertsSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("send-handover-nudge error", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
