import { useState, useRef, useEffect } from "react";
import { RealKnowledgeBaseSidebar } from "./RealKnowledgeBaseSidebar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarItem {
  id: string;
  title: string;
  type: 'space' | 'page' | 'folder';
  icon?: any;
  children?: SidebarItem[];
  href?: string;
}

interface ResizableSidebarProps {
  onItemSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreatePage?: () => void;
  onCreateSubPage?: (parentId: string) => void;
  onCreateFolder?: () => void;
  onCreatePageInEditor?: (parentId?: string) => void;
}

export function ResizableSidebar({
  onItemSelect,
  selectedId,
  onCreatePage,
  onCreateSubPage,
  onCreateFolder,
  onCreatePageInEditor
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(320);
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  const minWidth = 240;
  const maxWidth = 600;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = e.clientX;
      if (newWidth >= minWidth && newWidth <= maxWidth) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  };

  return (
    <>
      <div
        ref={sidebarRef}
        className="relative bg-sidebar-background border-r border-sidebar-border"
        style={{ width }}
      >
        <RealKnowledgeBaseSidebar
          onItemSelect={onItemSelect}
          selectedId={selectedId}
          onCreatePage={onCreatePage}
          onCreateSubPage={onCreateSubPage}
          onCreateFolder={onCreateFolder}
          onCreatePageInEditor={onCreatePageInEditor}
        />
        
        {/* Enhanced Resize handle */}
        <div
          ref={resizerRef}
          className="absolute top-0 right-0 w-4 h-full cursor-col-resize bg-transparent hover:bg-primary/10 transition-colors z-10 flex items-center justify-center group"
          onMouseDown={handleMouseDown}
          title="Drag to resize sidebar"
        >
          <div className="w-1 h-16 bg-border/40 rounded group-hover:bg-primary/40 transition-colors" />
        </div>
      </div>
      
      {/* Overlay during resize */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </>
  );
}