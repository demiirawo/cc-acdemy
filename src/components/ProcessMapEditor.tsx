import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ArrowRight,
  Diamond,
  FileText,
  Minus,
  Plus,
  Redo2,
  Square,
  Trash2,
  Undo2,
  Wand2,
  X,
} from "lucide-react";
import {
  MAP_COLOURS,
  SHAPE_LABELS,
  autoLayout,
  edgeVisual,
  laneAssignments,
  makeEdge,
  makeNode,
  mapBounds,
  measureNode,
  newProcessMap,
  nodeVisual,
  type MapColour,
  type MapEdge,
  type MapNode,
  type MapShape,
  type ProcessMapModel,
} from "@/lib/processMap";

interface Props {
  open: boolean;
  /** The map being changed, or null to start a new one. */
  initial: ProcessMapModel | null;
  onCancel: () => void;
  onSave: (model: ProcessMapModel) => void;
}

type Selection = { kind: "node" | "edge"; id: string } | null;

const SHAPES: MapShape[] = ["process", "decision", "terminator", "document"];
const COLOURS = Object.keys(MAP_COLOURS) as MapColour[];
const SHAPE_ICON: Record<MapShape, typeof Square> = {
  process: Square,
  decision: Diamond,
  terminator: Minus,
  document: FileText,
};

/**
 * Draw a process map by hand: drag the boxes, drag from a box's handle to join
 * it to another, and type into the panel on the right. The picture on the
 * canvas is drawn from exactly the same code that writes the saved diagram, so
 * what you arrange here is what the page ends up showing.
 */
export default function ProcessMapEditor({ open, initial, onCancel, onSave }: Props) {
  const [model, setModel] = useState<ProcessMapModel>(() => initial ?? newProcessMap());
  const [selected, setSelected] = useState<Selection>(null);
  const [zoom, setZoom] = useState(1);
  const [past, setPast] = useState<ProcessMapModel[]>([]);
  const [future, setFuture] = useState<ProcessMapModel[]>([]);
  /** Set while dragging a new arrow out of a box. */
  const [linking, setLinking] = useState<{ from: string; x: number; y: number } | null>(null);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const dragRef = useRef<{ id: string; dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    if (!open) return;
    setModel(initial ?? newProcessMap());
    setSelected(null);
    setPast([]);
    setFuture([]);
    setZoom(1);
  }, [open, initial]);

  /** Every change that should be undoable goes through here. */
  const commit = useCallback((next: ProcessMapModel | ((m: ProcessMapModel) => ProcessMapModel)) => {
    setModel((current) => {
      const value = typeof next === "function" ? next(current) : next;
      setPast((p) => [...p.slice(-49), current]);
      setFuture([]);
      return value;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (!p.length) return p;
      const previous = p[p.length - 1];
      setModel((current) => {
        setFuture((f) => [current, ...f.slice(0, 49)]);
        return previous;
      });
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (!f.length) return f;
      const [next, ...rest] = f;
      setModel((current) => {
        setPast((p) => [...p, current]);
        return next;
      });
      return rest;
    });
  }, []);

  const bounds = useMemo(() => mapBounds(model), [model]);
  const lanes = useMemo(() => laneAssignments(model), [model]);
  const nodeById = useMemo(() => new Map(model.nodes.map((n) => [n.id, n])), [model.nodes]);

  const selectedNode = selected?.kind === "node" ? nodeById.get(selected.id) ?? null : null;
  const selectedEdge =
    selected?.kind === "edge" ? model.edges.find((e) => e.id === selected.id) ?? null : null;

  /* ------------------------------------------------------------ pointers */

  const pointAt = useCallback(
    (e: React.PointerEvent): { x: number; y: number } => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
    },
    [zoom],
  );

  const nodeAt = useCallback(
    (x: number, y: number): MapNode | null =>
      model.nodes.find((n) => x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h) ?? null,
    [model.nodes],
  );

  const startDrag = (e: React.PointerEvent, node: MapNode) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    dragRef.current = { id: node.id, dx: p.x - node.x, dy: p.y - node.y, moved: false };
    setSelected({ kind: "node", id: node.id });
  };

  const startLink = (e: React.PointerEvent, node: MapNode) => {
    e.stopPropagation();
    svgRef.current?.setPointerCapture(e.pointerId);
    const p = pointAt(e);
    setLinking({ from: node.id, x: p.x, y: p.y });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const p = pointAt(e);

    if (linking) {
      setLinking({ ...linking, x: p.x, y: p.y });
      return;
    }
    const drag = dragRef.current;
    if (!drag) return;

    // The first movement is what makes it undoable — a plain click is not.
    if (!drag.moved) {
      drag.moved = true;
      setPast((prev) => [...prev.slice(-49), model]);
      setFuture([]);
    }
    const x = Math.max(0, Math.round((p.x - drag.dx) / 5) * 5);
    const y = Math.max(0, Math.round((p.y - drag.dy) / 5) * 5);
    setModel((m) => ({
      ...m,
      nodes: m.nodes.map((n) => (n.id === drag.id ? { ...n, x, y } : n)),
    }));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (linking) {
      const p = pointAt(e);
      const target = nodeAt(p.x, p.y);
      if (target && target.id !== linking.from) {
        const exists = model.edges.some((edge) => edge.from === linking.from && edge.to === target.id);
        if (!exists) {
          const edge = makeEdge(linking.from, target.id);
          commit((m) => ({ ...m, edges: [...m.edges, edge] }));
          setSelected({ kind: "edge", id: edge.id });
        }
      }
      setLinking(null);
    }
    dragRef.current = null;
  };

  /* -------------------------------------------------------------- edits */

  const updateNode = (id: string, patch: Partial<MapNode>) => {
    commit((m) => ({
      ...m,
      nodes: m.nodes.map((n) => {
        if (n.id !== id) return n;
        const merged = { ...n, ...patch };
        // Text and shape decide the size — keep the box fitting its contents.
        return { ...merged, ...measureNode(merged.text, merged.shape) };
      }),
    }));
  };

  const updateEdge = (id: string, patch: Partial<MapEdge>) => {
    commit((m) => ({ ...m, edges: m.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  };

  const addNode = (shape: MapShape) => {
    const node = makeNode(shape === "decision" ? "New question?" : "New step", shape);
    const anchor = selectedNode ?? model.nodes[model.nodes.length - 1] ?? null;

    node.x = anchor ? anchor.x + anchor.w / 2 - node.w / 2 : 40;
    node.y = anchor ? anchor.y + anchor.h + 46 : 40;

    // Adding while a box is selected continues the flow from it.
    const edges = anchor ? [...model.edges, makeEdge(anchor.id, node.id)] : model.edges;
    commit((m) => ({ ...m, nodes: [...m.nodes, node], edges }));
    setSelected({ kind: "node", id: node.id });
  };

  const removeSelected = useCallback(() => {
    if (!selected) return;
    if (selected.kind === "node") {
      commit((m) => ({
        ...m,
        nodes: m.nodes.filter((n) => n.id !== selected.id),
        edges: m.edges.filter((e) => e.from !== selected.id && e.to !== selected.id),
      }));
    } else {
      commit((m) => ({ ...m, edges: m.edges.filter((e) => e.id !== selected.id) }));
    }
    setSelected(null);
  }, [selected, commit]);

  const fit = useCallback(() => {
    const available = (svgRef.current?.parentElement?.clientWidth ?? 700) - 24;
    setZoom(Math.min(1.6, Math.max(0.35, available / bounds.width)));
  }, [bounds.width]);

  /* Keyboard: delete removes the selection, but never while typing a label. */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        removeSelected();
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, removeSelected, undo, redo]);

  /* --------------------------------------------------------------- view */

  const linkFrom = linking ? nodeById.get(linking.from) ?? null : null;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent className="max-w-[1100px] w-[95vw] h-[88vh] p-0 flex flex-col gap-0 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b px-4 py-2.5 flex-wrap">
          <Input
            value={model.title ?? ""}
            onChange={(e) => setModel((m) => ({ ...m, title: e.target.value }))}
            placeholder="Name this process map"
            className="h-8 w-56 text-sm font-medium"
          />
          <div className="h-5 w-px bg-border mx-1" />
          {SHAPES.map((shape) => {
            const Icon = SHAPE_ICON[shape];
            return (
              <Button
                key={shape}
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5"
                onClick={() => addNode(shape)}
                title={`Add a ${SHAPE_LABELS[shape].toLowerCase()}`}
              >
                <Icon className="h-3.5 w-3.5" />
                {SHAPE_LABELS[shape]}
              </Button>
            );
          })}
          <div className="h-5 w-px bg-border mx-1" />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => commit(autoLayout(model))} title="Tidy the layout automatically">
            <Wand2 className="h-3.5 w-3.5" />
            Auto-arrange
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={undo} disabled={!past.length} title="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={redo} disabled={!future.length} title="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>

          <div className="ml-auto flex items-center gap-1">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.max(0.35, z - 0.15))} title="Zoom out">
              <Minus className="h-4 w-4" />
            </Button>
            <button type="button" onClick={fit} className="text-xs tabular-nums w-14 text-center text-muted-foreground hover:text-foreground" title="Fit to width">
              {Math.round(zoom * 100)}%
            </button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => setZoom((z) => Math.min(2, z + 0.15))} title="Zoom in">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex-1 flex min-h-0">
          {/* Canvas */}
          <div className="flex-1 overflow-auto bg-[#fbfbfc] p-3">
            <svg
              ref={svgRef}
              width={bounds.width * zoom}
              height={bounds.height * zoom}
              viewBox={`0 0 ${bounds.width} ${bounds.height}`}
              style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", touchAction: "none", background: "#fff", borderRadius: 6, border: "1px solid #eceef1" }}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerDown={() => setSelected(null)}
            >
              {/* Arrows first, so boxes sit on top of them */}
              {model.edges.map((edge) => {
                const a = nodeById.get(edge.from);
                const b = nodeById.get(edge.to);
                if (!a || !b) return null;
                const v = edgeVisual(edge, a, b, lanes.get(edge.id) ?? 0, model.nodes);
                const isSelected = selected?.kind === "edge" && selected.id === edge.id;
                return (
                  <g key={edge.id}>
                    <path
                      d={v.path}
                      fill="none"
                      stroke={isSelected ? "hsl(var(--primary))" : v.stroke}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      strokeDasharray={v.dashed ? "5 4" : undefined}
                    />
                    <path d={v.arrow} fill={isSelected ? "hsl(var(--primary))" : v.stroke} />
                    {/* A fat invisible copy, so the arrow is easy to click */}
                    <path
                      d={v.path}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={14}
                      style={{ cursor: "pointer" }}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setSelected({ kind: "edge", id: edge.id });
                      }}
                    />
                    {v.label && (
                      <>
                        <rect x={v.label.x - v.label.w / 2} y={v.label.y - 8} width={v.label.w} height={15} rx={2.5} fill="#fff" fillOpacity={0.92} style={{ pointerEvents: "none" }} />
                        <text x={v.label.x} y={v.label.y + 3.5} textAnchor="middle" fontSize={11} fill="#3d4653" style={{ pointerEvents: "none", userSelect: "none" }}>
                          {v.label.text}
                        </text>
                      </>
                    )}
                  </g>
                );
              })}

              {/* The arrow being dragged out of a box */}
              {linking && linkFrom && (
                <line
                  x1={linkFrom.x + linkFrom.w / 2}
                  y1={linkFrom.y + linkFrom.h}
                  x2={linking.x}
                  y2={linking.y}
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.6}
                  strokeDasharray="4 3"
                />
              )}

              {model.nodes.map((node) => {
                const v = nodeVisual(node);
                const isSelected = selected?.kind === "node" && selected.id === node.id;
                return (
                  <g key={node.id} style={{ cursor: "move" }} onPointerDown={(e) => startDrag(e, node)}>
                    {v.rect ? (
                      <rect x={v.rect.x} y={v.rect.y} width={v.rect.w} height={v.rect.h} rx={v.rect.rx} fill={v.fill} stroke={isSelected ? "hsl(var(--primary))" : v.stroke} strokeWidth={isSelected ? 2.5 : 1.4} />
                    ) : (
                      <path d={v.path!} fill={v.fill} stroke={isSelected ? "hsl(var(--primary))" : v.stroke} strokeWidth={isSelected ? 2.5 : 1.4} strokeLinejoin="round" />
                    )}
                    <text textAnchor="middle" fontSize={v.fontSize} fill={v.ink} style={{ pointerEvents: "none", userSelect: "none" }}>
                      {v.lines.map((line, i) => (
                        <tspan key={i} x={v.centreX} y={v.firstBaseline + i * v.lineHeight}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                    {isSelected && (
                      <circle
                        cx={node.x + node.w / 2}
                        cy={node.y + node.h}
                        r={5.5}
                        fill="hsl(var(--primary))"
                        stroke="#fff"
                        strokeWidth={1.5}
                        style={{ cursor: "crosshair" }}
                        onPointerDown={(e) => startLink(e, node)}
                      />
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Inspector */}
          <div className="w-[290px] border-l bg-background overflow-y-auto p-4 space-y-4 shrink-0">
            {selectedNode && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">{SHAPE_LABELS[selectedNode.shape]}</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={removeSelected} title="Delete this box">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Wording in the box</label>
                  <Textarea
                    value={selectedNode.text}
                    onChange={(e) => updateNode(selectedNode.id, { text: e.target.value })}
                    rows={3}
                    className="text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Shape</label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {SHAPES.map((shape) => (
                      <Button
                        key={shape}
                        type="button"
                        size="sm"
                        variant={selectedNode.shape === shape ? "default" : "outline"}
                        className="h-8 text-xs"
                        onClick={() => updateNode(selectedNode.id, { shape })}
                      >
                        {SHAPE_LABELS[shape]}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Colour</label>
                  <div className="flex gap-1.5 flex-wrap">
                    {COLOURS.map((colour) => (
                      <button
                        key={colour}
                        type="button"
                        title={MAP_COLOURS[colour].label}
                        onClick={() => updateNode(selectedNode.id, { colour })}
                        className="h-7 w-7 rounded-md border-2 transition"
                        style={{
                          background: MAP_COLOURS[colour].fill,
                          borderColor: selectedNode.colour === colour ? MAP_COLOURS[colour].stroke : "transparent",
                          boxShadow: selectedNode.colour === colour ? "0 0 0 2px hsl(var(--primary) / 0.35)" : undefined,
                        }}
                      />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed border-t pt-3">
                  Drag the box to move it. Drag the dot underneath it onto another box to join them up.
                </p>
              </>
            )}

            {selectedEdge && (
              <>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">Arrow</h3>
                  <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={removeSelected} title="Delete this arrow">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Label</label>
                  <Input
                    value={selectedEdge.label ?? ""}
                    onChange={(e) => updateEdge(selectedEdge.id, { label: e.target.value })}
                    placeholder="Yes / No / when…"
                    className="h-8 text-sm"
                  />
                  <p className="text-[11px] text-muted-foreground">Keep it to a word or two — the detail belongs in the box.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Line</label>
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant={selectedEdge.dashed ? "outline" : "default"} className="h-8 text-xs flex-1" onClick={() => updateEdge(selectedEdge.id, { dashed: false })}>
                      Solid
                    </Button>
                    <Button type="button" size="sm" variant={selectedEdge.dashed ? "default" : "outline"} className="h-8 text-xs flex-1" onClick={() => updateEdge(selectedEdge.id, { dashed: true })}>
                      Dashed
                    </Button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Colour</label>
                  <div className="flex gap-1.5 flex-wrap">
                    <button
                      type="button"
                      title="Default"
                      onClick={() => updateEdge(selectedEdge.id, { colour: undefined })}
                      className="h-7 w-7 rounded-md border-2"
                      style={{ background: "#5b6470", borderColor: selectedEdge.colour ? "transparent" : "hsl(var(--primary))" }}
                    />
                    {COLOURS.map((colour) => (
                      <button
                        key={colour}
                        type="button"
                        title={MAP_COLOURS[colour].label}
                        onClick={() => updateEdge(selectedEdge.id, { colour })}
                        className="h-7 w-7 rounded-md border-2"
                        style={{
                          background: MAP_COLOURS[colour].stroke,
                          borderColor: selectedEdge.colour === colour ? "hsl(var(--primary))" : "transparent",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}

            {!selectedNode && !selectedEdge && (
              <div className="text-sm text-muted-foreground space-y-3">
                <p className="font-medium text-foreground">Nothing selected</p>
                <p className="leading-relaxed">Click a box or an arrow to change it.</p>
                <ul className="space-y-1.5 text-xs leading-relaxed list-disc pl-4">
                  <li>Drag a box to move it.</li>
                  <li>Select a box, then drag the dot underneath it onto another box to join them.</li>
                  <li><strong>Auto-arrange</strong> tidies everything up again.</li>
                  <li>Press Delete to remove what's selected.</li>
                </ul>
                <p className="text-xs leading-relaxed">
                  {model.nodes.length} {model.nodes.length === 1 ? "box" : "boxes"}, {model.edges.length}{" "}
                  {model.edges.length === 1 ? "arrow" : "arrows"}.
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X className="h-4 w-4 mr-1.5" />
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(model)}>
            <ArrowRight className="h-4 w-4 mr-1.5" />
            {initial ? "Save changes" : "Insert map"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
