import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

// ============================================================================
// CARE CUDDLE — CANONICAL EMAIL HELPERS (inlined from the shared template)
// ============================================================================

const EMAIL_SENDER = "Care Cuddle <hello@care-cuddle-academy.co.uk>";
const BRAND_COLOR = "#5F17EB";
const APP_URL = Deno.env.get("APP_URL") || "https://www.care-cuddle-academy.co.uk";
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

/** A readable list of dates: "Tuesday 11, Wednesday 12 and Thursday 13 August". */
function niceDateList(dates: string[]): string {
  const ds = dates.map((x) => new Date(x)).filter((d) => !isNaN(d.getTime()));
  if (ds.length === 0) return "";
  if (ds.length === 1) return niceDate(ds[0]);
  const sameMonth = ds.every((d) => d.getMonth() === ds[0].getMonth() && d.getFullYear() === ds[0].getFullYear());
  if (sameMonth) {
    const parts = ds.map((d) => `${DAYS[d.getDay()]} ${d.getDate()}`);
    const last = parts.pop();
    return `${parts.join(", ")} and ${last} ${MONTHS[ds[0].getMonth()]}`;
  }
  const parts = ds.map((d) => niceDate(d));
  const last = parts.pop();
  return `${parts.join(", ")} and ${last}`;
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
 * Sends one email per admin — never one email with every address visible.
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
      }).catch(() => {})
    ));
  } catch (_) { /* alerting must never break the main send */ }
}

// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    const resendApiKey = Deno.env.get("RESEND_API_KEY") ?? "";

    const { data: settings } = await admin.from("onboarding_settings").select("*").limit(1).maybeSingle();
    const { data: profile } = await admin.from("profiles").select("email, display_name").eq("user_id", user.id).maybeSingle();
    if (!profile?.email) {
      // The new starter can't receive their offer or contract — tell the admins
      // instead of failing silently.
      const starterName = profile?.display_name || "A new starter";
      await alertAdminsOfFailure(
        resendApiKey,
        `their offer and employment contract — they started joining Care Cuddle today`,
        `${starterName} (no email address on file)`,
      );
      return new Response(JSON.stringify({ error: "No email on file" }), {
        status: 400, headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }
    const { data: hr } = await admin
      .from("hr_profiles")
      .select("id, offer_email_sent_at, onboarding_contract_id, onboarding_started_at")
      .eq("user_id", user.id)
      .maybeSingle();

    const starterName = profile.display_name || profile.email;
    const updates: Record<string, any> = {};
    let offerSent = false;
    let contractCreated = false;
    // Anything that should have reached the new starter but didn't. A
    // non-empty list means this run must not answer with success-shaped JSON.
    const failures: string[] = [];

    // 1) Offer email (configured), once.
    if (settings?.offer_email_enabled && !hr?.offer_email_sent_at) {
      const offerBody =
        greeting(profile.display_name) +
        (settings.offer_email_body_html ||
          paragraph(`Congratulations — you're joining Care Cuddle, and your offer is ready for you to read in the portal.`) +
          paragraph(`Your next step is to work through your joining tasks. If you have any questions, just reply to this email.`)) +
        button("Start your joining steps", `${APP_URL}/view/hr?tab=onboarding`);
      const offerResult = await resend.emails.send({
        from: EMAIL_SENDER,
        to: [profile.email],
        subject: settings.offer_email_subject || "Your offer from Care Cuddle",
        html: emailShell(
          "Your offer from Care Cuddle",
          offerBody,
          "You're receiving this because you're joining Care Cuddle.",
        ),
      });
      if (offerResult.error) {
        // Don't stamp it as sent — otherwise the offer is lost for good and a
        // retry would skip straight past it.
        failures.push("the offer email could not be sent");
        await alertAdminsOfFailure(
          resendApiKey,
          `their offer — the email could not be sent`,
          `${starterName} (${profile.email})`,
        );
      } else {
        updates.offer_email_sent_at = new Date().toISOString();
        offerSent = true;
      }
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
          const contractBody =
            greeting(profile.display_name) +
            paragraph(`Your employment contract with Care Cuddle is ready for you to read and sign in the portal.`) +
            paragraph(`Please read it carefully before signing. If anything looks wrong, or you have questions, just reply to this email and we'll help.`) +
            button("Read and sign your contract", `${APP_URL}/view/hr?tab=my-contracts`);
          const contractResult = await resend.emails.send({
            from: EMAIL_SENDER,
            to: [profile.email],
            subject: "Your employment contract is ready to sign",
            html: emailShell(
              "Your contract is ready to sign",
              contractBody,
              "You're receiving this because you're joining Care Cuddle.",
            ),
          });
          if (contractResult.error) {
            failures.push("the contract email could not be sent");
            await alertAdminsOfFailure(
              resendApiKey,
              `their employment contract — it is ready to sign, but the email could not be sent`,
              `${starterName} (${profile.email})`,
            );
          }
        } else {
          // Insert failed: the starter has no contract and would never know.
          failures.push("the employment contract could not be created");
          await alertAdminsOfFailure(
            resendApiKey,
            `their employment contract — it could not be created`,
            `${starterName} (${profile.email})`,
          );
        }
      } else {
        // Template lookup failed: contract sending is switched on but the
        // configured template no longer exists.
        failures.push("the chosen contract template could not be found");
        await alertAdminsOfFailure(
          resendApiKey,
          `their employment contract — the contract template chosen in the onboarding settings could not be found`,
          `${starterName} (${profile.email})`,
        );
      }
    } else if (settings?.contract_enabled && !settings.contract_template_id && !hr?.onboarding_contract_id) {
      // Contract sending is switched on but no template is chosen — nothing
      // would ever go out, so tell the admins instead of staying silent.
      failures.push("no contract template is chosen in the onboarding settings");
      await alertAdminsOfFailure(
        resendApiKey,
        `their employment contract — no contract template is chosen in the onboarding settings`,
        `${starterName} (${profile.email})`,
      );
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

    // Something the new starter needed never reached them. The admins have been
    // alerted, so don't also answer with success-shaped JSON — and never let it
    // read as "already sent", which is how a missing contract goes unnoticed.
    if (failures.length) {
      const detail = failures.join(", and ");
      return new Response(
        JSON.stringify({
          success: false,
          offerSent,
          contractCreated,
          alreadyStarted: false,
          error: `${detail.charAt(0).toUpperCase()}${detail.slice(1)}. We've told the admin team.`,
        }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
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
