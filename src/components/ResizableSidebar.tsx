import { useState, useRef, useEffect } from "react";
import { RealKnowledgeBaseSidebar } from "./RealKnowledgeBaseSidebar";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
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
  /** Controlled open state for the mobile drawer */
  mobileOpen?: boolean;
  /** Called when the mobile drawer should close */
  onMobileClose?: () => void;
}

export function ResizableSidebar({
  onItemSelect,
  selectedId,
  onCreatePage,
  onCreateSubPage,
  onCreatePageInEditor,
  onMovePage,
  mobileOpen = false,
  onMobileClose,
}: ResizableSidebarProps) {
  const [desktopWidth, setDesktopWidth] = useState(280);
  const [isResizing, setIsResizing] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    const { pathname, search } = window.location;
    const params = new URLSearchParams(search);
    const tab = (params.get("tab") || "").toLowerCase();
    return pathname.startsWith("/view/hr") && (tab === "payroll" || tab === "pay");
  });
  const sidebarRef = useRef<HTMLDivElement>(null);

  const minWidth = 240;
  const maxWidth = 600;

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const newWidth = Math.min(maxWidth, Math.max(minWidth, e.clientX));
      setDesktopWidth(newWidth);
    };
    const handleMouseUp = () => {
      setIsResizing(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
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
    };
  }, [isResizing]);

  const startResizing = (e: React.MouseEvent) => {
    if (isCollapsed) return;
    e.preventDefault();
    setIsResizing(true);
  };

  const handleItemSelectAndClose = (item: SidebarItem) => {
    onItemSelect(item);
    // Close the mobile drawer after navigating
    onMobileClose?.();
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-sidebar-background relative">
      {/* Mobile close button — only shown inside the mobile drawer */}
      <div className="flex h-14 items-center justify-end px-4 lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-white/10"
          onClick={onMobileClose}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Sidebar tree */}
      <div className="flex-1 overflow-hidden">
        <RealKnowledgeBaseSidebar
          onItemSelect={handleItemSelectAndClose}
          selectedId={selectedId}
          onCreatePage={onCreatePage}
          onCreateSubPage={onCreateSubPage}
          onCreatePageInEditor={onCreatePageInEditor}
          onMovePage={onMovePage}
        />
      </div>

      {/* Desktop collapse toggle */}
      <div className="hidden lg:flex justify-end px-4 py-2">
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="flex items-center justify-center p-1 text-white hover:bg-white/10 rounded-lg transition-colors"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed
            ? <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            : <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />}
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* ── Mobile overlay backdrop ─────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm lg:hidden"
          onClick={onMobileClose}
        />
      )}

      {/* ── Mobile drawer (fixed, slides in from left) ──────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out",
          "lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {sidebarContent}
      </aside>

      {/* ── Desktop sidebar (static, resizable, collapsible) ────────── */}
      <div
        ref={sidebarRef}
        className={cn(
          "relative hidden lg:flex flex-col bg-sidebar-background transition-all duration-300 flex-shrink-0",
          isCollapsed ? "w-0 overflow-hidden border-r-0" : "border-r border-sidebar-border"
        )}
        style={{ width: isCollapsed ? 0 : desktopWidth }}
      >
        {!isCollapsed && (
          <>
            {sidebarContent}

            {/* Resize handle */}
            <div
              className="absolute top-0 right-0 w-4 h-full cursor-col-resize bg-transparent hover:bg-white/10 transition-colors z-10 flex items-center justify-center group"
              onMouseDown={startResizing}
              title="Drag to resize"
            >
              <div className="w-0.5 h-16 bg-white/20 rounded group-hover:bg-white/40 transition-colors" />
            </div>
          </>
        )}
      </div>

      {/* Desktop expand button when collapsed */}
      {isCollapsed && (
        <div className="hidden lg:flex items-start pt-4 pl-2 flex-shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCollapsed(false)}
            className="h-8 w-8 p-0 shadow-md bg-background hover:bg-accent"
            title="Expand sidebar"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Resize overlay (prevents text selection while dragging) */}
      {isResizing && (
        <div className="fixed inset-0 z-50 cursor-col-resize bg-black/5" />
      )}
    </>
  );
}
