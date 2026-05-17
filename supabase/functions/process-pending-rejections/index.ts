// Runs on a schedule. Sends queued rejection emails whose send_after time has passed.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FROM = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";

const wrap = (title: string, body: string) => `
<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
<tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
<tr><td style="background:${BRAND_COLOR};padding:24px 40px;text-align:center;">
<img src="${LOGO_URL}" alt="Care Cuddle" width="140" style="display:block;margin:0 auto 16px;" />
<h1 style="margin:0;color:#fff;font-size:20px;font-weight:600;">${title}</h1>
</td></tr>
<tr><td style="padding:32px 40px;color:#1f2937;font-size:15px;line-height:1.6;">${body}</td></tr>
<tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;color:#6b7280;font-size:12px;">
Care Cuddle &middot; <a href="https://care-cuddle.co.uk" style="color:${BRAND_COLOR};text-decoration:none;">care-cuddle.co.uk</a>
</td></tr>
</table></td></tr></table></body></html>`;

const rejectionEmail = (name: string) =>
  wrap(
    "Update on your application",
    `<p>Dear ${name},</p>
     <p>Thank you for taking the time to complete our assessment and for your interest in joining Care Cuddle.</p>
     <p>After careful consideration, we have decided to move forward with other candidates whose experience and skills more closely match what we are looking for in this role at this time.</p>
     <p>We genuinely appreciate the effort you put into your application and assessment, and we wish you every success in your career.</p>
     <p>Kind regards,<br/>The Care Cuddle Team</p>`,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

  const { data: rows, error } = await supabase
    .from("pending_rejection_emails")
    .select("id, attempt_id, candidate_name, email")
    .is("sent_at", null)
    .is("cancelled_at", null)
    .lte("send_after", new Date().toISOString())
    .limit(50);

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: any[] = [];

  for (const row of rows ?? []) {
    // Re-verify the attempt is still in "rejected" status before sending
    const { data: attempt } = await supabase
      .from("recruitment_attempts")
      .select("status")
      .eq("id", row.attempt_id)
      .maybeSingle();

    if (!attempt || attempt.status !== "rejected") {
      await supabase
        .from("pending_rejection_emails")
        .update({ cancelled_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, cancelled: true });
      continue;
    }

    try {
      const sendResult = await resend.emails.send({
        from: FROM,
        to: [row.email],
        subject: "Update on your Care Cuddle application",
        html: rejectionEmail(row.candidate_name),
      });
      await supabase
        .from("pending_rejection_emails")
        .update({ sent_at: new Date().toISOString() })
        .eq("id", row.id);
      results.push({ id: row.id, sent: true, sendResult });
    } catch (e: any) {
      results.push({ id: row.id, error: e?.message ?? String(e) });
    }
  }

  return new Response(JSON.stringify({ processed: results.length, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
