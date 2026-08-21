import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

// One-click acknowledgement from the shift-change email. The link carries an
// unguessable batch token; tapping it marks every change in that email as seen.
// Deliberately no login: acknowledgement rates live or die on friction, and the
// token grants nothing except the ability to say "seen".

const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";

const escapeHtml = (t: string) =>
  String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Tells the admin team that a schedule change has been confirmed. Assigning a
 * shift and knowing it has been seen are different things, and only the second
 * one means the work is covered.
 */
async function tellAdminsAcknowledged(
  admin: ReturnType<typeof createClient>,
  userId: string,
  summaries: string[],
): Promise<void> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) return;

  try {
    const [{ data: person }, { data: admins }] = await Promise.all([
      admin.from("profiles").select("display_name, email").eq("user_id", userId).maybeSingle(),
      admin.from("profiles").select("email").eq("role", "admin").not("email", "is", null),
    ]);

    const recipients = (admins ?? []).map((a: { email: string }) => a.email).filter(Boolean);
    if (recipients.length === 0) return;

    const name = (person?.display_name as string | null)?.trim() || "A staff member";
    const list = summaries.length
      ? `<ul style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 16px;padding-left:20px;">${
          summaries.slice(0, 12).map((s) => `<li style="margin-bottom:4px;">${escapeHtml(s)}</li>`).join("")
        }</ul>`
      : "";

    const body =
      `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Hi,</p>` +
      `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;"><strong>${escapeHtml(name)}</strong> has confirmed they have seen their schedule change${summaries.length === 1 ? "" : "s"}.</p>` +
      list +
      `<p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 16px;">Nothing further is needed — this is the confirmation that the change has landed with them.</p>` +
      `<div style="text-align:center;margin:26px 0 8px;"><a href="${APP_URL}/view/schedule" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">Open the schedule</a></div>`;

    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background-color:#f4f4f5;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;font-family:Arial,Helvetica,sans-serif;">
        <tr><td style="background-color:${BRAND_COLOR};padding:28px 32px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle" width="120" style="margin-bottom:12px;" />
          <h1 style="color:#ffffff;font-size:22px;margin:0;font-weight:700;">Schedule change acknowledged</h1>
        </td></tr>
        <tr><td style="padding:32px;">${body}
          <p style="color:#374151;font-size:16px;line-height:1.6;margin:24px 0 0;">Best wishes,<br/>The Care Cuddle team</p>
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f9fafb;border-top:1px solid #e5e7eb;">
          <p style="color:#9ca3af;font-size:12px;line-height:1.6;margin:0;">You're receiving this because you administer schedules at Care Cuddle.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const resend = new Resend(apiKey);
    await Promise.all(recipients.map((to: string) =>
      resend.emails.send({
        from: EMAIL_SENDER,
        to: [to],
        subject: `${name} has acknowledged their schedule change${summaries.length === 1 ? "" : "s"}`,
        html,
      }).catch((e: unknown) => console.error("acknowledge notify failed", to, e))
    ));
  } catch (e) {
    // The acknowledgement is recorded; failing to announce it must not undo it.
    console.error("tellAdminsAcknowledged failed", e);
  }
}


serve(async (req) => {
  const url = new URL(req.url);
  const rawToken = url.searchParams.get("token") ?? "";
  const wantsJson = url.searchParams.get("format") === "json";

  // Links in already-sent emails point here. The Supabase functions domain
  // refuses to serve HTML (it forces text/plain + a CSP sandbox), so the page
  // lives in the app — old links bounce there without acknowledging, and the
  // page calls back with format=json to record it.
  if (!wantsJson) {
    return new Response(null, {
      status: 302,
      headers: { Location: `${APP_URL}/acknowledge-shift-change?token=${encodeURIComponent(rawToken)}` },
    });
  }

  const jsonHeaders = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  };
  if (req.method === "OPTIONS") return new Response(null, { headers: jsonHeaders });

  try {
    const tokens = rawToken.split(",").map((t) => t.trim()).filter((t) => UUID_RE.test(t));
    if (tokens.length === 0) {
      return new Response(JSON.stringify({ status: "unknown" }), { headers: jsonHeaders });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: updated, error } = await admin
      .from("shift_change_acknowledgements")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_via: "email" })
      .in("ack_token", tokens)
      .is("acknowledged_at", null)
      .select("id, user_id, summary");
    if (error) throw error;

    const n = updated?.length ?? 0;
    if (n > 0) {
      const who = (updated as Array<{ user_id: string }>)[0]?.user_id;
      const summaries = (updated as Array<{ summary: string | null }>)
        .map((r) => r.summary)
        .filter(Boolean) as string[];
      if (who) await tellAdminsAcknowledged(admin, who, summaries);
      return new Response(JSON.stringify({ status: "acknowledged", count: n }), { headers: jsonHeaders });
    }

    const { count } = await admin
      .from("shift_change_acknowledgements")
      .select("id", { count: "exact", head: true })
      .in("ack_token", tokens);
    return new Response(JSON.stringify({ status: (count ?? 0) > 0 ? "already" : "unknown" }), { headers: jsonHeaders });
  } catch (err) {
    console.error("acknowledge-shift-change error:", err);
    return new Response(JSON.stringify({ status: "error" }), { status: 500, headers: jsonHeaders });
  }
});
