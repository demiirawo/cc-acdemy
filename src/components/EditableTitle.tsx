
import { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface EditableTitleProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
}

export function EditableTitle({ value, onChange, className, placeholder }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTempValue(value);
  }, [value]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSubmit = () => {
    onChange(tempValue.trim() || placeholder || "Untitled");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    } else if (e.key === 'Escape') {
      setTempValue(value);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="relative">
        <Input
          ref={inputRef}
          value={tempValue}
          onChange={(e) => setTempValue(e.target.value)}
          onBlur={handleSubmit}
          onKeyDown={handleKeyDown}
          className={cn(
            "text-4xl font-bold h-auto py-2 px-3 border-2 border-primary/50 focus:border-primary bg-background/50 backdrop-blur-sm text-foreground resize-none overflow-hidden",
            className
          )}
          placeholder={placeholder}
          style={{ fontSize: '36px', lineHeight: '1.2' }}
        />
      </div>
    );
  }

  return (
    <div 
      className={cn(
        "text-4xl font-bold cursor-pointer transition-all duration-200 rounded-md border-2 border-transparent hover:border-muted-foreground/30 hover:bg-muted/20 py-2 px-3 group relative",
        className
      )}
      onClick={() => setIsEditing(true)}
      style={{ fontSize: '36px', lineHeight: '1.2' }}
    >
      <span className="text-foreground">
        {value || placeholder}
      </span>
      <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none bg-gradient-to-r from-primary/5 to-primary/10 rounded-md border border-primary/20" />
    </div>
  );
}
