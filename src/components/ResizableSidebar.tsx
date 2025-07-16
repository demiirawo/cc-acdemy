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
  const [isCollapsed, setIsCollapsed] = useState(false);
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

  const handleMouseDown = () => {
    setIsResizing(true);
  };

  const toggleSidebar = () => {
    setIsCollapsed(!isCollapsed);
  };

  return (
    <>
      <div
        ref={sidebarRef}
        className={cn(
          "relative bg-sidebar-background border-r border-sidebar-border transition-all duration-300 ease-in-out",
          isCollapsed ? "w-0 overflow-hidden" : ""
        )}
        style={{ width: isCollapsed ? 0 : width }}
      >
        {!isCollapsed && (
          <>
            <RealKnowledgeBaseSidebar
              onItemSelect={onItemSelect}
              selectedId={selectedId}
              onCreatePage={onCreatePage}
              onCreateSubPage={onCreateSubPage}
              onCreateFolder={onCreateFolder}
              onCreatePageInEditor={onCreatePageInEditor}
            />
            
            {/* Resize handle */}
            <div
              ref={resizerRef}
              className="absolute top-0 right-0 w-1 h-full cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors"
              onMouseDown={handleMouseDown}
            />
          </>
        )}
        
        {/* Toggle button */}
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "absolute top-4 -right-8 z-10 h-6 w-6 p-0 rounded-full border bg-background shadow-md hover:bg-muted",
            isCollapsed && "-right-6"
          )}
          onClick={toggleSidebar}
        >
          {isCollapsed ? (
            <ChevronRight className="h-3 w-3" />
          ) : (
            <ChevronLeft className="h-3 w-3" />
          )}
        </Button>
      </div>
      
      {/* Overlay during resize */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize" />
      )}
    </>
  );
}