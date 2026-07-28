// Pulls explained bank entries from FreeAgent into public.company_expense_entries —
// the source behind "what do we actually spend each month".
//
// Three calls are needed because FreeAgent models this relationally: categories are
// returned as URIs rather than names, and explanations must be requested per bank
// account. So: fetch the category map, fetch the accounts, then walk each account's
// explanations and resolve the category URI to a readable name on the way in.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = Deno.env.get("FREEAGENT_API_BASE") ?? "https://api.freeagent.com";
const CLIENT_ID = Deno.env.get("FREEAGENT_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("FREEAGENT_CLIENT_SECRET") ?? "";

async function accessToken(admin: any): Promise<string> {
  const { data: row } = await admin.from("freeagent_oauth")
    .select("access_token, refresh_token, expires_at").eq("id", true).maybeSingle();
  if (!row?.refresh_token) throw new Error("FreeAgent isn't connected yet.");

  const expiresAt = row.expires_at ? new Date(row.expires_at).getTime() : 0;
  if (row.access_token && expiresAt - Date.now() > 60_000) return row.access_token;

  const res = await fetch(`${API_BASE}/v2/token_endpoint`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${CLIENT_ID}:${CLIENT_SECRET}`)}`,
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: row.refresh_token }),
  });
  if (!res.ok) throw new Error(`Token refresh failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  const tok = await res.json();
  await admin.from("freeagent_oauth").update({
    access_token: tok.access_token,
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", true);
  return tok.access_token;
}

const get = async (url: string, token: string) => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`${url.split("/v2/")[1]?.split("?")[0]} failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
  return res.json();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    if (jwt !== Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) {
      const { data: userData } = await admin.auth.getUser(jwt);
      const userId = userData?.user?.id;
      const { data: profile } = userId
        ? await admin.from("profiles").select("role").eq("user_id", userId).maybeSingle()
        : { data: null };
      if (profile?.role !== "admin") {
        return new Response(JSON.stringify({ error: "Admins only" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json().catch(() => ({}));
    const months = Number(body.months ?? 24);
    const from = new Date();
    from.setMonth(from.getMonth() - months);
    const fromDate = from.toISOString().slice(0, 10);
    const toDate = new Date().toISOString().slice(0, 10);

    const token = await accessToken(admin);

    // Category URI -> readable name. FreeAgent splits these across several buckets.
    const cats = await get(`${API_BASE}/v2/categories`, token);
    const catName: Record<string, string> = {};
    for (const bucket of Object.values(cats ?? {})) {
      if (!Array.isArray(bucket)) continue;
      for (const c of bucket as any[]) if (c?.url) catName[c.url] = c.description ?? c.name ?? "";
    }

    const accounts = (await get(`${API_BASE}/v2/bank_accounts`, token))?.bank_accounts ?? [];
    const rows: any[] = [];

    for (const acct of accounts) {
      let page = 1;
      while (page <= 40) {
        const url = new URL(`${API_BASE}/v2/bank_transaction_explanations`);
        url.searchParams.set("bank_account", acct.url);
        url.searchParams.set("from_date", fromDate);
        url.searchParams.set("to_date", toDate);
        url.searchParams.set("per_page", "100");
        url.searchParams.set("page", String(page));

        const batch = (await get(url.toString(), token))?.bank_transaction_explanations ?? [];
        for (const e of batch) {
          if (!e?.url || !e?.dated_on) continue;
          rows.push({
            source_url: e.url,
            entry_date: e.dated_on,
            gross_value: Number(e.gross_value ?? 0),
            description: (e.description ?? "").slice(0, 500) || null,
            category_name: catName[e.category] ?? null,
            category_url: e.category ?? null,
            bank_account_name: acct.name ?? null,
            updated_at: new Date().toISOString(),
          });
        }
        if (batch.length < 100) break;
        page += 1;
      }
    }

    for (let i = 0; i < rows.length; i += 200) {
      const { error } = await admin.from("company_expense_entries")
        .upsert(rows.slice(i, i + 200), { onConflict: "source_url" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    await admin.from("freeagent_oauth").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "ok",
      last_sync_detail: `${rows.length} bank entries across ${accounts.length} accounts`,
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return new Response(JSON.stringify({ synced: rows.length, accounts: accounts.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await admin.from("freeagent_oauth").update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: "error",
      last_sync_detail: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
