import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Palette } from "lucide-react";

interface ColorPickerProps {
  onColorSelect: (color: string) => void;
  currentColor?: string;
  size?: "sm" | "md" | "lg";
  variant?: "outline" | "default" | "ghost";
}

const predefinedColors = [
  "#000000", "#ffffff", "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#ff00ff", "#00ffff",
  "#800000", "#008000", "#000080", "#808000", "#800080", "#008080", "#c0c0c0", "#808080",
  "#ffc0cb", "#ffd700", "#ff6347", "#40e0d0", "#ee82ee", "#90ee90", "#f0e68c", "#d2b48c",
  "#87ceeb", "#dda0dd", "#98fb98", "#f5deb3", "#cd853f", "#dcdcdc", "#696969", "#2f4f4f"
];

export function ColorPicker({ onColorSelect, currentColor, size = "md", variant = "outline" }: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [customColor, setCustomColor] = useState(currentColor || "#000000");

  const handleColorSelect = (color: string) => {
    onColorSelect(color);
    setIsOpen(false);
  };

  const buttonSize = size === "sm" ? "h-8 w-8 p-0" : size === "lg" ? "h-12 w-12 p-0" : "h-10 w-10 p-0";

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant={variant} size="sm" className={buttonSize} title="Text Color">
          <Palette className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-4 bg-background border border-border shadow-lg z-50">
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-medium mb-2">Predefined Colors</h4>
            <div className="grid grid-cols-8 gap-1">
              {predefinedColors.map((color) => (
                <button
                  key={color}
                  className="w-6 h-6 rounded border border-border hover:scale-110 transition-transform"
                  style={{ backgroundColor: color }}
                  onClick={() => handleColorSelect(color)}
                  title={color}
                />
              ))}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-medium mb-2">Custom Color</h4>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={customColor}
                onChange={(e) => setCustomColor(e.target.value)}
                className="w-12 h-8 rounded border border-border cursor-pointer"
              />
              <Button
                onClick={() => handleColorSelect(customColor)}
                size="sm"
                variant="outline"
                className="flex-1"
              >
                Apply Custom
              </Button>
            </div>
          </div>
          
          <Button
            onClick={() => handleColorSelect("inherit")}
            size="sm"
            variant="ghost"
            className="w-full"
          >
            Remove Color
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}