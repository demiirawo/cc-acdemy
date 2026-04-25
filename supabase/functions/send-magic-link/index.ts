import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { Resend } from "npm:resend@2.0.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOGO_URL = "https://care-cuddle.co.uk/wp-content/uploads/2023/03/Green-and-Beige-Bold-Typographic-Coffee-Products-Coffee-Logo-e1689542108718.png";
const BRAND_COLOR = "#5F17EB";
const BRAND_DARK = "#4A0FC0";

const emailWrapper = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f5; font-family: Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f5; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="500" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
          <!-- Logo Header -->
          <tr>
            <td style="background-color: ${BRAND_COLOR}; padding: 24px 40px; text-align: center;">
              <img src="${LOGO_URL}" alt="Care Cuddle Academy" width="140" style="display: block; margin: 0 auto;" />
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 20px 40px; background-color: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
              <p style="margin: 0; color: #9ca3af; font-size: 12px;">
                © ${new Date().getFullYear()} Care Cuddle Academy. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo } = await req.json();

    if (!email || typeof email !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: redirectTo || 'https://cc-acdemy.lovable.app/',
      },
    });

    if (linkError) {
      console.error('Error generating magic link:', linkError);
      return new Response(
        JSON.stringify({ error: linkError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      throw new Error('Failed to generate magic link URL');
    }

    console.log(`Magic link generated for ${email}`);

    const resend = new Resend(resendApiKey);

    const bodyContent = `
      <p style="margin: 0 0 20px; color: #333333; font-size: 16px; line-height: 1.5;">
        Hello,
      </p>
      <p style="margin: 0 0 30px; color: #333333; font-size: 16px; line-height: 1.5;">
        Click the button below to securely sign in to Care Cuddle Academy. This link will expire in 1 hour.
      </p>
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td align="center">
            <a href="${actionLink}" 
               style="display: inline-block; background-color: ${BRAND_COLOR}; color: #ffffff; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-size: 16px; font-weight: 600;">
              Sign In to Academy
            </a>
          </td>
        </tr>
      </table>
      <p style="margin: 30px 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
        If you didn't request this link, you can safely ignore this email.
      </p>
      <p style="margin: 15px 0 0; color: #888888; font-size: 13px; line-height: 1.5;">
        If the button doesn't work, copy and paste this URL into your browser:
      </p>
      <p style="margin: 8px 0 0; word-break: break-all; color: ${BRAND_COLOR}; font-size: 12px;">
        ${actionLink}
      </p>
    `;

    const { data: emailData, error: emailError } = await resend.emails.send({
      from: 'Care Cuddle Academy <hello@care-cuddle-academy.co.uk>',
      to: [email],
      subject: 'Your Care Cuddle Academy Login Link',
      html: emailWrapper(bodyContent),
    });

    if (emailError) {
      console.error('Resend error:', emailError);
      return new Response(
        JSON.stringify({ error: 'Failed to send magic link email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Magic link email sent to ${email} via Resend, id: ${emailData?.id}`);

    return new Response(
      JSON.stringify({ success: true, message: 'Magic link sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Send magic link error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
