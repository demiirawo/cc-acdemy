import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  /** Returns a PNG data URL, or null if nothing has been drawn. */
  toDataURL: () => string | null;
  clear: () => void;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  height?: number;
  className?: string;
  onChange?: (isEmpty: boolean) => void;
}

/**
 * Lightweight canvas signature pad — no external dependency.
 * Supports mouse and touch input and exports a transparent PNG.
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ height = 180, className, onChange }, ref) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawing = useRef(false);
    const dirty = useRef(false);
    const [empty, setEmpty] = useState(true);

    const getCtx = () => canvasRef.current?.getContext("2d") ?? null;

    // Size the canvas to its container, accounting for device pixel ratio.
    const resize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = rect.height * ratio;
      const ctx = getCtx();
      if (ctx) {
        ctx.scale(ratio, ratio);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "#111827";
      }
    };

    useEffect(() => {
      resize();
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const pos = (e: React.PointerEvent) => {
      const rect = canvasRef.current!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      e.preventDefault();
      const ctx = getCtx();
      if (!ctx) return;
      drawing.current = true;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    };

    const move = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.stroke();
      if (!dirty.current) {
        dirty.current = true;
        setEmpty(false);
        onChange?.(false);
      }
    };

    const end = () => {
      drawing.current = false;
    };

    const clear = () => {
      const canvas = canvasRef.current;
      const ctx = getCtx();
      if (canvas && ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      dirty.current = false;
      setEmpty(true);
      onChange?.(true);
    };

    useImperativeHandle(ref, () => ({
      toDataURL: () => (dirty.current ? canvasRef.current!.toDataURL("image/png") : null),
      clear,
      isEmpty: () => !dirty.current,
    }));

    return (
      <div className={className}>
        <div className="relative rounded-md border border-input bg-background">
          <canvas
            ref={canvasRef}
            style={{ height, touchAction: "none" }}
            className="w-full cursor-crosshair rounded-md"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
          />
          {empty && (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Draw your signature here
            </span>
          )}
        </div>
        <div className="mt-2 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={empty}>
            <Eraser className="mr-1.5 h-3.5 w-3.5" /> Clear
          </Button>
        </div>
      </div>
    );
  }
);

SignaturePad.displayName = "SignaturePad";
