// Set the pipeline stage on a recruitment attempt and (optionally) email the candidate.
// Stages: 'rejected' | 'interview' | 'success'
// - rejected  -> sends generic rejection email
// - interview -> sends interview invitation with scheduling link
// - success   -> updates status only, no email
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FROM = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const LOGO_URL =
  "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const INTERVIEW_LINK = "https://calendar.app.google/ChJ2sXR7vfN9FopQ8";

type Stage = "rejected" | "interview" | "success";

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

const interviewEmail = (name: string) =>
  wrap(
    "You've been shortlisted for an interview",
    `<p>Dear ${name},</p>
     <p>I hope this message finds you well.</p>
     <p>We are pleased to inform you that you have been shortlisted for an initial interview for the Consultant role at Care Cuddle. We were impressed with your qualifications and experience and are excited to learn more about your potential fit with our team.</p>
     <p>Please use the following link to schedule your interview at a convenient time:</p>
     <p style="text-align:center;margin:24px 0;">
       <a href="${INTERVIEW_LINK}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Schedule your interview</a>
     </p>
     <p>The interview will be conducted via Google Meet, where we will discuss your background, the Consultant role, and how you can contribute to our mission at Care Cuddle.</p>
     <p>If you have any questions or need further assistance, please do not hesitate to reach out to me directly.</p>
     <p>We look forward to speaking with you soon.</p>
     <p>Kind regards,<br/>The Care Cuddle Team</p>`,
  );

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const attemptId: string | undefined = body?.attempt_id;
    const stage: Stage | undefined = body?.stage;

    if (!attemptId || !stage || !["rejected", "interview", "success"].includes(stage)) {
      return new Response(JSON.stringify({ error: "attempt_id and valid stage required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is an admin
    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await supabaseAuth.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) {
      return new Response(JSON.stringify({ error: "not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.role !== "admin") {
      return new Response(JSON.stringify({ error: "admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: attempt, error: aErr } = await supabase
      .from("recruitment_attempts")
      .select("id, candidate_name, email")
      .eq("id", attemptId)
      .maybeSingle();
    if (aErr || !attempt) {
      return new Response(JSON.stringify({ error: "attempt not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Update status
    const { error: upErr } = await supabase
      .from("recruitment_attempts")
      .update({ status: stage })
      .eq("id", attemptId);
    if (upErr) {
      return new Response(JSON.stringify({ error: upErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit
    await supabase.from("recruitment_events").insert({
      attempt_id: attemptId,
      event_type: "stage_changed",
      metadata: { stage, by: userId },
    });

    let emailResult: any = null;
    if (stage !== "success") {
      const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
      const html =
        stage === "rejected"
          ? rejectionEmail(attempt.candidate_name)
          : interviewEmail(attempt.candidate_name);
      const subject =
        stage === "rejected"
          ? "Update on your Care Cuddle application"
          : "Interview invitation — Care Cuddle Consultant role";

      try {
        emailResult = await resend.emails.send({
          from: FROM,
          to: [attempt.email],
          subject,
          html,
        });
      } catch (e: any) {
        emailResult = { error: e?.message ?? String(e) };
      }
    }

    return new Response(JSON.stringify({ ok: true, stage, emailResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
