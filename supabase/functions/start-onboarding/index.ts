import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));
const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function brandedEmail(title: string, bodyHtml: string, ctaLabel: string, ctaUrl: string): string {
  return `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 20px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
        <tr><td style="background:${BRAND_COLOR};padding:28px 40px;text-align:center;">
          <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="150" style="display:block;margin:0 auto;" />
        </td></tr>
        <tr><td style="padding:32px 40px;color:#374151;font-size:15px;line-height:1.6;">
          <h1 style="margin:0 0 16px;font-size:18px;color:#111827;">${title}</h1>
          ${bodyHtml}
          <div style="text-align:center;margin-top:28px;">
            <a href="${ctaUrl}" style="display:inline-block;background:${BRAND_COLOR};color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:14px;">${ctaLabel}</a>
          </div>
        </td></tr>
        <tr><td style="padding:20px 40px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
          <p style="margin:0;color:#9ca3af;font-size:12px;">© ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data: settings } = await admin.from("onboarding_settings").select("*").limit(1).maybeSingle();
    const { data: profile } = await admin.from("profiles").select("email, display_name").eq("user_id", user.id).maybeSingle();
    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "No email on file" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { data: hr } = await admin
      .from("hr_profiles")
      .select("id, offer_email_sent_at, onboarding_contract_id, onboarding_started_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const firstName = (profile.display_name || "").split(" ")[0] || "there";
    const updates: Record<string, any> = {};
    let offerSent = false;
    let contractCreated = false;

    // 1) Offer email (configured), once.
    if (settings?.offer_email_enabled && !hr?.offer_email_sent_at) {
      await resend.emails.send({
        from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
        to: [profile.email],
        subject: settings.offer_email_subject || "Welcome to Care Cuddle — Your Offer",
        html: brandedEmail(
          `Hi ${firstName},`,
          settings.offer_email_body_html || "<p>Welcome to Care Cuddle.</p>",
          "Go to your onboarding",
          `${APP_URL}/view/hr?tab=onboarding`
        ),
      });
      updates.offer_email_sent_at = new Date().toISOString();
      offerSent = true;
    }

    // 2) Employment contract (configured template), once.
    if (settings?.contract_enabled && settings.contract_template_id && !hr?.onboarding_contract_id) {
      const { data: tpl } = await admin
        .from("contract_templates")
        .select("id, name, body_html")
        .eq("id", settings.contract_template_id)
        .maybeSingle();
      if (tpl) {
        const { data: contract } = await admin
          .from("contracts")
          .insert({
            template_id: tpl.id,
            title: tpl.name,
            body_html: tpl.body_html,
            recipient_user_id: user.id,
            recipient_email: profile.email,
            recipient_name: profile.display_name,
            created_by: user.id,
          })
          .select()
          .single();
        if (contract) {
          updates.onboarding_contract_id = contract.id;
          contractCreated = true;
          await resend.emails.send({
            from: "Care Cuddle Academy <hello@care-cuddle-academy.co.uk>",
            to: [profile.email],
            subject: `Your employment contract is ready to sign`,
            html: brandedEmail(
              "Your employment contract is ready",
              `<p>Hi ${firstName}, your employment contract <strong>${tpl.name}</strong> is ready for you to review and sign.</p>`,
              "Review & sign",
              `${APP_URL}/view/hr?tab=my-contracts`
            ),
          });
        }
      }
    }

    // 3) Persist tracking
    if (hr) {
      if (!hr.onboarding_started_at) updates.onboarding_started_at = new Date().toISOString();
      if (Object.keys(updates).length) {
        await admin.from("hr_profiles").update(updates).eq("id", hr.id);
      }
    } else {
      await admin.from("hr_profiles").insert({
        user_id: user.id,
        employment_status: "onboarding_probation",
        onboarding_started_at: new Date().toISOString(),
        ...updates,
      });
    }

    return new Response(
      JSON.stringify({ success: true, offerSent, contractCreated, alreadyStarted: !offerSent && !contractCreated }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
