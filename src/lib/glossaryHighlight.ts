/**
 * Marks up the first mention of each glossary term in a page so it can carry a
 * hover definition.
 *
 * This works on the parsed document rather than on the HTML text. Searching the
 * raw markup finds matches inside tags and attribute values as well as in the
 * words people actually read — a term appearing in a link address, an image
 * name, or the text of a diagram would have a <span> spliced into the middle of
 * it, breaking the markup or, inside an <svg>, making the text vanish entirely.
 * Walking text nodes means only real prose is ever touched.
 */

export interface MatchableTerm {
  term: string;
  definition: string;
  mainTerm: string;
}

/** Places where a highlight would do damage or simply doesn't belong. */
const SKIP_INSIDE = "svg, script, style, a, code, pre, .glossary-term";

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function highlightGlossaryTerms(content: string, terms: MatchableTerm[]): string {
  if (!content || !terms.length || typeof DOMParser === "undefined") return content;

  const doc = new DOMParser().parseFromString(`<body>${content}</body>`, "text/html");
  const body = doc.body;
  if (!body) return content;

  // Collect the prose up front; the tree is edited as we go.
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = (node as Text).parentElement;
      if (!parent || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      return parent.closest(SKIP_INSIDE) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });

  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  if (!textNodes.length) return content;

  // Longest first, so "care plan review" wins over "care plan".
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const alreadyMarked = new Set<string>();

  for (const entry of sorted) {
    const key = entry.mainTerm.toLowerCase();
    if (alreadyMarked.has(key) || !entry.term.trim()) continue;

    const pattern = new RegExp(`\\b${escapeRegex(entry.term)}\\b`, "i");

    for (let i = 0; i < textNodes.length; i++) {
      const node = textNodes[i];
      if (!node.isConnected) continue;

      const match = pattern.exec(node.data);
      if (!match) continue;

      // Split the run into [before][match][after] and wrap the middle.
      const rest = node.splitText(match.index);
      rest.data = rest.data.slice(match[0].length);

      const span = doc.createElement("span");
      span.className = "glossary-term";
      span.setAttribute("data-term", entry.mainTerm);
      span.setAttribute("data-definition", entry.definition);
      span.textContent = match[0];
      rest.parentNode?.insertBefore(span, rest);

      // The tail is still prose, so later terms can match in it.
      textNodes.splice(i + 1, 0, rest);
      alreadyMarked.add(key);
      break;
    }
  }

  return body.innerHTML;
}
