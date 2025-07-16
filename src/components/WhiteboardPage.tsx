import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { 
  Pencil, 
  Eraser, 
  Trash2, 
  Download, 
  Palette,
  Square,
  Circle,
  Type,
  MousePointer,
  Minus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Canvas as FabricCanvas, Circle as FabricCircle, Rect as FabricRect, Textbox as FabricTextbox } from "fabric";

export function WhiteboardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'eraser' | 'text' | 'rectangle' | 'circle' | 'line'>('select');
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);
  const [textToAdd, setTextToAdd] = useState('');

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', 
    '#800080', '#008000', '#800000', '#000080'
  ];

  useEffect(() => {
    if (!canvasRef.current || fabricCanvas) return;

    const canvas = new FabricCanvas(canvasRef.current, {
      width: 1200,
      height: 700,
      backgroundColor: "#ffffff",
    });

    // Initialize the freeDrawingBrush
    canvas.freeDrawingBrush.color = activeColor;
    canvas.freeDrawingBrush.width = brushSize;

    setFabricCanvas(canvas);

    return () => {
      if (canvas) {
        canvas.dispose();
        setFabricCanvas(null);
      }
    };
  }, [canvasRef.current]);

  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === 'draw';
    
    if (activeTool === 'draw' && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = brushSize;
    }
  }, [activeTool, activeColor, brushSize, fabricCanvas]);

  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (!fabricCanvas) return;

    if (tool === 'rectangle') {
      const rect = new FabricRect({
        left: 100,
        top: 100,
        fill: activeColor,
        width: 100,
        height: 60,
        stroke: activeColor,
        strokeWidth: 2,
      });
      fabricCanvas.add(rect);
      fabricCanvas.setActiveObject(rect);
    } else if (tool === 'circle') {
      const circle = new FabricCircle({
        left: 100,
        top: 100,
        fill: 'transparent',
        radius: 50,
        stroke: activeColor,
        strokeWidth: 2,
      });
      fabricCanvas.add(circle);
      fabricCanvas.setActiveObject(circle);
    } else if (tool === 'text') {
      const text = new FabricTextbox(textToAdd || 'Double click to edit', {
        left: 100,
        top: 100,
        fill: activeColor,
        fontSize: 20,
        fontFamily: 'Arial',
        width: 200,
      });
      fabricCanvas.add(text);
      fabricCanvas.setActiveObject(text);
      text.enterEditing();
    }
  };

  const clearCanvas = () => {
    if (!fabricCanvas) return;
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = "#ffffff";
    fabricCanvas.renderAll();
  };

  const downloadCanvas = () => {
    if (!fabricCanvas) return;
    const link = document.createElement('a');
    link.download = 'whiteboard.png';
    link.href = fabricCanvas.toDataURL();
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
              variant={activeTool === 'select' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTool('select')}
              className="h-8 w-8 p-0"
              title="Select"
            >
              <MousePointer className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'draw' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTool('draw')}
              className="h-8 w-8 p-0"
              title="Draw"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'text' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('text')}
              className="h-8 w-8 p-0"
              title="Add Text"
            >
              <Type className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'rectangle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('rectangle')}
              className="h-8 w-8 p-0"
              title="Rectangle"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'circle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('circle')}
              className="h-8 w-8 p-0"
              title="Circle"
            >
              <Circle className="h-4 w-4" />
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
                  activeColor === c ? "border-foreground scale-110" : "border-muted-foreground/30"
                )}
                style={{ backgroundColor: c }}
                onClick={() => setActiveColor(c)}
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
          {/* Text Input for Text Tool */}
          {activeTool === 'text' && (
            <>
              <Separator orientation="vertical" className="h-6" />
              <Input
                placeholder="Enter text to add"
                value={textToAdd}
                onChange={(e) => setTextToAdd(e.target.value)}
                className="w-40"
              />
            </>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="flex-1 p-0">
        <div className="w-full h-full bg-white border rounded-lg overflow-hidden">
          <canvas
            ref={canvasRef}
            className="w-full h-full"
          />
        </div>
        </CardContent>
      </Card>
    </div>
  );
}