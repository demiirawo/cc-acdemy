import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

// One-click acknowledgement from the shift-change email. The link carries an
// unguessable batch token; tapping it marks every change in that email as seen.
// Deliberately no login: acknowledgement rates live or die on friction, and the
// token grants nothing except the ability to say "seen".

const BRAND_COLOR = "#5F17EB";
const APP_URL = "https://www.care-cuddle-academy.co.uk";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, message: string, accent: string = BRAND_COLOR): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} · Care Cuddle</title></head>
<body style="margin:0;padding:24px 12px;background:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:480px;margin:40px auto;background:#fff;border-radius:12px;overflow:hidden;">
    <div style="background:${accent};padding:28px 32px;text-align:center;">
      <img src="${LOGO_URL}" alt="Care Cuddle" width="110" style="margin-bottom:10px;" />
      <h1 style="color:#fff;font-size:20px;margin:0;">${title}</h1>
    </div>
    <div style="padding:28px 32px;">
      <p style="color:#374151;font-size:16px;line-height:1.6;margin:0 0 20px;">${message}</p>
      <div style="text-align:center;margin-top:8px;">
        <a href="${APP_URL}/view/schedule" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">See your schedule</a>
      </div>
    </div>
  </div>
</body></html>`;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    // The reminder email can carry several batches' tokens at once.
    const tokens = (url.searchParams.get("token") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter((t) => UUID_RE.test(t));

    if (tokens.length === 0) {
      return new Response(
        page("Link not recognised", "This acknowledgement link isn't valid. If you were trying to confirm a schedule change, open the latest email about it and tap the button there — or acknowledge it from your profile in the portal."),
        { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
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
      .select("id");

    if (error) throw error;

    const n = updated?.length ?? 0;
    if (n === 0) {
      // Either already acknowledged (fine — say so kindly) or a stale token.
      const { count } = await admin
        .from("shift_change_acknowledgements")
        .select("id", { count: "exact", head: true })
        .in("ack_token", tokens);
      const known = (count ?? 0) > 0;
      return new Response(
        page(
          known ? "Already acknowledged" : "Link not recognised",
          known
            ? "These changes were already confirmed — nothing more to do. Thank you!"
            : "This link doesn't match any schedule change we're tracking. If you think that's wrong, reply to the email and the admin team will check.",
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response(
      page(
        "Thank you — acknowledged",
        n === 1
          ? "You've confirmed you've seen this schedule change. The reminders will stop, and the admin team can see it's been acknowledged."
          : `You've confirmed you've seen all ${n} schedule changes. The reminders will stop, and the admin team can see they've been acknowledged.`,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (err) {
    console.error("acknowledge-shift-change error:", err);
    return new Response(
      page("Something went wrong", "We couldn't record your acknowledgement just now. Please try the link again in a minute, or acknowledge from your profile in the portal.", "#d97706"),
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});
