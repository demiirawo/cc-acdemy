import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Pencil, 
  Eraser, 
  Trash2, 
  Download, 
  Palette,
  Minus,
  Square,
  Circle
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawingPoint {
  x: number;
  y: number;
}

interface DrawingPath {
  points: DrawingPoint[];
  color: string;
  width: number;
  tool: 'pen' | 'eraser';
}

export function WhiteboardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<DrawingPoint[]>([]);
  const [paths, setPaths] = useState<DrawingPath[]>([]);
  const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
  const [color, setColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', 
    '#800080', '#008000', '#800000', '#000080'
  ];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    // Set canvas styles
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, []);

  useEffect(() => {
    redrawCanvas();
  }, [paths]);

  const redrawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw all paths
    paths.forEach(path => {
      if (path.points.length < 2) return;

      ctx.beginPath();
      ctx.strokeStyle = path.color;
      ctx.lineWidth = path.width;
      ctx.globalCompositeOperation = path.tool === 'eraser' ? 'destination-out' : 'source-over';

      ctx.moveTo(path.points[0].x, path.points[0].y);
      for (let i = 1; i < path.points.length; i++) {
        ctx.lineTo(path.points[i].x, path.points[i].y);
      }
      ctx.stroke();
    });
  };

  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const pos = getMousePos(e);
    setCurrentPath([pos]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const pos = getMousePos(e);
    setCurrentPath(prev => [...prev, pos]);

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = brushSize;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';

    if (currentPath.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPath[currentPath.length - 1].x, currentPath[currentPath.length - 1].y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    }
  };

  const stopDrawing = () => {
    if (!isDrawing) return;
    
    setIsDrawing(false);
    
    if (currentPath.length > 0) {
      setPaths(prev => [...prev, {
        points: currentPath,
        color: color,
        width: brushSize,
        tool: tool
      }]);
    }
    
    setCurrentPath([]);
  };

  const clearCanvas = () => {
    setPaths([]);
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const downloadCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <div className="flex-1 p-6">
      <Card className="h-full flex flex-col">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            Whiteboard
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={downloadCanvas}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearCanvas}
                className="flex items-center gap-2 text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Clear
              </Button>
            </div>
          </CardTitle>
          
          {/* Toolbar */}
          <div className="flex items-center gap-4 pt-4">
            {/* Tools */}
            <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
              <Button
                variant={tool === 'pen' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTool('pen')}
                className="h-8 w-8 p-0"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant={tool === 'eraser' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTool('eraser')}
                className="h-8 w-8 p-0"
              >
                <Eraser className="h-4 w-4" />
              </Button>
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Colors */}
            <div className="flex items-center gap-1">
              <Palette className="h-4 w-4 text-muted-foreground mr-2" />
              {colors.map((c) => (
                <button
                  key={c}
                  className={cn(
                    "w-6 h-6 rounded border-2 transition-all",
                    color === c ? "border-foreground scale-110" : "border-muted-foreground/30"
                  )}
                  style={{ backgroundColor: c }}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Brush Size */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Size:</span>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(parseInt(e.target.value))}
                className="w-20"
              />
              <span className="text-sm text-muted-foreground w-6">{brushSize}</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="flex-1 p-0">
          <canvas
            ref={canvasRef}
            className="w-full h-full bg-white border rounded-lg cursor-crosshair"
            style={{ height: 'calc(100vh - 280px)' }}
            onMouseDown={startDrawing}
            onMouseMove={draw}
            onMouseUp={stopDrawing}
            onMouseLeave={stopDrawing}
          />
        </CardContent>
      </Card>
    </div>
  );
}