// Pulls invoices from FreeAgent into public.client_invoices — the same table the
// manual spreadsheet import writes to, on the same natural key, so the two paths
// converge rather than duplicating each other.
//
// Line items come back nested so discounts, add-ons and one-offs are preserved:
// that detail is the whole reason for holding real invoices rather than a single
// MRR figure per client.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const API_BASE = Deno.env.get("FREEAGENT_API_BASE") ?? "https://api.freeagent.com";
const CLIENT_ID = Deno.env.get("FREEAGENT_CLIENT_ID") ?? "";
const CLIENT_SECRET = Deno.env.get("FREEAGENT_CLIENT_SECRET") ?? "";

/** Returns a usable access token, refreshing it first if it's expired or close to it. */
async function accessToken(admin: any): Promise<string> {
  const { data: row } = await admin
    .from("freeagent_oauth")
    .select("access_token, refresh_token, expires_at")
    .eq("id", true).maybeSingle();

  if (!row?.refresh_token) throw new Error("FreeAgent isn't connected yet — run the connect step first.");

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
    // FreeAgent may or may not rotate the refresh token; keep the old one if not.
    refresh_token: tok.refresh_token ?? row.refresh_token,
    expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq("id", true);

  return tok.access_token;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    // Admin-only, unless invoked with the service role (scheduled runs).
    const jwt = req.headers.get("Authorization")?.replace("Bearer ", "") ?? "";
    const isServiceRole = jwt === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServiceRole) {
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
    const token = await accessToken(admin);

    // Full pull by default; pass updatedSince for a cheap incremental refresh.
    const perPage = 100;
    let page = 1;
    const rows: any[] = [];
    while (page <= 60) {   // hard stop; 6,000 invoices is far beyond current volume
      const url = new URL(`${API_BASE}/v2/invoices`);
      url.searchParams.set("nested_invoice_items", "true");
      url.searchParams.set("per_page", String(perPage));
      url.searchParams.set("page", String(page));
      if (body.updatedSince) url.searchParams.set("updated_since", body.updatedSince);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`Invoice fetch failed (${res.status}): ${(await res.text()).slice(0, 200)}`);

      const batch = (await res.json())?.invoices ?? [];
      for (const i of batch) {
        const lines = (i.invoice_items ?? []).map((li: any) => ({
          type: li.item_type ?? null,
          description: (li.description ?? "").trim(),
          quantity: li.quantity != null ? Number(li.quantity) : null,
          price: li.price != null ? Number(li.price) : null,
        }));
        rows.push({
          reference: String(i.reference ?? "").trim(),
          contact_organisation: (i.contact_name ?? "").trim(),
          invoice_date: i.dated_on,
          payment_terms_days: Number(i.payment_terms_in_days ?? 0),
          status: i.status ?? null,
          paid_date: i.paid_on ?? null,
          paid_amount: i.paid_value != null ? Number(i.paid_value) : null,
          net_amount: i.net_value != null ? Number(i.net_value) : null,
          sales_tax_amount: i.sales_tax_value != null ? Number(i.sales_tax_value) : null,
          total_value: Number(i.total_value ?? 0),
          currency: i.currency ?? "GBP",
          lines,
          source_export: "freeagent-api",
        });
      }
      if (batch.length < perPage) break;
      page += 1;
    }

    const usable = rows.filter((r) => r.reference && r.contact_organisation && r.invoice_date);
    for (let i = 0; i < usable.length; i += 200) {
      const { error } = await admin
        .from("client_invoices")
        .upsert(usable.slice(i, i + 200), { onConflict: "contact_organisation,reference,invoice_date" });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    // Attach any newly-seen organisations to a portal client where the name matches.
    await admin.rpc("link_client_invoices").catch(() => {});

    await admin.from("freeagent_oauth").update({
      last_invoice_sync_at: new Date().toISOString(),
      last_invoice_sync_status: "ok",
      last_invoice_sync_detail: `${usable.length} invoices`,
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return new Response(JSON.stringify({ synced: usable.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    await admin.from("freeagent_oauth").update({
      last_invoice_sync_at: new Date().toISOString(),
      last_invoice_sync_status: "error",
      last_invoice_sync_detail: String(e).slice(0, 500),
      updated_at: new Date().toISOString(),
    }).eq("id", true);

    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
