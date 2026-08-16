/**
 * Process maps — a small flowchart engine with no dependencies.
 *
 * A map is a plain object (boxes and arrows). Three things are built from it:
 *
 *   • an SVG picture, which is what gets stored inside the page HTML, so every
 *     surface that already renders page content — the academy view, the public
 *     page, print — shows the diagram with no extra code and no JavaScript;
 *   • the model itself, stored alongside the picture in a data attribute, so
 *     the diagram can be re-opened and edited later rather than being a dead
 *     image;
 *   • an automatic layout, so writing a map is a matter of naming the steps
 *     and saying what follows what — positions are only a refinement.
 *
 * Everything here is pure: no React, no DOM. That lets the same code draw the
 * diagrams in the browser and generate them from a script, which is how the
 * Essential Reading maps were produced without drifting from what the editor
 * would draw.
 */

export type MapShape = "terminator" | "process" | "decision" | "document";
export type MapColour = "green" | "blue" | "purple" | "amber" | "red" | "grey";

export interface MapNode {
  id: string;
  text: string;
  shape: MapShape;
  colour: MapColour;
  /** Top-left corner, diagram units. Set by autoLayout, then by dragging. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MapEdge {
  id: string;
  from: string;
  to: string;
  /** Branch label — "Yes" / "No" on a decision. */
  label?: string;
  colour?: MapColour;
  dashed?: boolean;
}

export interface ProcessMapModel {
  v: 1;
  title?: string;
  nodes: MapNode[];
  edges: MapEdge[];
}

/**
 * Pastel fills with a stronger stroke — the convention every flowchart tool
 * uses, and the one the agency's existing diagrams already follow, so a map
 * drawn here sits beside them without looking like a different document.
 * Fills stay light in dark mode too, hence the fixed dark ink.
 */
export const MAP_COLOURS: Record<MapColour, { fill: string; stroke: string; ink: string; label: string }> = {
  green: { fill: "#d5e8d4", stroke: "#82b366", ink: "#12290f", label: "Green" },
  blue: { fill: "#dae8fc", stroke: "#6c8ebf", ink: "#0f2440", label: "Blue" },
  purple: { fill: "#e1d5e7", stroke: "#9673a6", ink: "#2b1a33", label: "Purple" },
  amber: { fill: "#fff2cc", stroke: "#d6b656", ink: "#3a2c00", label: "Amber" },
  red: { fill: "#f8cecc", stroke: "#b85450", ink: "#43100e", label: "Red" },
  grey: { fill: "#f2f2f2", stroke: "#9aa0a6", ink: "#1f2430", label: "Grey" },
};

export const SHAPE_LABELS: Record<MapShape, string> = {
  terminator: "Start / end",
  process: "Step",
  decision: "Decision",
  document: "Record",
};

const FONT = "'Segoe UI', system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif";
const FONT_SIZE = 12.5;
const LINE_HEIGHT = 15.5;
const PAD = 24; // canvas margin around the drawing
const H_GAP = 34; // between siblings on a row
const V_GAP = 46; // between rows

const round = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => String(Math.round(n * 10) / 10);

/* ------------------------------------------------------------------ text -- */

// Proportional-ish character widths. A flat average wraps badly on words like
// "Illegal" or "Communication"; these buckets are close enough that the drawn
// text never overflows its box, which is all the wrapping has to guarantee.
const NARROW = "ijlItf.,:;'`|!()[]{}/\\-";
const WIDE = "mwMW@%";
const CAPS = "ABCDEFGHJKLNOPQRSTUVXYZ0123456789&#";

function charWidth(ch: string, size: number): number {
  if (ch === " ") return size * 0.28;
  if (NARROW.includes(ch)) return size * 0.31;
  if (WIDE.includes(ch)) return size * 0.87;
  if (CAPS.includes(ch)) return size * 0.65;
  return size * 0.53;
}

function textWidth(s: string, size = FONT_SIZE): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch, size);
  return w;
}

export function wrapText(text: string, maxWidth: number, size = FONT_SIZE): string[] {
  const paragraphs = String(text ?? "").split(/\n/);
  const lines: string[] = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size) <= maxWidth || !line) {
        // A single word longer than the box is broken by character rather than
        // being allowed to run outside the shape.
        if (!line && textWidth(word, size) > maxWidth) {
          let chunk = "";
          for (const ch of word) {
            if (textWidth(chunk + ch, size) > maxWidth && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          line = chunk;
        } else {
          line = candidate;
        }
      } else {
        lines.push(line);
        line = word;
      }
    }
    if (line) lines.push(line);
  }

  return lines.length ? lines : [""];
}

/** Text area inside a shape — a diamond only offers its middle band. */
function innerWidth(shape: MapShape, w: number): number {
  return shape === "decision" ? w * 0.6 : w - 26;
}

/** Box size that fits the text. Called on every text edit, so shapes grow. */
export function measureNode(text: string, shape: MapShape): { w: number; h: number } {
  const single = textWidth(String(text ?? "").replace(/\s+/g, " ").trim());

  if (shape === "decision") {
    const w = Math.min(240, Math.max(150, single * 1.15 + 46));
    const lines = wrapText(text, innerWidth("decision", w));
    return { w: round(w), h: round(Math.max(84, lines.length * LINE_HEIGHT + 52)) };
  }

  const w = Math.min(210, Math.max(124, single + 30));
  const lines = wrapText(text, innerWidth(shape, w));
  const minH = shape === "terminator" ? 44 : 50;
  return { w: round(w), h: round(Math.max(minH, lines.length * LINE_HEIGHT + 22)) };
}

/* ---------------------------------------------------------------- model -- */

let seq = 0;
export function mapId(prefix = "n"): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}`;
}

export function defaultColour(shape: MapShape): MapColour {
  if (shape === "decision") return "purple";
  if (shape === "document") return "amber";
  return "green";
}

export function makeNode(text: string, shape: MapShape = "process", colour?: MapColour): MapNode {
  return {
    id: mapId(),
    text,
    shape,
    colour: colour ?? defaultColour(shape),
    x: 0,
    y: 0,
    ...measureNode(text, shape),
  };
}

export function makeEdge(from: string, to: string, label?: string): MapEdge {
  return { id: mapId("e"), from, to, label };
}

/** The map you get from the toolbar button — a real one, just short. */
export function newProcessMap(title?: string): ProcessMapModel {
  const a = makeNode("Start", "terminator", "blue");
  const b = makeNode("First step", "process");
  const c = makeNode("Is anything else needed?", "decision");
  const d = makeNode("Do that", "process");
  const e = makeNode("Finished", "terminator", "blue");
  return autoLayout({
    v: 1,
    title,
    nodes: [a, b, c, d, e],
    edges: [
      makeEdge(a.id, b.id),
      makeEdge(b.id, c.id),
      { ...makeEdge(c.id, d.id), label: "Yes" },
      { ...makeEdge(c.id, e.id), label: "No" },
      makeEdge(d.id, e.id),
    ],
  });
}

/* --------------------------------------------------------------- layout -- */

/**
 * Rows come from the longest path to a node, so a step never sits above
 * something it depends on. Within a row, nodes drift towards the average
 * position of what feeds them and are then pushed apart — which keeps the
 * common case (a straight line of steps) perfectly straight, and pushes
 * branches out to the side.
 */
export function autoLayout(model: ProcessMapModel): ProcessMapModel {
  const nodes = model.nodes.map((n) => ({ ...n, ...measureNode(n.text, n.shape) }));
  if (!nodes.length) return { ...model, nodes };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links = model.edges.filter((e) => byId.has(e.from) && byId.has(e.to) && e.from !== e.to);

  const outAll = new Map<string, string[]>();
  const inAll = new Map<string, string[]>();
  nodes.forEach((n) => {
    outAll.set(n.id, []);
    inAll.set(n.id, []);
  });
  links.forEach((e) => {
    outAll.get(e.from)!.push(e.to);
    inAll.get(e.to)!.push(e.from);
  });

  /**
   * A detour: one step hanging off a decision that rejoins the path the
   * decision also goes to directly — "if yes, do this as well". Drawing it as
   * another row would push the arrow for the other answer straight through it,
   * hiding the branch. It belongs beside its decision, which is how these get
   * drawn by hand.
   */
  const detour = new Map<string, { parent: string; child: string }>();
  nodes.forEach((n) => {
    const parents = inAll.get(n.id)!;
    const children = outAll.get(n.id)!;
    if (parents.length !== 1 || children.length !== 1) return;
    const [parent] = parents;
    const [child] = children;
    if (parent === n.id || child === n.id || parent === child) return;
    if (!outAll.get(parent)!.includes(child)) return; // no direct path — a real step
    detour.set(n.id, { parent, child });
  });

  // Rank on the graph with detours lifted out; they inherit their decision's row.
  const out = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  nodes.forEach((n) => {
    out.set(n.id, []);
    incoming.set(n.id, 0);
  });
  links.forEach((e) => {
    if (detour.has(e.from) || detour.has(e.to)) return;
    out.get(e.from)!.push(e.to);
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  });

  // Depth-first from the entry points; edges that point back at something
  // already on the stack are loops and must not push rows down for ever.
  const rank = new Map<string, number>();
  const onStack = new Set<string>();
  const roots = nodes
    .filter((n) => !detour.has(n.id) && (incoming.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const starts = roots.length ? roots : [nodes.find((n) => !detour.has(n.id))?.id ?? nodes[0].id];

  const walk = (id: string, depth: number) => {
    const current = rank.get(id);
    if (current !== undefined && current >= depth) return;
    rank.set(id, depth);
    onStack.add(id);
    for (const next of out.get(id) ?? []) {
      if (onStack.has(next)) continue; // loop back — leave its row alone
      walk(next, depth + 1);
    }
    onStack.delete(id);
  };
  starts.forEach((id) => walk(id, 0));
  detour.forEach((link, id) => rank.set(id, rank.get(link.parent) ?? 0));
  nodes.forEach((n) => {
    if (!rank.has(n.id)) rank.set(n.id, 0); // unreachable island
  });

  // Rows keep each detour immediately after its decision, so it settles to the
  // right of it rather than fighting for the middle.
  const rows: string[][] = [];
  nodes.forEach((n) => {
    if (detour.has(n.id)) return;
    (rows[rank.get(n.id)!] ||= []).push(n.id);
  });
  detour.forEach((link, id) => {
    const row = (rows[rank.get(id)!] ||= []);
    const at = row.indexOf(link.parent);
    row.splice(at < 0 ? row.length : at + 1, 0, id);
  });

  // Vertical: each row sits below the tallest box of the row above.
  let y = PAD;
  rows.forEach((row) => {
    if (!row) return;
    const tallest = Math.max(...row.map((id) => byId.get(id)!.h));
    row.forEach((id) => {
      const n = byId.get(id)!;
      n.y = round(y + (tallest - n.h) / 2);
    });
    y += tallest + V_GAP;
  });

  // Horizontal: seed left-to-right, then settle towards parents.
  rows.forEach((row) => {
    if (!row) return;
    let x = 0;
    row.forEach((id) => {
      const n = byId.get(id)!;
      n.x = x;
      x += n.w + H_GAP;
    });
  });

  const centre = (n: MapNode) => n.x + n.w / 2;

  // What each node lines up under. A detour rejoining the path doesn't count,
  // or it would drag the step it rejoins off the spine.
  const parentsOf = new Map<string, string[]>();
  links.forEach((e) => {
    if (detour.has(e.from)) return;
    const list = parentsOf.get(e.to) ?? [];
    list.push(e.from);
    parentsOf.set(e.to, list);
  });

  for (let pass = 0; pass < 4; pass++) {
    rows.forEach((row, r) => {
      if (!row || r === 0) return;
      const wanted = row.map((id) => {
        const parents = (parentsOf.get(id) ?? []).map((p) => byId.get(p)).filter(Boolean) as MapNode[];
        const n = byId.get(id)!;
        if (!parents.length) return centre(n);
        return parents.reduce((sum, p) => sum + centre(p), 0) / parents.length;
      });

      // Order by desired position, then lay out left to right keeping gaps.
      const order = row
        .map((id, i) => ({ id, want: wanted[i] }))
        .sort((a, b) => a.want - b.want);

      let cursor = -Infinity;
      order.forEach(({ id, want }) => {
        const n = byId.get(id)!;
        const left = Math.max(want - n.w / 2, cursor);
        n.x = round(left);
        cursor = left + n.w + H_GAP;
      });
      rows[r] = order.map((o) => o.id);
    });

    // Pull single-child chains back under their parent so the spine is straight.
    rows.forEach((row) => {
      if (!row || row.length !== 1) return;
      const n = byId.get(row[0])!;
      const parents = (parentsOf.get(n.id) ?? []).map((p) => byId.get(p)!).filter(Boolean);
      if (parents.length === 1 && (out.get(parents[0].id) ?? []).length === 1) {
        n.x = round(centre(parents[0]) - n.w / 2);
      }
    });
  }

  // Normalise to the top-left with a margin.
  const minX = Math.min(...nodes.map((n) => n.x));
  const minY = Math.min(...nodes.map((n) => n.y));
  nodes.forEach((n) => {
    n.x = round(n.x - minX + PAD);
    n.y = round(n.y - minY + PAD);
  });

  return { ...model, nodes };
}

/* --------------------------------------------------------------- routing -- */

interface Pt {
  x: number;
  y: number;
}

const cx = (n: MapNode) => n.x + n.w / 2;
const cy = (n: MapNode) => n.y + n.h / 2;

/**
 * Arrows travel along right angles, which reads far better than diagonals once
 * a diagram has more than a couple of branches. Which sides they leave and
 * enter is decided by where the two boxes actually are, so the routing still
 * looks deliberate after a box has been dragged somewhere new.
 */
export function routeEdge(a: MapNode, b: MapNode, lane = 0, obstacles: MapNode[] = []): { points: Pt[] } {
  const gapV = b.y - (a.y + a.h);
  const gapH = b.x - (a.x + a.w);
  const gapHRev = a.x - (b.x + b.w);

  // Straight down — the ordinary case.
  if (gapV >= 6) {
    const dx = cx(b) - cx(a);
    if (Math.abs(dx) < 6) {
      // An arrow that skips a row would otherwise be drawn straight through
      // whatever sits between the two boxes. Step around it instead.
      const blocker = obstacles.find(
        (n) =>
          n.id !== a.id &&
          n.id !== b.id &&
          n.y < b.y &&
          n.y + n.h > a.y + a.h &&
          Math.abs(cx(n) - cx(a)) < n.w / 2 + 12,
      );
      if (blocker) {
        const channel = Math.max(a.x + a.w, b.x + b.w, blocker.x + blocker.w) + 30 + lane * 14;
        const leaveAt = a.y + a.h + 18;
        const enterAt = b.y - 18;
        return {
          points: [
            { x: cx(a), y: a.y + a.h },
            { x: cx(a), y: leaveAt },
            { x: channel, y: leaveAt },
            { x: channel, y: enterAt },
            { x: cx(b), y: enterAt },
            { x: cx(b), y: b.y },
          ],
        };
      }
      return { points: [{ x: cx(a), y: a.y + a.h }, { x: cx(b), y: b.y }] };
    }
    // Side-step: leave from the side when the target is well off to one hand
    // and barely below. Only for a near-level target — anything further down
    // has a row in between that a side-step would cut straight through.
    if (Math.abs(dx) > a.w / 2 + b.w / 2 + 4 && gapV < 24) {
      const fromX = dx > 0 ? a.x + a.w : a.x;
      return {
        points: [
          { x: fromX, y: cy(a) },
          { x: cx(b), y: cy(a) },
          { x: cx(b), y: b.y },
        ],
      };
    }
    // Nudging parallel arrows apart must never push the bend past the box it
    // is heading for, or the arrow would double back and point the wrong way.
    const midY = Math.max(
      a.y + a.h + 3,
      Math.min(a.y + a.h + gapV / 2 + lane * 8, b.y - 6),
    );
    return {
      points: [
        { x: cx(a), y: a.y + a.h },
        { x: cx(a), y: midY },
        { x: cx(b), y: midY },
        { x: cx(b), y: b.y },
      ],
    };
  }

  // Side by side.
  if (gapH >= 6) {
    const midX = a.x + a.w + gapH / 2;
    if (Math.abs(cy(b) - cy(a)) < 6) {
      return { points: [{ x: a.x + a.w, y: cy(a) }, { x: b.x, y: cy(b) }] };
    }
    return {
      points: [
        { x: a.x + a.w, y: cy(a) },
        { x: midX, y: cy(a) },
        { x: midX, y: cy(b) },
        { x: b.x, y: cy(b) },
      ],
    };
  }
  if (gapHRev >= 6) {
    const midX = b.x + b.w + gapHRev / 2;
    if (Math.abs(cy(b) - cy(a)) < 6) {
      return { points: [{ x: a.x, y: cy(a) }, { x: b.x + b.w, y: cy(b) }] };
    }
    return {
      points: [
        { x: a.x, y: cy(a) },
        { x: midX, y: cy(a) },
        { x: midX, y: cy(b) },
        { x: b.x + b.w, y: cy(b) },
      ],
    };
  }

  // Going back up: run out to a channel on the right so the line never crosses
  // the boxes in between.
  const channel = Math.max(a.x + a.w, b.x + b.w) + 30 + lane * 14;
  return {
    points: [
      { x: a.x + a.w, y: cy(a) },
      { x: channel, y: cy(a) },
      { x: channel, y: cy(b) },
      { x: b.x + b.w, y: cy(b) },
    ],
  };
}

/** Right angles, softened. */
function polylinePath(points: Pt[], radius = 7): string {
  if (points.length < 2) return "";
  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const corner = points[i];
    const next = points[i + 1];
    const r = Math.min(
      radius,
      Math.hypot(corner.x - prev.x, corner.y - prev.y) / 2,
      Math.hypot(next.x - corner.x, next.y - corner.y) / 2,
    );
    const from = pointTowards(corner, prev, r);
    const to = pointTowards(corner, next, r);
    d += ` L ${fmt(from.x)} ${fmt(from.y)} Q ${fmt(corner.x)} ${fmt(corner.y)} ${fmt(to.x)} ${fmt(to.y)}`;
  }
  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;
  return d;
}

function pointTowards(from: Pt, to: Pt, dist: number): Pt {
  const len = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  return { x: from.x + ((to.x - from.x) / len) * dist, y: from.y + ((to.y - from.y) / len) * dist };
}

/** Drawn as a filled triangle rather than a marker, so no ids can collide. */
function arrowPath(points: Pt[]): string {
  const end = points[points.length - 1];
  const before = points[points.length - 2] ?? end;
  const angle = Math.atan2(end.y - before.y, end.x - before.x);
  const size = 8;
  const spread = 0.42;
  const p1 = { x: end.x - size * Math.cos(angle - spread), y: end.y - size * Math.sin(angle - spread) };
  const p2 = { x: end.x - size * Math.cos(angle + spread), y: end.y - size * Math.sin(angle + spread) };
  return `M ${fmt(end.x)} ${fmt(end.y)} L ${fmt(p1.x)} ${fmt(p1.y)} L ${fmt(p2.x)} ${fmt(p2.y)} Z`;
}

/** Labels sit on the longest straight run, where there is room for them. */
function labelSpot(points: Pt[]): Pt {
  let p0 = points[0];
  let p1 = points[1] ?? points[0];
  let longest = -1;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    if (len > longest) {
      longest = len;
      p0 = points[i];
      p1 = points[i + 1];
    }
  }
  const along = points.length === 2 ? 0.42 : 0.5;
  return { x: p0.x + (p1.x - p0.x) * along, y: p0.y + (p1.y - p0.y) * along };
}

/* ---------------------------------------------------------------- render -- */

export function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The outline of one shape, positioned. */
export function shapePath(n: MapNode): string {
  const { x, y, w, h, shape } = n;
  if (shape === "decision") {
    return `M ${fmt(x + w / 2)} ${fmt(y)} L ${fmt(x + w)} ${fmt(y + h / 2)} L ${fmt(x + w / 2)} ${fmt(y + h)} L ${fmt(x)} ${fmt(y + h / 2)} Z`;
  }
  if (shape === "document") {
    // A page with a wavy foot.
    const foot = y + h - 10;
    return `M ${fmt(x)} ${fmt(y)} L ${fmt(x + w)} ${fmt(y)} L ${fmt(x + w)} ${fmt(foot)} C ${fmt(x + w * 0.72)} ${fmt(foot + 16)} ${fmt(x + w * 0.28)} ${fmt(foot - 14)} ${fmt(x)} ${fmt(foot + 2)} Z`;
  }
  return "";
}

export function nodeTextLines(n: MapNode): string[] {
  return wrapText(n.text, innerWidth(n.shape, n.w));
}

/**
 * The pieces one box is drawn from. Both the saved picture and the canvas you
 * drag boxes around on are built from this, so what you edit and what gets
 * stored can't drift apart.
 */
export interface NodeVisual {
  fill: string;
  stroke: string;
  ink: string;
  /** A rounded rectangle, or a free path for diamonds and records. */
  rect: { x: number; y: number; w: number; h: number; rx: number } | null;
  path: string | null;
  lines: string[];
  firstBaseline: number;
  centreX: number;
  lineHeight: number;
  fontSize: number;
}

export function nodeVisual(n: MapNode): NodeVisual {
  const c = MAP_COLOURS[n.colour] ?? MAP_COLOURS.green;
  const lines = nodeTextLines(n);
  const firstBaseline = n.y + n.h / 2 - (lines.length * LINE_HEIGHT) / 2 + LINE_HEIGHT * 0.78;
  const boxy = n.shape === "process" || n.shape === "terminator";

  return {
    fill: c.fill,
    stroke: c.stroke,
    ink: c.ink,
    rect: boxy ? { x: n.x, y: n.y, w: n.w, h: n.h, rx: n.shape === "terminator" ? n.h / 2 : 3 } : null,
    path: boxy ? null : shapePath(n),
    lines,
    firstBaseline,
    centreX: cx(n),
    lineHeight: LINE_HEIGHT,
    fontSize: FONT_SIZE,
  };
}

export interface EdgeVisual {
  stroke: string;
  path: string;
  arrow: string;
  dashed: boolean;
  label: { x: number; y: number; w: number; text: string } | null;
}

export function edgeVisual(
  edge: MapEdge,
  a: MapNode,
  b: MapNode,
  lane = 0,
  obstacles: MapNode[] = [],
): EdgeVisual {
  const stroke = edge.colour ? MAP_COLOURS[edge.colour].stroke : "#5b6470";
  const { points } = routeEdge(a, b, lane, obstacles);
  const visual: EdgeVisual = {
    stroke,
    path: polylinePath(points),
    arrow: arrowPath(points),
    dashed: Boolean(edge.dashed),
    label: null,
  };

  if (edge.label) {
    const spot = labelSpot(points);
    visual.label = { x: spot.x, y: spot.y, w: textWidth(edge.label, 11) + 8, text: edge.label };
  }
  return visual;
}

/**
 * Which arrows need nudging apart so they don't sit on top of each other: ones
 * dropping between the same pair of rows, and — counted separately — every
 * arrow looping back up, since those all run down channels to the right.
 */
export function laneAssignments(model: ProcessMapModel): Map<string, number> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const lanes = new Map<string, number>();
  const seenRows = new Map<string, number>();
  let backEdges = 0;

  model.edges.forEach((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) return;
    if (b.y + b.h <= a.y + 6) {
      lanes.set(e.id, backEdges++);
      return;
    }
    const key = `${Math.round(a.y + a.h)}:${Math.round(b.y)}`;
    const n = seenRows.get(key) ?? 0;
    lanes.set(e.id, n);
    seenRows.set(key, n + 1);
  });
  return lanes;
}

function renderNode(n: MapNode): string {
  const v = nodeVisual(n);
  const shapeSvg = v.rect
    ? `<rect x="${fmt(v.rect.x)}" y="${fmt(v.rect.y)}" width="${fmt(v.rect.w)}" height="${fmt(v.rect.h)}" rx="${fmt(v.rect.rx)}" fill="${v.fill}" stroke="${v.stroke}" stroke-width="1.4"/>`
    : `<path d="${v.path}" fill="${v.fill}" stroke="${v.stroke}" stroke-width="1.4" stroke-linejoin="round"/>`;

  const text = v.lines
    .map(
      (line, i) =>
        `<tspan x="${fmt(v.centreX)}" y="${fmt(v.firstBaseline + i * v.lineHeight)}">${escapeXml(line)}</tspan>`,
    )
    .join("");

  return `${shapeSvg}<text text-anchor="middle" font-size="${v.fontSize}" fill="${v.ink}">${text}</text>`;
}

function renderEdge(edge: MapEdge, a: MapNode, b: MapNode, lane: number, obstacles: MapNode[]): string {
  const v = edgeVisual(edge, a, b, lane, obstacles);
  const dash = v.dashed ? ` stroke-dasharray="5 4"` : "";
  let svg =
    `<path d="${v.path}" fill="none" stroke="${v.stroke}" stroke-width="1.5"${dash}/>` +
    `<path d="${v.arrow}" fill="${v.stroke}"/>`;

  if (v.label) {
    const { x, y, w, text } = v.label;
    svg +=
      `<rect x="${fmt(x - w / 2)}" y="${fmt(y - 8)}" width="${fmt(w)}" height="15" rx="2.5" fill="#ffffff" fill-opacity="0.92"/>` +
      `<text x="${fmt(x)}" y="${fmt(y + 3.5)}" text-anchor="middle" font-size="11" fill="#3d4653">${escapeXml(text)}</text>`;
  }
  return svg;
}

export function mapBounds(model: ProcessMapModel): { width: number; height: number } {
  if (!model.nodes.length) return { width: 320, height: 140 };
  const right = Math.max(...model.nodes.map((n) => n.x + n.w));
  const bottom = Math.max(...model.nodes.map((n) => n.y + n.h));

  // Room on the right for the channels that loop-back arrows run down.
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const loops = model.edges.filter((e) => {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    return a && b && b.y + b.h <= a.y + 6;
  }).length;
  const channel = 30 + (loops + 1) * 14 + 10;

  return { width: Math.ceil(right + PAD + channel), height: Math.ceil(bottom + PAD) };
}

/**
 * The picture that gets saved into the page. Self-contained: no CSS, no
 * script, no external fonts — it survives being copied into a PDF export or a
 * print stylesheet unchanged. It is drawn at its natural size and the block
 * around it scrolls, so a wide map stays legible instead of shrinking away.
 */
export function renderProcessMapSvg(model: ProcessMapModel): string {
  const { width, height } = mapBounds(model);
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const laneOf = laneAssignments(model);

  const edges = model.edges
    .map((e) => {
      const a = byId.get(e.from);
      const b = byId.get(e.to);
      return a && b ? renderEdge(e, a, b, laneOf.get(e.id) ?? 0, model.nodes) : "";
    })
    .join("");

  const nodes = model.nodes.map(renderNode).join("");
  const title = model.title ? `<title>${escapeXml(model.title)}</title>` : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" ` +
    `role="img" style="font-family:${FONT}">${title}${edges}${nodes}</svg>`
  );
}

/* ------------------------------------------------------------ persistence -- */

function toBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let binary = "";
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

function fromBase64(s: string): string {
  const binary = atob(s);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export function encodeModel(model: ProcessMapModel): string {
  return toBase64(JSON.stringify(model));
}

export function decodeModel(encoded: string): ProcessMapModel | null {
  try {
    const parsed = JSON.parse(fromBase64(encoded));
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed as ProcessMapModel;
  } catch {
    return null;
  }
}

/**
 * The block written into page content: the picture for everyone to read, and
 * the model tucked into an attribute so it can be opened and changed again.
 * Marked uneditable so typing in the page can't tear the drawing apart.
 */
export function serialiseProcessMap(model: ProcessMapModel): string {
  return (
    `<div class="process-map" data-process-map="${encodeModel(model)}" contenteditable="false">` +
    renderProcessMapSvg(model) +
    `</div>`
  );
}
