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
      <Input
        ref={inputRef}
        value={tempValue}
        onChange={(e) => setTempValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={handleKeyDown}
        className={cn("text-4xl font-bold border-2 border-primary rounded-lg p-2 h-auto bg-background focus:border-primary focus:ring-2 focus:ring-primary/20", className)}
        placeholder={placeholder}
      />
    );
  }

  return (
    <h1 
      className={cn("text-4xl font-bold cursor-pointer hover:bg-muted/50 rounded-lg p-2 border-2 border-transparent hover:border-muted transition-all duration-200", className)}
      onClick={() => setIsEditing(true)}
    >
      {value || placeholder}
    </h1>
  );
}