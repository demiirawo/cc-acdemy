import { useRef, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Pencil, 
  Eraser, 
  Trash2, 
  Download, 
  Square,
  Circle,
  Type,
  MousePointer,
  Minus
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Canvas as FabricCanvas, Circle as FabricCircle, Rect as FabricRect, Textbox as FabricTextbox, Line as FabricLine } from "fabric";
import { useToast } from "@/hooks/use-toast";

export function WhiteboardPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'text' | 'rectangle' | 'circle' | 'line'>('select');
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);
  const [isDrawing, setIsDrawing] = useState(false);
  const [startPoint, setStartPoint] = useState<{x: number, y: number} | null>(null);
  const { toast } = useToast();

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', 
    '#800080', '#008000', '#800000', '#000080'
  ];

  useEffect(() => {
    if (!canvasRef.current) return;

    try {
      const canvas = new FabricCanvas(canvasRef.current, {
        width: 1200,
        height: 700,
        backgroundColor: "#ffffff",
      });

      // Initialize the freeDrawingBrush properly
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = brushSize;

      // Add line drawing functionality
      let isDrawingLine = false;
      let line: FabricLine | null = null;
      let origX = 0;
      let origY = 0;

      canvas.on('mouse:down', function(opt) {
        if (activeTool === 'line') {
          isDrawingLine = true;
          const pointer = canvas.getScenePoint(opt.e);
          origX = pointer.x;
          origY = pointer.y;
          
          line = new FabricLine([origX, origY, origX, origY], {
            stroke: activeColor,
            strokeWidth: brushSize,
            selectable: false,
          });
          canvas.add(line);
        }
      });

      canvas.on('mouse:move', function(opt) {
        if (!isDrawingLine || !line || activeTool !== 'line') return;
        
        const pointer = canvas.getScenePoint(opt.e);
        line.set({
          x2: pointer.x,
          y2: pointer.y
        });
        canvas.renderAll();
      });

      canvas.on('mouse:up', function() {
        if (isDrawingLine && line) {
          isDrawingLine = false;
          line.selectable = true;
          canvas.setActiveObject(line);
          line = null;
        }
      });

      setFabricCanvas(canvas);
      
      toast({
        title: "Whiteboard ready!",
        description: "Start drawing or adding shapes",
      });

      return () => {
        try {
          canvas.dispose();
        } catch (error) {
          console.error('Error disposing canvas:', error);
        }
      };
    } catch (error) {
      console.error('Error initializing canvas:', error);
      toast({
        title: "Error",
        description: "Failed to initialize whiteboard",
        variant: "destructive",
      });
    }
  }, []); // Remove dependencies to prevent re-initialization

  useEffect(() => {
    if (!fabricCanvas) return;

    try {
      fabricCanvas.isDrawingMode = activeTool === 'draw';
      fabricCanvas.selection = activeTool === 'select';
      
      if (activeTool === 'draw' && fabricCanvas.freeDrawingBrush) {
        fabricCanvas.freeDrawingBrush.color = activeColor;
        fabricCanvas.freeDrawingBrush.width = brushSize;
      }
    } catch (error) {
      console.error('Error updating canvas mode:', error);
    }
  }, [activeTool, activeColor, brushSize, fabricCanvas]);

  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (!fabricCanvas) return;

    try {
      if (tool === 'rectangle') {
        const rect = new FabricRect({
          left: 100,
          top: 100,
          fill: 'transparent',
          width: 100,
          height: 60,
          stroke: activeColor,
          strokeWidth: 2,
        });
        fabricCanvas.add(rect);
        fabricCanvas.setActiveObject(rect);
        fabricCanvas.renderAll();
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
        fabricCanvas.renderAll();
      } else if (tool === 'text') {
        const text = new FabricTextbox('Edit me', {
          left: 100,
          top: 100,
          fill: activeColor,
          fontSize: 20,
          fontFamily: 'Arial',
          editable: true,
          width: 200,
        });
        fabricCanvas.add(text);
        fabricCanvas.setActiveObject(text);
        fabricCanvas.renderAll();
        
        // Automatically enter editing mode
        setTimeout(() => {
          text.enterEditing();
          text.selectAll();
        }, 100);
      }
    } catch (error) {
      console.error('Error adding shape:', error);
      toast({
        title: "Error",
        description: "Failed to add shape",
        variant: "destructive",
      });
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;

    try {
      fabricCanvas.clear();
      fabricCanvas.backgroundColor = "#ffffff";
      fabricCanvas.renderAll();
      
      toast({
        title: "Canvas cleared",
        description: "All content has been removed",
      });
    } catch (error) {
      console.error('Error clearing canvas:', error);
    }
  };

  const handleDownload = () => {
    if (!fabricCanvas) return;

    try {
      const dataURL = fabricCanvas.toDataURL({
        format: 'png',
        quality: 0.8,
        multiplier: 1
      });
      
      const link = document.createElement('a');
      link.download = 'whiteboard.png';
      link.href = dataURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Downloaded",
        description: "Whiteboard saved as PNG",
      });
    } catch (error) {
      console.error('Error downloading canvas:', error);
      toast({
        title: "Error",
        description: "Failed to download whiteboard",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-foreground">Whiteboard</h1>
          <div className="flex items-center gap-2">
            <Button onClick={handleDownload} variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button onClick={handleClear} variant="outline" size="sm">
              <Trash2 className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-4">
          {/* Tools */}
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
            <Button
              variant={activeTool === 'select' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTool('select')}
              className="h-8 w-8 p-0"
            >
              <MousePointer className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'draw' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTool('draw')}
              className="h-8 w-8 p-0"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <Button
              variant={activeTool === 'rectangle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('rectangle')}
              className="h-8 w-8 p-0"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'circle' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('circle')}
              className="h-8 w-8 p-0"
            >
              <Circle className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'text' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleToolClick('text')}
              className="h-8 w-8 p-0"
            >
              <Type className="h-4 w-4" />
            </Button>
            <Button
              variant={activeTool === 'line' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setActiveTool('line')}
              className="h-8 w-8 p-0"
            >
              <Minus className="h-4 w-4" />
            </Button>
          </div>

          {/* Colors */}
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
            {colors.map((color) => (
              <button
                key={color}
                onClick={() => setActiveColor(color)}
                className={cn(
                  "w-6 h-6 rounded border-2 cursor-pointer",
                  activeColor === color ? "border-foreground scale-110" : "border-transparent"
                )}
                style={{ backgroundColor: color }}
              />
            ))}
          </div>

          {/* Brush Size */}
          {activeTool === 'draw' && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border">
              <span className="text-sm">Size:</span>
              <input
                type="range"
                min="1"
                max="20"
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                className="w-20"
              />
              <span className="text-sm w-6">{brushSize}</span>
            </div>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 p-4 overflow-auto">
        <div className="flex justify-center">
          <div className="border border-border rounded-lg shadow-lg overflow-hidden bg-white">
            <canvas ref={canvasRef} />
          </div>
        </div>
      </div>
    </div>
  );
}