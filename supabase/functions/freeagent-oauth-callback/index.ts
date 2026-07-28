// Where FreeAgent sends the user back after they approve the app. Exchanges the
// one-time code for tokens and stores them. No JWT: FreeAgent redirects the
// browser here directly, so the one-time state value is what proves this callback
// belongs to a handshake we started.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const API_BASE = Deno.env.get("FREEAGENT_API_BASE") ?? "https://api.freeagent.com";
const CLIENT_ID = Deno.env.get("FREEAGENT_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("FREEAGENT_CLIENT_SECRET") ?? "";

const page = (title: string, body: string, ok: boolean) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><title>${title}</title>
     <div style="font:16px/1.5 system-ui;max-width:34rem;margin:15vh auto;padding:0 1rem">
       <h1 style="font-size:1.25rem;color:${ok ? "#1baf7a" : "#d03b3b"}">${title}</h1>
       <p style="color:#444">${body}</p>
       <p style="color:#888;font-size:.875rem">You can close this tab.</p>
     </div>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) return page("FreeAgent declined the connection", `FreeAgent returned: ${error}`, false);
  if (!code || !state) return page("Missing details", "No authorisation code or state was returned.", false);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const { data: row } = await admin
      .from("freeagent_oauth").select("oauth_state").eq("id", true).maybeSingle();
    if (!row?.oauth_state || row.oauth_state !== state) {
      return page("That link didn't match", "The security check failed. Start the connection again from Finance.", false);
    }

    const redirectUri = `${supabaseUrl}/functions/v1/freeagent-oauth-callback`;
    const res = await fetch(`${API_BASE}/v2/token_endpoint`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!res.ok) {
      return page("FreeAgent rejected the exchange", `${res.status}: ${(await res.text()).slice(0, 300)}`, false);
    }
    const tok = await res.json();

    await admin.from("freeagent_oauth").update({
      access_token: tok.access_token,
      refresh_token: tok.refresh_token,
      expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
      oauth_state: null,                       // one-time; burn it
      connected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return page("FreeAgent connected", "Care Cuddle Academy can now read your invoices. Head back to Finance and run a sync.", true);
  } catch (e) {
    return page("Something went wrong", String(e), false);
  }
});
