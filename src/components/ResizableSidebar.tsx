import { useState, useRef, useEffect } from "react";
import { RealKnowledgeBaseSidebar } from "./RealKnowledgeBaseSidebar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Menu } from "lucide-react";
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
  onCreatePageInEditor?: (parentId?: string) => void;
  onMovePage?: (pageId: string) => void;
}

export function ResizableSidebar({
  onItemSelect,
  selectedId,
  onCreatePage,
  onCreateSubPage,
  onCreatePageInEditor,
  onMovePage
}: ResizableSidebarProps) {
  const [width, setWidth] = useState(400);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizerRef = useRef<HTMLDivElement>(null);

  const minWidth = 240;
  const maxWidth = 600;
  const collapsedWidth = 0;

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
    if (isCollapsed) return;
    e.preventDefault();
    setIsResizing(true);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const currentWidth = isCollapsed ? collapsedWidth : width;

  return (
    <>
      <div
        ref={sidebarRef}
        className={cn(
          "relative bg-sidebar-background transition-all duration-300",
          isCollapsed ? "w-0 border-r-0" : "border-r border-sidebar-border",
          "flex-shrink-0"
        )}
        style={{ width: currentWidth }}
      >
        {!isCollapsed && (
          <>
            <RealKnowledgeBaseSidebar
              onItemSelect={onItemSelect}
              selectedId={selectedId}
              onCreatePage={onCreatePage}
              onCreateSubPage={onCreateSubPage}
              onCreatePageInEditor={onCreatePageInEditor}
              onMovePage={onMovePage}
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
            
            {/* Collapse button when expanded - positioned in top right of sidebar */}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleCollapse}
              className="absolute top-3 right-8 z-20 h-7 w-7 p-0 opacity-70 hover:opacity-100 bg-sidebar-background hover:bg-sidebar-accent text-white"
              title="Collapse sidebar"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
          </>
        )}
        
        {/* Overlay during resize */}
        {isResizing && (
          <div className="fixed inset-0 z-50 cursor-col-resize bg-black/5" />
        )}
      </div>
      
      {/* Floating expand button when collapsed - positioned at the edge */}
      {isCollapsed && (
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            onClick={toggleCollapse}
            className="absolute top-4 left-2 z-50 h-8 w-8 p-0 shadow-lg bg-background hover:bg-accent"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </>
  );
}