/**
 * The academy's current home, and the addresses it used to answer on.
 *
 * The retired hosts serve nothing now, so a link to one is simply broken — and
 * they outlive their own DNS in pasted links, bookmarks and old emails. Anything
 * that accepts a URL from a person should run it through `normalizeAppUrl`, so a
 * stale address is repaired on the way in rather than saved and found later.
 */
export const APP_ORIGIN = "https://www.care-cuddle-academy.co.uk";

/** Hosts the academy used to serve from. Order doesn't matter; all are dead. */
export const LEGACY_APP_HOSTS = [
  "cc-academy.care-cuddle.co.uk",
  "cc-acdemy.lovable.app",
  "care-cuddle-academy.co.uk", // the apex — the site answers on www
];

/**
 * Rewrites a retired academy host to the current one, preserving the path,
 * query and hash. Anything else — another site, a relative path, free text —
 * is returned untouched.
 *
 * A `blob:` URL is left alone deliberately: it's a handle to data held by one
 * browser tab, already dead once that tab closed, so changing its host would
 * only disguise a broken link as a working one.
 */
export function normalizeAppUrl(raw: string): string {
  const value = (raw ?? "").trim();
  if (!value || value.startsWith("blob:")) return raw;
  try {
    const u = new URL(value);
    if (!LEGACY_APP_HOSTS.includes(u.hostname)) return raw;
    return `${APP_ORIGIN}${u.pathname}${u.search}${u.hash}`;
  } catch {
    return raw; // not a URL — leave it exactly as typed
  }
}
