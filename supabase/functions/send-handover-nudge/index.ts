import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// Sends the handover nudge an admin triggers from the Active Handover
// Trackers dashboard — the email equivalent of the "Copy message" WhatsApp
// text: leave timing, per-client status with tracker links, the how-to
// video, and a start-vs-finish ask. Also gives the named cover people a
// heads-up that a handover is coming their way, and alerts admins when a
// client still has no cover arranged.

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
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi${f ? ` ${f}` : ""},</p>`;
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
      paragraph(`We couldn't email <strong>${whoMissed}</strong> about: <strong>${what}</strong>.`) +
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

// ============================================================================

const HANDOVER_VIDEO_URL = "https://www.youtube.com/watch?v=VGzR7cR1npA";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NudgeClient {
  client: string;
  /** "not started" or e.g. "40% complete" */
  statusLabel: string;
  /** Who is covering this client's shifts — the person to hand over to. */
  coverNames?: string[];
}

interface NudgeRequest {
  recipientEmail: string;
  recipientName: string;
  leaveStart: string;   // ISO date
  leaveEnd: string;     // ISO date
  daysUntil: number;    // negative/0 = ongoing/today
  ongoing: boolean;
  anyStarted: boolean;
  clients: NudgeClient[];
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

/** Turn the raw statusLabel ("not started", "40% complete") into a plain sentence fragment. */
function describeStatus(label: string): string {
  const raw = (label ?? "").trim();
  if (/not started/i.test(raw)) return "the handover hasn't been started yet";
  const pct = raw.match(/(\d+)\s*%/);
  if (pct) {
    const n = parseInt(pct[1], 10);
    if (n >= 100) return "the handover tasks are all ticked off — please double-check nothing is missing";
    if (n > 0) return `about ${n}% of the handover tasks are done`;
    return "the handover hasn't been started yet";
  }
  return "the handover isn't finished yet";
}

function trackerUrl(client: string): string {
  return `${APP_URL}/public/schedule/${encodeURIComponent(client.trim())}`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

  try {
    const body: NudgeRequest = await req.json();
    const { recipientEmail, recipientName, leaveStart, leaveEnd, daysUntil, ongoing, anyStarted, clients } = body;
    if (!recipientEmail || !recipientName || !leaveStart || !leaveEnd || !Array.isArray(clients) || clients.length === 0) {
      // Never fail silently: if we know who should have been reminded but have
      // no address for them, tell the admins before returning the error.
      if (!recipientEmail && recipientName) {
        await alertAdminsOfFailure(
          resendApiKey,
          `A reminder to finish their handover before their holiday`,
          `${recipientName} (no email address on file)`,
        );
      }
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const leaverFirst = firstName(recipientName) || recipientName.trim();
    const plural = clients.length > 1;
    const singleDay = leaveStart === leaveEnd;
    const dateRange = niceDateRange(leaveStart, leaveEnd);
    const clientNames = clients.map((c) => c.client);

    // ---- Email 1: the person going on holiday --------------------------------

    const handoverPhrase = `your handover${plural ? "s" : ""} for ${joinNames(clientNames)} ${plural ? "aren't" : "isn't"} finished yet`;
    let opening: string;
    if (ongoing) {
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
    const awayLine = ongoing
      ? ""
      : singleDay
        ? `You're away on ${niceDate(leaveStart)}.`
        : `You're away from ${dateRange}.`;

    const capitalise = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

    const clientParagraphs = clients.map((c) => {
      const covers = (c.coverNames ?? []).map((n) => (n ?? "").trim()).filter(Boolean);
      const coverSentence = covers.length > 0
        ? `Please hand everything over to <strong>${joinNames(covers)}</strong>, who will be covering your shifts here.`
        : `No one has been arranged to cover your shifts here yet — the admin team is sorting this and will confirm who. Please still get the handover ready so it's easy to pass on.`;
      if (!plural) {
        return paragraph(`${capitalise(describeStatus(c.statusLabel))}. ${coverSentence}`);
      }
      return paragraph(
        `<strong>${c.client}</strong>: ${describeStatus(c.statusLabel)}. ${coverSentence} ` +
        `<a href="${trackerUrl(c.client)}" style="color:${BRAND_COLOR};font-weight:600;">Open the ${c.client} Handover Tracker</a>.`
      );
    }).join("");

    const ask = ongoing
      ? `Please finish ${plural ? "them" : "it"} as soon as you can — the people covering your shifts need it now. Thank you.`
      : anyStarted
        ? `Please finish ${plural ? "each handover" : "it"} before your holiday starts. Thank you.`
        : `Please make a start as soon as you can, so everything is ready before you go. Thank you.`;

    const leaverSubject = ongoing
      ? `Your handover${plural ? "s" : ""} still need${plural ? "" : "s"} finishing`
      : daysUntil <= 0
        ? `Your holiday starts today — please finish your handover${plural ? "s" : ""}`
        : anyStarted
          ? `Please finish your handover${plural ? "s" : ""} before your holiday`
          : `Please start your handover${plural ? "s" : ""} before your holiday`;

    const leaverBody =
      greeting(recipientName) +
      paragraph(opening + (awayLine ? ` ${awayLine}` : "")) +
      clientParagraphs +
      mutedParagraph(`Not sure how the Handover Tracker works? <a href="${HANDOVER_VIDEO_URL}" style="color:${BRAND_COLOR};font-weight:600;">Watch this short video guide</a>.`) +
      paragraph(ask) +
      button(`Open the ${clients[0].client} Handover Tracker`, trackerUrl(clients[0].client));

    await resend.emails.send({
      from: EMAIL_SENDER,
      to: [recipientEmail],
      subject: leaverSubject,
      html: emailShell(
        `Your handover${plural ? "s" : ""} need${plural ? "" : "s"} finishing`,
        leaverBody,
        `You're receiving this because you have a holiday booked with Care Cuddle and ${plural ? "handovers" : "a handover"} to complete before you go.`,
      ),
    });

    // ---- Email 2: heads-up to each named cover person ------------------------

    let coverEmailsSent = 0;
    let adminAlertsSent = 0;
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

      // Group clients by cover person so each person gets one email.
      const coverMap = new Map<string, { name: string; clientList: string[] }>();
      for (const c of clients) {
        for (const rawName of c.coverNames ?? []) {
          const name = (rawName ?? "").trim();
          if (!name) continue;
          const key = name.toLowerCase();
          if (!coverMap.has(key)) coverMap.set(key, { name, clientList: [] });
          coverMap.get(key)!.clientList.push(c.client);
        }
      }

      const whenAway = ongoing
        ? (singleDay ? "today" : `until ${niceDate(leaveEnd)}`)
        : (singleDay ? `on ${niceDate(leaveStart)}` : `from ${dateRange}`);

      for (const { name, clientList } of coverMap.values()) {
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

        if (!profile?.email) {
          await alertAdminsOfFailure(
            resendApiKey,
            `A heads-up that ${recipientName} will hand over ${joinNames(clientList)} to them before their holiday`,
            `${name} (no email address on file)`,
          );
          continue;
        }

        const coverBody =
          greeting(profile.display_name || name) +
          paragraph(`${recipientName} is away on holiday ${whenAway}, and you'll be covering their shifts at ${joinNames(clientList)}.`) +
          paragraph(ongoing
            ? `Their handover for you isn't finished yet — we've reminded them today to get it to you as soon as possible.`
            : `Before they go, they'll use the Handover Tracker to pass over everything you need. We've reminded them today to get it finished.`) +
          paragraph(`You don't need to do anything right now — this is just so you know it's coming. You can open the tracker at any time to see how it's going.`) +
          button(`Open the ${clientList[0]} Handover Tracker`, trackerUrl(clientList[0])) +
          (clientList.length > 1
            ? mutedParagraph(`Trackers for your other clients: ${clientList.slice(1).map((cl) => `<a href="${trackerUrl(cl)}" style="color:${BRAND_COLOR};font-weight:600;">${cl}</a>`).join(", ")}.`)
            : "");

        await resend.emails.send({
          from: EMAIL_SENDER,
          to: [profile.email],
          subject: `${leaverFirst} will hand over ${subjectClients(clientList)} to you`,
          html: emailShell(
            "A handover is coming your way",
            coverBody,
            "You're receiving this because you're covering a colleague's shifts at Care Cuddle.",
          ),
        });
        coverEmailsSent++;
      }

      // ---- Email 3: alert admins about clients with no cover arranged --------

      const noCoverClients = clients
        .filter((c) => (c.coverNames ?? []).filter((n) => (n ?? "").trim()).length === 0)
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
            paragraph(`${recipientName} is away on holiday ${whenAway}, but no one is covering their shifts at ${joinNames(noCoverClients)} yet.`) +
            paragraph(`We've reminded ${leaverFirst} about the handover today, but there's no one for them to hand over to. Please arrange cover soon, so the handover can happen ${ongoing ? "without more delay" : "before they go"}.`) +
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
