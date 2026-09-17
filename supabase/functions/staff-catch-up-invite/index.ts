import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

/**
 * The standing invitation to book a chat, sent to everyone every two months.
 *
 * It is a small thing that stops being true if it only happens once: people
 * who would never ask for a meeting will take one that is offered, and the
 * offer has to come round again to be believed. So it goes out on a schedule
 * rather than when somebody remembers, to everyone employed on the day.
 *
 * Sending is recorded per date. A cron retry, a manual run after a failure, or
 * two firings on the same evening therefore send once, not twice — fifty-three
 * people getting the same invitation twice would read as a system, which is
 * exactly what this message is trying not to be.
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const BOOKING_URL = "https://calendar.app.google/ozJ2nvvjHGnvKP3P6";
// Asked for on 17 September 2026, to start in two months. The cron fires on the
// 17th of every other month, so this keeps it quiet until the first one is due.
const FIRST_SEND_ON = "2026-11-17";
// The invitation is from Demi; he doesn't need one from himself.
const SENDER_USER_ID = "9889e2cc-b782-4374-9397-1ef60f5c3edc";

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
   .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

function greeting(name?: string | null): string {
  const f = firstName(name);
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Good evening${f ? ` ${escapeHtml(f)}` : ""},</p>`;
}

function paragraph(html: string): string {
  return `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

function mutedParagraph(html: string): string {
  return `<p style="color:#6b7280;font-size:14px;line-height:1.6;margin:0 0 16px;">${html}</p>`;
}

function button(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </div>`;
}

/**
 * The house shell, with the sign-off left open: this one is from a person, and
 * "The Care Cuddle team" would undo the point of it.
 */
function emailShell(headerTitle: string, bodyHtml: string, reason: string, signOff: string): string {
  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background-color:${BRAND_COLOR};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle" width="120" style="margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">${headerTitle}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${bodyHtml}
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">${signOff}</p>
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

function inviteHtml(name: string | null): string {
  const content =
    greeting(name) +
    paragraph(
      `If you'd like to catch up with me, book a time that suits you. You don't need a reason, and you don't need to ask first.`,
    ) +
    button("Book a time with me", BOOKING_URL) +
    paragraph(
      `It can be about work — how you're finding it, something getting in your way, an idea you'd like to try — or it can just be a chat. Nothing is too small to bring, and none of it has to be serious.`,
    ) +
    mutedParagraph(
      `These slots stay open, so if now isn't the right time, book one whenever it is. If none of the times work for you, reply to this email and we'll find another.`,
    );

  return emailShell(
    "Fancy a catch-up?",
    content,
    "You're receiving this because you work at Care Cuddle. It goes out every couple of months.",
    "Kind regards,<br/>Demi",
  );
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // A dry run renders the email and sends it to Resend's test address only.
    if (body?.test === true) {
      const { error } = await resend.emails.send({
        from: EMAIL_SENDER,
        to: ["delivered@resend.dev"],
        subject: "Fancy a catch-up?",
        html: inviteHtml("Test"),
      });
      if (error) throw error;
      return json({ test: true, sent: 1 });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (today < FIRST_SEND_ON) {
      return json({ skipped: `not until ${FIRST_SEND_ON}`, today });
    }

    // Claim today. Whoever inserts the row sends; a second run finds it taken.
    const { data: claimed, error: claimError } = await admin
      .from("catch_up_invite_sends")
      .insert({ sent_on: today })
      .select("sent_on");
    if (claimError) {
      if (claimError.code === "23505") return json({ skipped: "already sent today", today });
      throw claimError;
    }
    if (!claimed?.length) return json({ skipped: "already sent today", today });

    const { data: staff, error: staffError } = await admin
      .from("profiles")
      .select("user_id, display_name, email, hr_profiles!inner(start_date, employment_end_date)")
      .not("email", "is", null);
    if (staffError) throw staffError;

    type Row = {
      user_id: string;
      display_name: string | null;
      email: string;
      hr_profiles: { start_date: string | null; employment_end_date: string | null } | { start_date: string | null; employment_end_date: string | null }[];
    };

    const seen = new Set<string>();
    const recipients = (staff as unknown as Row[]).filter((row) => {
      if (row.user_id === SENDER_USER_ID) return false;
      const hr = Array.isArray(row.hr_profiles) ? row.hr_profiles[0] : row.hr_profiles;
      if (!hr) return false;
      if (hr.start_date && hr.start_date > today) return false;
      if (hr.employment_end_date && hr.employment_end_date < today) return false;
      const key = row.email.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let sent = 0;
    const failures: string[] = [];

    // Small batches with a pause: fifty-odd sends at once trips Resend's rate
    // limit, and a rate-limited send is a person who didn't get the message.
    for (let i = 0; i < recipients.length; i += 5) {
      const batch = recipients.slice(i, i + 5);
      await Promise.all(batch.map(async (person) => {
        try {
          const { error } = await resend.emails.send({
            from: EMAIL_SENDER,
            to: [person.email],
            subject: "Fancy a catch-up?",
            html: inviteHtml(person.display_name),
          });
          if (error) throw error;
          sent += 1;
        } catch (e) {
          failures.push(`${person.email}: ${String((e as Error)?.message ?? e)}`);
        }
      }));
      if (i + 5 < recipients.length) await new Promise((r) => setTimeout(r, 1100));
    }

    await admin
      .from("catch_up_invite_sends")
      .update({ recipients: sent, failures: failures.length })
      .eq("sent_on", today);

    console.log(`staff-catch-up-invite — sent ${sent} of ${recipients.length}`);
    return json({ sent, of: recipients.length, failures });
  } catch (err) {
    console.error("staff-catch-up-invite error", err);
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
