import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

// Daily nudge for unacknowledged schedule changes, and the safety net behind
// it: after three days unacknowledged, the admins hear too. Runs on cron each
// morning. Reminders stop by themselves once a change's date has passed —
// there's nothing left to act on — but ongoing pattern changes keep reminding
// until acknowledged, because they keep being true.

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
const resend = new Resend(RESEND_API_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS (shared template, inlined)
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const ALERT_COLOR = "#d97706";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

function esc(text?: string | null): string {
  return (text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(name?: string | null): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return "";
  return n.split(/\s+/)[0];
}

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

function button(label: string, url: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${url}" style="display:inline-block;background-color:${BRAND_COLOR};color:#ffffff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${label}</a>
  </div>`;
}

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

// ============================================================================

interface AckRow {
  id: string;
  user_id: string;
  summary: string;
  client_name: string | null;
  change_type: string;
  effective_until: string | null;
  ack_token: string;
  created_at: string;
  reminder_count: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const today = new Date().toISOString().slice(0, 10);

    const { data: open, error } = await admin
      .from("shift_change_acknowledgements")
      .select("id, user_id, summary, client_name, change_type, effective_until, ack_token, created_at, reminder_count")
      .is("acknowledged_at", null);
    if (error) throw error;

    // A change whose date has passed has nothing left to acknowledge usefully;
    // ongoing changes (no date) stay live until confirmed.
    const live = ((open ?? []) as AckRow[]).filter(
      (r) => !r.effective_until || r.effective_until >= today,
    );

    if (live.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "Nothing awaiting acknowledgement" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const byUser = new Map<string, AckRow[]>();
    for (const r of live) {
      const list = byUser.get(r.user_id) ?? [];
      list.push(r);
      byUser.set(r.user_id, list);
    }

    const { data: profiles } = await admin
      .from("profiles")
      .select("user_id, display_name, email, role")
      .in("user_id", [...byUser.keys()]);
    const profileMap = new Map(
      (profiles ?? []).map((p) => [p.user_id, { name: p.display_name as string | null, email: p.email as string | null }]),
    );

    let reminded = 0;
    const missingEmail: string[] = [];

    for (const [userId, rows] of byUser.entries()) {
      const person = profileMap.get(userId);
      if (!person?.email) {
        missingEmail.push(person?.name || "A staff member");
        continue;
      }

      const tokens = [...new Set(rows.map((r) => r.ack_token))].join(",");
      const ackUrl = `${supabaseUrl}/functions/v1/acknowledge-shift-change?token=${tokens}`;
      const items = rows
        .map((r) => `<li style="margin-bottom:6px;">${esc(r.summary)}</li>`)
        .join("");

      const body =
        greeting(person.name) +
        paragraph(
          rows.length === 1
            ? `There's a change to your schedule you haven't confirmed seeing yet:`
            : `There are ${rows.length} changes to your schedule you haven't confirmed seeing yet:`,
        ) +
        `<ul style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;padding-left:20px;">${items}</ul>` +
        button("Acknowledge — I've seen these", ackUrl) +
        mutedParagraph(
          `One tap and the reminders stop. You can also check your <a href="${APP_URL}/view/schedule" style="color:${BRAND_COLOR};">updated schedule</a> first, and if anything looks wrong just reply to this email.`,
        );

      const { error: sendErr } = await resend.emails.send({
        from: EMAIL_SENDER,
        to: [person.email],
        subject: rows.length === 1
          ? "Please confirm you've seen your schedule change"
          : `Please confirm ${rows.length} schedule changes`,
        html: emailShell(
          "Waiting on your acknowledgement",
          body,
          "You're receiving this because a change was made to your Care Cuddle schedule and you haven't confirmed seeing it yet.",
        ),
      });
      if (sendErr) {
        console.error("Reminder send failed for", person.email, sendErr);
        continue;
      }
      reminded++;
      await admin
        .from("shift_change_acknowledgements")
        .update({ last_reminded_at: new Date().toISOString(), reminder_count: rows[0].reminder_count + 1 })
        .in("id", rows.map((r) => r.id));
    }

    // ---- Admin escalation: anything unacknowledged for 3+ days ----
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString();
    const stale = live.filter((r) => r.created_at <= threeDaysAgo);
    let adminsAlerted = 0;

    if (stale.length > 0 || missingEmail.length > 0) {
      const { data: admins } = await admin
        .from("profiles")
        .select("email, display_name")
        .eq("role", "admin")
        .not("email", "is", null);

      const staleByUser = new Map<string, AckRow[]>();
      for (const r of stale) {
        const list = staleByUser.get(r.user_id) ?? [];
        list.push(r);
        staleByUser.set(r.user_id, list);
      }

      const dayCount = (iso: string) =>
        Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 3600 * 1000));

      const staleLines = [...staleByUser.entries()]
        .map(([uid, rows]) => {
          const name = esc(profileMap.get(uid)?.name || "Unknown staff member");
          const oldest = Math.max(...rows.map((r) => dayCount(r.created_at)));
          const what = rows.length === 1 ? esc(rows[0].summary) : `${rows.length} schedule changes`;
          return `<li style="margin-bottom:6px;"><strong>${name}</strong> — ${what}, unacknowledged for ${oldest} days</li>`;
        })
        .join("");
      const missingLines = missingEmail
        .map((n) => `<li style="margin-bottom:6px;"><strong>${esc(n)}</strong> — can't be reminded: no email address on file</li>`)
        .join("");

      const body =
        greeting(null) +
        paragraph(
          `These colleagues haven't confirmed seeing their schedule changes despite daily reminders — they may genuinely not know. Worth a direct word:`,
        ) +
        `<ul style="color:#374151;font-size:15px;line-height:1.7;margin:0 0 16px;padding-left:20px;">${staleLines}${missingLines}</ul>` +
        button("Open the schedule", `${APP_URL}/view/schedule`);

      for (const a of admins ?? []) {
        const { error: adminErr } = await resend.emails.send({
          from: EMAIL_SENDER,
          to: [a.email as string],
          subject: `${staleByUser.size + (missingEmail.length ? 1 : 0)} staff haven't confirmed schedule changes`,
          html: emailShell(
            "Schedule changes not acknowledged",
            body,
            "You're receiving this because you're an admin at Care Cuddle. Changes unacknowledged for 3+ days escalate here.",
            ALERT_COLOR,
          ),
        });
        if (!adminErr) adminsAlerted++;
        else console.error("Escalation send failed for", a.email, adminErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, reminded, adminsAlerted, staleCount: stale.length, missingEmail }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("shift-ack-reminders error:", err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
