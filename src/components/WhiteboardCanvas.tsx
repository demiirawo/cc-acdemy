import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Pencil,
  MousePointer,
  Square,
  Circle,
  Type,
  Minus,
  Download,
  Trash2,
  Undo2,
  Redo2,
  Eraser,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Image as ImageIcon,
  Hand,
  Loader2,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type FabricCanvas = any;
type FabricObject = any;

type Tool =
  | "select"
  | "draw"
  | "eraser"
  | "pan"
  | "text"
  | "rectangle"
  | "circle"
  | "line";

const COLORS = [
  "#000000", "#FF0000", "#00C853", "#2962FF",
  "#FFD600", "#D500F9", "#00B8D4", "#FF6D00",
  "#6A1B9A", "#1B5E20", "#B71C1C", "#0D47A1",
];

const HISTORY_LIMIT = 60;

export function WhiteboardCanvas() {
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fabricRef = useRef<FabricCanvas | null>(null);

  const [ready, setReady] = useState(false);
  const [activeTool, setActiveTool] = useState<Tool>("select");
  const [activeColor, setActiveColor] = useState("#000000");
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [zoom, setZoom] = useState(1);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle");

  // Refs for things that change inside fabric callbacks without re-binding
  const activeToolRef = useRef(activeTool);
  const activeColorRef = useRef(activeColor);
  const strokeWidthRef = useRef(strokeWidth);
  const isPanningRef = useRef(false);
  const spaceDownRef = useRef(false);
  const lastPanRef = useRef<{ x: number; y: number } | null>(null);
  const userIdRef = useRef<string | null>(null);
  const loadedRef = useRef(false);
  const skipHistoryRef = useRef(false);

  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyTick, setHistoryTick] = useState(0); // to refresh undo/redo enabled state

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { activeColorRef.current = activeColor; }, [activeColor]);
  useEffect(() => { strokeWidthRef.current = strokeWidth; }, [strokeWidth]);

  // -------------- Persistence --------------
  const scheduleSave = useCallback(() => {
    if (!loadedRef.current) return;
    if (!userIdRef.current) return;
    setSaveStatus("saving");
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      const canvas = fabricRef.current;
      if (!canvas || !userIdRef.current) return;
      try {
        const json = canvas.toJSON();
        const { error } = await supabase
          .from("whiteboard_boards")
          .upsert({ user_id: userIdRef.current, data: json as any }, { onConflict: "user_id" });
        if (error) throw error;
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus((s) => (s === "saved" ? "idle" : s)), 1800);
      } catch (e: any) {
        console.error("Whiteboard save error:", e);
        setSaveStatus("idle");
      }
    }, 1200);
  }, []);

  // -------------- History --------------
  const pushHistory = useCallback(() => {
    if (skipHistoryRef.current) return;
    const canvas = fabricRef.current;
    if (!canvas) return;
    const snapshot = JSON.stringify(canvas.toJSON());
    // Drop redo branch
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > HISTORY_LIMIT) {
      historyRef.current.shift();
    }
    historyIndexRef.current = historyRef.current.length - 1;
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [scheduleSave]);

  const loadFromSnapshot = useCallback(async (snapshot: string) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    skipHistoryRef.current = true;
    try {
      await new Promise<void>((resolve) => {
        canvas.loadFromJSON(JSON.parse(snapshot), () => {
          canvas.renderAll();
          resolve();
        });
      });
    } finally {
      skipHistoryRef.current = false;
    }
  }, []);

  const undo = useCallback(async () => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1;
    await loadFromSnapshot(historyRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [loadFromSnapshot, scheduleSave]);

  const redo = useCallback(async () => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1;
    await loadFromSnapshot(historyRef.current[historyIndexRef.current]);
    setHistoryTick((t) => t + 1);
    scheduleSave();
  }, [loadFromSnapshot, scheduleSave]);

  // -------------- Canvas init (once) --------------
  useEffect(() => {
    let cancelled = false;
    let canvas: FabricCanvas | null = null;
    let resizeObs: ResizeObserver | null = null;

    const init = async () => {
      if (!canvasElRef.current || !containerRef.current) return;
      const { Canvas, PencilBrush } = await import("fabric");
      if (cancelled || !canvasElRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      canvas = new Canvas(canvasElRef.current, {
        width: Math.max(rect.width - 32, 600),
        height: Math.max(rect.height - 32, 400),
        backgroundColor: "#ffffff",
        preserveObjectStacking: true,
      });

      canvas.freeDrawingBrush = new PencilBrush(canvas);
      canvas.freeDrawingBrush.color = activeColorRef.current;
      canvas.freeDrawingBrush.width = strokeWidthRef.current;

      fabricRef.current = canvas;

      // History listeners
      const onChange = () => pushHistory();
      canvas.on("path:created", onChange);
      canvas.on("object:added", (e: any) => {
        // Avoid double-pushing on path:created (it also fires object:added)
        if (e?.target?.type === "path") return;
        onChange();
      });
      canvas.on("object:modified", onChange);
      canvas.on("object:removed", onChange);

      // Eraser: remove clicked object
      canvas.on("mouse:down", (opt: any) => {
        const tool = activeToolRef.current;
        if (tool === "eraser" && opt.target) {
          canvas!.remove(opt.target);
          canvas!.requestRenderAll();
          return;
        }
        // Pan via tool or space
        if ((tool === "pan" || spaceDownRef.current) && opt.e) {
          isPanningRef.current = true;
          canvas!.selection = false;
          const evt = opt.e as MouseEvent;
          lastPanRef.current = { x: evt.clientX, y: evt.clientY };
          canvas!.setCursor("grabbing");
        }
      });
      canvas.on("mouse:move", (opt: any) => {
        if (!isPanningRef.current || !lastPanRef.current) return;
        const evt = opt.e as MouseEvent;
        const vpt = canvas!.viewportTransform!;
        vpt[4] += evt.clientX - lastPanRef.current.x;
        vpt[5] += evt.clientY - lastPanRef.current.y;
        canvas!.requestRenderAll();
        lastPanRef.current = { x: evt.clientX, y: evt.clientY };
      });
      canvas.on("mouse:up", () => {
        if (isPanningRef.current) {
          isPanningRef.current = false;
          lastPanRef.current = null;
          canvas!.selection = activeToolRef.current === "select";
          canvas!.setCursor("default");
        }
      });

      // Zoom on wheel
      canvas.on("mouse:wheel", (opt: any) => {
        const e = opt.e as WheelEvent;
        e.preventDefault();
        e.stopPropagation();
        let z = canvas!.getZoom();
        z *= 0.999 ** e.deltaY;
        z = Math.min(Math.max(z, 0.2), 5);
        canvas!.zoomToPoint({ x: e.offsetX, y: e.offsetY } as any, z);
        setZoom(z);
      });

      // Resize observer keeps objects intact
      resizeObs = new ResizeObserver(() => {
        if (!containerRef.current || !canvas) return;
        const r = containerRef.current.getBoundingClientRect();
        canvas.setDimensions({
          width: Math.max(r.width - 32, 600),
          height: Math.max(r.height - 32, 400),
        });
        canvas.requestRenderAll();
      });
      resizeObs.observe(containerRef.current);

      // Load existing board
      const { data: userData } = await supabase.auth.getUser();
      userIdRef.current = userData.user?.id ?? null;

      if (userIdRef.current) {
        const { data, error } = await supabase
          .from("whiteboard_boards")
          .select("data")
          .eq("user_id", userIdRef.current)
          .maybeSingle();
        if (!error && data?.data && Object.keys(data.data).length > 0) {
          skipHistoryRef.current = true;
          await new Promise<void>((resolve) => {
            canvas!.loadFromJSON(data.data as any, () => {
              canvas!.renderAll();
              resolve();
            });
          });
          skipHistoryRef.current = false;
        }
      }

      // Seed initial history
      historyRef.current = [JSON.stringify(canvas.toJSON())];
      historyIndexRef.current = 0;
      loadedRef.current = true;
      setReady(true);
    };

    init();

    return () => {
      cancelled = true;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      resizeObs?.disconnect();
      try { canvas?.dispose(); } catch { /* noop */ }
      fabricRef.current = null;
      loadedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply tool mode to canvas
  useEffect(() => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.isDrawingMode = activeTool === "draw";
    canvas.selection = activeTool === "select";
    canvas.defaultCursor =
      activeTool === "pan" ? "grab" :
      activeTool === "eraser" ? "not-allowed" :
      activeTool === "draw" ? "crosshair" : "default";
    canvas.hoverCursor = activeTool === "select" ? "move" : canvas.defaultCursor;

    // Lock interaction with objects when not selecting
    canvas.forEachObject((o: FabricObject) => {
      const locked = activeTool !== "select";
      o.selectable = !locked;
      o.evented = activeTool === "select" || activeTool === "eraser";
    });

    if (activeTool === "draw" && canvas.freeDrawingBrush) {
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = strokeWidth;
    }
    canvas.requestRenderAll();
  }, [activeTool, activeColor, strokeWidth]);

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const target = e.target as HTMLElement;
      const editing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      const activeObj = canvas.getActiveObject();
      const isEditingText = activeObj && (activeObj as any).isEditing;

      if (e.code === "Space" && !editing && !isEditingText) {
        spaceDownRef.current = true;
        canvas.defaultCursor = "grab";
      }

      if (editing || isEditingText) return;

      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((meta && e.key.toLowerCase() === "y") || (meta && e.shiftKey && e.key.toLowerCase() === "z")) {
        e.preventDefault();
        redo();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        const objs = canvas.getActiveObjects();
        if (objs.length) {
          e.preventDefault();
          objs.forEach((o: FabricObject) => canvas.remove(o));
          canvas.discardActiveObject();
          canvas.requestRenderAll();
        }
      } else if (meta && e.key.toLowerCase() === "a") {
        e.preventDefault();
        canvas.discardActiveObject();
        // Select all
        import("fabric").then(({ ActiveSelection }) => {
          const all = canvas.getObjects();
          if (!all.length) return;
          const sel = new ActiveSelection(all, { canvas });
          canvas.setActiveObject(sel);
          canvas.requestRenderAll();
        });
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        spaceDownRef.current = false;
        const canvas = fabricRef.current;
        if (canvas) canvas.defaultCursor = activeToolRef.current === "pan" ? "grab" : "default";
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [undo, redo]);

  // Paste & drop images
  useEffect(() => {
    const addImageFromUrl = async (url: string) => {
      const canvas = fabricRef.current;
      if (!canvas) return;
      const { FabricImage } = await import("fabric");
      const img = await FabricImage.fromURL(url, { crossOrigin: "anonymous" } as any);
      const maxDim = 400;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale });
      canvas.add(img);
      canvas.setActiveObject(img);
      canvas.requestRenderAll();
    };

    const onPaste = (e: ClipboardEvent) => {
      if (!fabricRef.current) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of Array.from(items)) {
        if (it.type.startsWith("image/")) {
          const file = it.getAsFile();
          if (file) {
            const reader = new FileReader();
            reader.onload = () => addImageFromUrl(reader.result as string);
            reader.readAsDataURL(file);
            e.preventDefault();
            break;
          }
        }
      }
    };

    const container = containerRef.current;
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const file = files[0];
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = () => addImageFromUrl(reader.result as string);
      reader.readAsDataURL(file);
    };
    const onDragOver = (e: DragEvent) => e.preventDefault();

    window.addEventListener("paste", onPaste);
    container?.addEventListener("drop", onDrop);
    container?.addEventListener("dragover", onDragOver);
    return () => {
      window.removeEventListener("paste", onPaste);
      container?.removeEventListener("drop", onDrop);
      container?.removeEventListener("dragover", onDragOver);
    };
  }, []);

  // -------------- Shape insertion --------------
  const insertShape = async (kind: "rectangle" | "circle" | "text" | "line") => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const { Rect, Circle: FCircle, Textbox, Line } = await import("fabric");
    let shape: FabricObject;
    const cx = (canvas.getWidth() / 2 - 60) / canvas.getZoom();
    const cy = (canvas.getHeight() / 2 - 40) / canvas.getZoom();
    switch (kind) {
      case "rectangle":
        shape = new Rect({ left: cx, top: cy, fill: "transparent", stroke: activeColor, strokeWidth, width: 140, height: 90 });
        break;
      case "circle":
        shape = new FCircle({ left: cx, top: cy, fill: "transparent", stroke: activeColor, strokeWidth, radius: 60 });
        break;
      case "text":
        shape = new Textbox("Edit me", { left: cx, top: cy, fill: activeColor, fontSize: 22, width: 220, editable: true, fontFamily: "Figtree, sans-serif" });
        break;
      case "line":
        shape = new Line([cx, cy + 50, cx + 160, cy + 50], { stroke: activeColor, strokeWidth });
        break;
    }
    canvas.add(shape);
    canvas.setActiveObject(shape);
    canvas.requestRenderAll();
    setActiveTool("select");
    if (kind === "text") {
      setTimeout(() => {
        (shape as any).enterEditing?.();
        (shape as any).selectAll?.();
      }, 50);
    }
  };

  // -------------- Zoom controls --------------
  const applyZoom = (newZoom: number) => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const z = Math.min(Math.max(newZoom, 0.2), 5);
    const center = { x: canvas.getWidth() / 2, y: canvas.getHeight() / 2 } as any;
    canvas.zoomToPoint(center, z);
    setZoom(z);
  };
  const resetView = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    setZoom(1);
  };

  // -------------- Clear / Download --------------
  const handleClear = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    if (!confirm("Clear the entire whiteboard? This cannot be undone with the Clear action, but you can still press Undo.")) return;
    canvas.getObjects().slice().forEach((o: FabricObject) => canvas.remove(o));
    canvas.backgroundColor = "#ffffff";
    canvas.requestRenderAll();
  };

  const handleDownload = () => {
    const canvas = fabricRef.current;
    if (!canvas) return;
    const prevVT = canvas.viewportTransform;
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);
    const dataURL = canvas.toDataURL({ format: "png", quality: 1, multiplier: 2 });
    canvas.setViewportTransform(prevVT!);
    canvas.requestRenderAll();
    const link = document.createElement("a");
    link.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataURL;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleAddImageClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async () => {
        const canvas = fabricRef.current;
        if (!canvas) return;
        const { FabricImage } = await import("fabric");
        const img = await FabricImage.fromURL(reader.result as string);
        const maxDim = 400;
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        img.set({ left: 80, top: 80, scaleX: scale, scaleY: scale });
        canvas.add(img);
        canvas.setActiveObject(img);
        canvas.requestRenderAll();
      };
      reader.readAsDataURL(file);
    };
    input.click();
  };

  const canUndo = historyIndexRef.current > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;
  void historyTick; // referenced for re-render

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border px-4 py-3 bg-background">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-foreground">Whiteboard</h1>
            <div className="text-xs text-muted-foreground flex items-center gap-1.5">
              {saveStatus === "saving" && (<><Loader2 className="h-3 w-3 animate-spin" /> Saving…</>)}
              {saveStatus === "saved" && (<><Check className="h-3 w-3 text-primary" /> Saved</>)}
              {saveStatus === "idle" && ready && <span>Autosaves to your account</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={handleAddImageClick} variant="outline" size="sm">
              <ImageIcon className="h-4 w-4 mr-2" /> Image
            </Button>
            <Button onClick={handleDownload} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" /> Download
            </Button>
            <Button onClick={handleClear} variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-2" /> Clear
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1 p-1.5 bg-muted/50 rounded-lg border">
            <ToolBtn active={activeTool === "select"} onClick={() => setActiveTool("select")} title="Select (V)"><MousePointer className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={activeTool === "pan"} onClick={() => setActiveTool("pan")} title="Pan (hold Space)"><Hand className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={activeTool === "draw"} onClick={() => setActiveTool("draw")} title="Draw"><Pencil className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={activeTool === "eraser"} onClick={() => setActiveTool("eraser")} title="Eraser (click object)"><Eraser className="h-4 w-4" /></ToolBtn>
            <Separator orientation="vertical" className="h-6 mx-1" />
            <ToolBtn active={false} onClick={() => insertShape("rectangle")} title="Rectangle"><Square className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={false} onClick={() => insertShape("circle")} title="Circle"><Circle className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={false} onClick={() => insertShape("text")} title="Text"><Type className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={false} onClick={() => insertShape("line")} title="Line"><Minus className="h-4 w-4" /></ToolBtn>
          </div>

          <div className="flex items-center gap-1.5 p-1.5 bg-muted/50 rounded-lg border">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setActiveColor(c)}
                title={c}
                className={cn(
                  "w-6 h-6 rounded-full border-2 transition-transform",
                  activeColor === c ? "border-foreground scale-110" : "border-transparent hover:scale-105"
                )}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex items-center gap-2 p-1.5 px-3 bg-muted/50 rounded-lg border">
            <span className="text-xs text-muted-foreground">Stroke</span>
            <input
              type="range"
              min={1}
              max={24}
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
              className="w-24 accent-primary"
            />
            <span className="text-xs w-5 text-foreground">{strokeWidth}</span>
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border">
            <ToolBtn active={false} onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)"><Undo2 className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={false} onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)"><Redo2 className="h-4 w-4" /></ToolBtn>
          </div>

          <div className="flex items-center gap-1 p-1 bg-muted/50 rounded-lg border">
            <ToolBtn active={false} onClick={() => applyZoom(zoom * 0.9)} title="Zoom out"><ZoomOut className="h-4 w-4" /></ToolBtn>
            <button
              onClick={resetView}
              className="text-xs px-2 min-w-[3.5rem] text-foreground hover:text-primary"
              title="Reset view"
            >
              {Math.round(zoom * 100)}%
            </button>
            <ToolBtn active={false} onClick={() => applyZoom(zoom * 1.1)} title="Zoom in"><ZoomIn className="h-4 w-4" /></ToolBtn>
            <ToolBtn active={false} onClick={resetView} title="Fit / reset"><Maximize2 className="h-4 w-4" /></ToolBtn>
          </div>
        </div>
      </div>

      {/* Canvas */}
      <div ref={containerRef} className="flex-1 p-4 overflow-hidden bg-muted/20">
        <div className="w-full h-full flex justify-center items-center">
          <div className="border border-border rounded-lg shadow-lg overflow-hidden bg-white">
            <canvas ref={canvasElRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ToolBtn({
  active, onClick, disabled, title, children,
}: {
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "default" : "ghost"}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-8 w-8 p-0"
    >
      {children}
    </Button>
  );
}
