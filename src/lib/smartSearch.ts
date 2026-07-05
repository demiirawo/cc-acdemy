// Lightweight, dependency-free fuzzy/ranked search for the knowledge base.
// Ranks title matches above content matches, tolerates typos (bounded
// Levenshtein), and returns a highlighted title + a context snippet so results
// feel relevant. No external library so it can't break the build/lockfile.

export interface SearchableDoc {
  id: string;
  title: string;
  content?: string | null;
}

export interface SearchHit<T> {
  item: T;
  score: number;
  titleHtml: string;
  snippetHtml?: string;
  matchedIn: "title" | "content";
}

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const stripHtml = (s: string): string =>
  s.replace(/<[^>]*>/g, " ").replace(/&[a-z#0-9]+;/gi, " ");

// Lowercase, strip accents + punctuation, collapse whitespace.
const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const normalize = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Edit distance with early exit once it exceeds `max`.
function boundedLevenshtein(a: string, b: string, max: number): number {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    const cur = new Array(b.length + 1);
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (cur[j] < rowMin) rowMin = cur[j];
    }
    if (rowMin > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

// How well a single query token matches any word in a field (0..1).
function tokenScore(token: string, words: string[]): number {
  const thr = token.length <= 3 ? 0 : token.length <= 5 ? 1 : 2;
  let best = 0;
  for (const w of words) {
    if (w === token) return 1;
    if (w.startsWith(token)) best = Math.max(best, 0.9); // "superv" → "supervision"
    else if (token.startsWith(w) && w.length >= 3) best = Math.max(best, 0.7);
    else if (token.length >= 3 && w.includes(token)) best = Math.max(best, 0.55);
    else if (thr > 0) {
      const d = boundedLevenshtein(token, w, thr); // typo tolerance
      if (d <= thr) best = Math.max(best, 0.85 - d * 0.2);
    }
  }
  return best;
}

function highlight(text: string, tokens: string[]): string {
  const escaped = escapeHtml(text);
  const parts = tokens.filter(t => t.length >= 2).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (parts.length === 0) return escaped;
  parts.sort((a, b) => b.length - a.length);
  try {
    const re = new RegExp(`(${parts.join("|")})`, "gi");
    return escaped.replace(re, '<mark class="bg-amber-300/70 text-inherit rounded-sm px-0.5">$1</mark>');
  } catch {
    return escaped;
  }
}

function makeSnippet(content: string, qNorm: string, tokens: string[]): string | undefined {
  const clean = stripHtml(content).replace(/\s+/g, " ").trim();
  if (!clean) return undefined;
  const lc = clean.toLowerCase();
  let idx = lc.indexOf(qNorm);
  if (idx < 0) {
    for (const t of tokens) {
      if (t.length < 2) continue;
      const i = lc.indexOf(t);
      if (i >= 0) { idx = i; break; }
    }
  }
  if (idx < 0) return undefined;
  const start = Math.max(0, idx - 45);
  const end = Math.min(clean.length, idx + 115);
  let snip = clean.slice(start, end).trim();
  if (start > 0) snip = "… " + snip;
  if (end < clean.length) snip = snip + " …";
  return highlight(snip, tokens);
}

export function smartSearch<T extends SearchableDoc>(
  query: string,
  docs: T[],
  opts: { limit?: number } = {}
): SearchHit<T>[] {
  const qNorm = normalize(query);
  if (qNorm.length < 2) return [];
  const tokens = qNorm.split(" ").filter(Boolean);
  const limit = opts.limit ?? 20;

  const hits: SearchHit<T>[] = [];
  for (const doc of docs) {
    const titleNorm = normalize(doc.title);
    const titleWords = titleNorm.split(" ").filter(Boolean);
    const rawContent = doc.content ? stripHtml(doc.content) : "";
    const contentNorm = normalize(rawContent);
    const contentWords = contentNorm.split(" ").filter(Boolean);

    // --- Title score ---
    let title = 0;
    if (titleNorm === qNorm) title = 1000;
    else if (titleNorm.startsWith(qNorm)) title = 750;
    else if (titleNorm.includes(qNorm)) title = 550;
    else {
      const scores = tokens.map(t => tokenScore(t, titleWords));
      const matched = scores.filter(s => s > 0).length;
      const sum = scores.reduce((a, b) => a + b, 0);
      if (matched === tokens.length) title = 300 + sum * 80;
      else if (matched > 0) title = sum * 90;
    }

    // --- Content score (weighted well below title) ---
    let content = 0;
    if (contentNorm) {
      if (contentNorm.includes(qNorm)) content = 90;
      else {
        const scores = tokens.map(t => tokenScore(t, contentWords));
        const matched = scores.filter(s => s > 0).length;
        const sum = scores.reduce((a, b) => a + b, 0);
        if (matched === tokens.length) content = 45 + sum * 10;
        else if (matched > 0) content = sum * 8;
      }
    }

    const score = title + content;
    if (score <= 0) continue;

    const titleHtml = highlight(doc.title, tokens);
    // Show a content snippet only when the title didn't already carry the match.
    const snippetHtml =
      title < 300 && content > 0 ? makeSnippet(rawContent, qNorm, tokens) : undefined;

    hits.push({ item: doc, score, titleHtml, snippetHtml, matchedIn: title >= content ? "title" : "content" });
  }

  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, limit);
}
