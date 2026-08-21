import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

// Acknowledging feedback from the email, without signing in. The link carries
// an unguessable token; it grants nothing except the ability to say "I've read
// this" and to leave a comment. Acknowledging is required, commenting is not.
//
// The Supabase functions domain refuses to serve HTML (it forces text/plain and
// a CSP sandbox), so a bare click bounces to the page in the app, which calls
// back here with format=json to read the feedback and to record the reply.

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const jsonHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const escapeHtml = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const firstName = (n: string | null | undefined) => (n ?? "").trim().split(/\s+/)[0] || "";

const paragraph = (html: string) =>
  `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">${html}</p>`;

const quote = (html: string) =>
  `<div style="border-left:4px solid ${BRAND_COLOR};background:#f9f7ff;padding:12px 16px;margin:0 0 16px;">
     <p style="color:#374151;font-size:15px;line-height:1.6;margin:0;">${html}</p></div>`;

const button = (label: string, url: string) =>
  `<div style="text-align:center;margin:26px 0 8px;">
     <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
   </div>`;

function emailShell(headerTitle: string, bodyHtml: string, reason: string): string {
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
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">Best wishes,<br/>The Care Cuddle team</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">${reason}</p>
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:6px 0 0;">Care Cuddle · © ${new Date().getFullYear()} Care Cuddle</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

const KIND_NOUN: Record<string, string> = {
  praise: "positive feedback",
  development: "development point",
  warning: "warning",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });

  const url = new URL(req.url);
  const rawToken = (url.searchParams.get("token") ?? "").trim();
  const wantsJson = url.searchParams.get("format") === "json";

  // A bare click from an email lands here — send it to the page that can
  // actually render, carrying the token.
  if (!wantsJson) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${APP_URL}/acknowledge-feedback?token=${encodeURIComponent(rawToken)}` },
    });
  }

  try {
    if (!UUID_RE.test(rawToken)) {
      return new Response(JSON.stringify({ status: "unknown" }), { headers: jsonHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: row, error: readError } = await admin
      .from("staff_warnings")
      .select("id, user_id, kind, category, reason, severity, issued_at, issued_by, acknowledged_at, acknowledgement_comment")
      .eq("ack_token", rawToken)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      return new Response(JSON.stringify({ status: "unknown" }), { headers: jsonHeaders });
    }

    const kindNoun = KIND_NOUN[row.kind as string] ?? "feedback";

    // GET — the page asks what it is showing before anyone confirms anything.
    if (req.method === "GET") {
      return new Response(JSON.stringify({
        status: row.acknowledged_at ? "already" : "pending",
        kind: row.kind,
        kindNoun,
        category: row.category,
        reason: row.reason,
        severity: row.severity,
        issuedAt: row.issued_at,
        acknowledgedAt: row.acknowledged_at,
        comment: row.acknowledgement_comment,
      }), { headers: jsonHeaders });
    }

    if (req.method !== "POST") {
      return new Response(JSON.stringify({ status: "error", message: "Unsupported method" }), {
        status: 405, headers: jsonHeaders,
      });
    }

    if (row.acknowledged_at) {
      return new Response(JSON.stringify({ status: "already", acknowledgedAt: row.acknowledged_at }), { headers: jsonHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const comment = typeof body?.comment === "string" ? body.comment.trim().slice(0, 4000) : "";

    const { error: updateError } = await admin
      .from("staff_warnings")
      .update({
        acknowledged_at: new Date().toISOString(),
        acknowledgement_comment: comment || null,
        acknowledged_via: "email",
      })
      .eq("id", row.id)
      .is("acknowledged_at", null);
    if (updateError) throw updateError;

    // Tell the manager who gave the feedback, and HR, that it has been read —
    // and pass on anything the staff member wanted to say back. Failing to send
    // must not undo the acknowledgement, which is already recorded.
    try {
      const [{ data: staff }, { data: issuer }, { data: hr }] = await Promise.all([
        admin.from("profiles").select("display_name, email").eq("user_id", row.user_id).maybeSingle(),
        row.issued_by
          ? admin.from("profiles").select("display_name, email").eq("user_id", row.issued_by).maybeSingle()
          : Promise.resolve({ data: null }),
        admin.from("profiles").select("email").eq("role", "human_resources").not("email", "is", null),
      ]);

      const staffName = (staff?.display_name ?? "").trim() || "A staff member";
      const recipients = new Set<string>();
      if (issuer?.email) recipients.add(issuer.email as string);
      (hr ?? []).forEach((h: { email: string | null }) => { if (h.email) recipients.add(h.email); });

      if (recipients.size > 0) {
        const bodyHtml =
          paragraph(`<strong>${escapeHtml(staffName)}</strong> has acknowledged the ${escapeHtml(kindNoun)} given to them.`) +
          (comment
            ? paragraph(`They added a comment:`) + quote(escapeHtml(comment))
            : paragraph(`They did not add a comment, which is their choice — the acknowledgement is what was required.`)) +
          button("Open the HR area", `${APP_URL}/view/hr`);

        const html = emailShell(
          "Feedback acknowledged",
          bodyHtml,
          "You're receiving this because you gave this feedback, or you look after HR at Care Cuddle.",
        );

        await Promise.all([...recipients].map((to) =>
          resend.emails.send({
            from: EMAIL_SENDER,
            to: [to],
            subject: `${staffName} has acknowledged their ${kindNoun}`,
            html,
          }).catch((e: unknown) => console.error("acknowledge-feedback notify failed", to, e))
        ));
      }
    } catch (notifyErr) {
      console.error("acknowledge-feedback notifications failed", notifyErr);
    }

    return new Response(JSON.stringify({ status: "acknowledged", commented: Boolean(comment) }), { headers: jsonHeaders });
  } catch (err) {
    console.error("acknowledge-feedback error", err);
    return new Response(JSON.stringify({ status: "error" }), { status: 500, headers: jsonHeaders });
  }
});
