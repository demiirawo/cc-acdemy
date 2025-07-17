import { useRef, useEffect, useState } from "react";
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
  Trash2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Canvas as FabricCanvas, Circle as FabricCircle, Rect as FabricRect, Textbox as FabricTextbox, Line as FabricLine } from "fabric";

export function WhiteboardCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fabricCanvas, setFabricCanvas] = useState<FabricCanvas | null>(null);
  const [activeTool, setActiveTool] = useState<'select' | 'draw' | 'text' | 'rectangle' | 'circle' | 'line'>('select');
  const [activeColor, setActiveColor] = useState('#000000');
  const [brushSize, setBrushSize] = useState(2);

  const colors = [
    '#000000', '#FF0000', '#00FF00', '#0000FF', 
    '#FFFF00', '#FF00FF', '#00FFFF', '#FFA500', 
    '#800080', '#008000', '#800000', '#000080'
  ];

  // Initialize canvas
  useEffect(() => {
    if (!canvasRef.current || fabricCanvas) return;

    let canvas: FabricCanvas | null = null;
    
    try {
      canvas = new FabricCanvas(canvasRef.current, {
        width: 1200,
        height: 700,
        backgroundColor: '#ffffff',
      });

      // Set up drawing brush
      canvas.freeDrawingBrush.color = activeColor;
      canvas.freeDrawingBrush.width = brushSize;

      setFabricCanvas(canvas);
    } catch (error) {
      console.error('Error initializing canvas:', error);
    }

    return () => {
      if (canvas) {
        try {
          canvas.dispose();
        } catch (error) {
          console.error('Error disposing canvas:', error);
        }
      }
      setFabricCanvas(null);
    };
  }, []); // Empty dependency array to run only once

  // Update canvas when tool or color changes
  useEffect(() => {
    if (!fabricCanvas) return;

    fabricCanvas.isDrawingMode = activeTool === 'draw';
    fabricCanvas.selection = activeTool === 'select';
    
    if (activeTool === 'draw' && fabricCanvas.freeDrawingBrush) {
      fabricCanvas.freeDrawingBrush.color = activeColor;
      fabricCanvas.freeDrawingBrush.width = brushSize;
    }
  }, [activeTool, activeColor, brushSize, fabricCanvas]);

  const addShape = (shapeType: 'rectangle' | 'circle' | 'text' | 'line') => {
    if (!fabricCanvas) return;

    let shape;

    switch (shapeType) {
      case 'rectangle':
        shape = new FabricRect({
          left: 100,
          top: 100,
          fill: 'transparent',
          stroke: activeColor,
          strokeWidth: 2,
          width: 100,
          height: 60,
        });
        break;
      case 'circle':
        shape = new FabricCircle({
          left: 100,
          top: 100,
          fill: 'transparent',
          stroke: activeColor,
          strokeWidth: 2,
          radius: 50,
        });
        break;
      case 'text':
        shape = new FabricTextbox('Edit me', {
          left: 100,
          top: 100,
          fill: activeColor,
          fontSize: 20,
          width: 200,
          editable: true,
        });
        break;
      case 'line':
        shape = new FabricLine([100, 100, 200, 100], {
          stroke: activeColor,
          strokeWidth: brushSize,
        });
        break;
      default:
        return;
    }

    fabricCanvas.add(shape);
    fabricCanvas.setActiveObject(shape);
    fabricCanvas.renderAll();

    // Auto-edit text
    if (shapeType === 'text') {
      setTimeout(() => {
        shape.enterEditing();
        shape.selectAll();
      }, 100);
    }
  };

  const handleToolClick = (tool: typeof activeTool) => {
    setActiveTool(tool);

    if (tool !== 'select' && tool !== 'draw') {
      addShape(tool);
    }
  };

  const handleClear = () => {
    if (!fabricCanvas) return;
    
    fabricCanvas.clear();
    fabricCanvas.backgroundColor = '#ffffff';
    fabricCanvas.renderAll();
  };

  const handleDownload = () => {
    if (!fabricCanvas) return;

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
              onClick={() => handleToolClick('line')}
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
                  "w-6 h-6 rounded border-2 cursor-pointer transition-all",
                  activeColor === color ? "border-foreground scale-110" : "border-transparent hover:scale-105"
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