
import { useState, useRef } from "react";
import { ChevronRight, ChevronDown, FolderOpen, Folder, FileText, Plus, MoreHorizontal, ArrowUp, ArrowDown, Move, Edit, Copy, Globe, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useDragDrop } from "@/hooks/useDragDrop";

interface SidebarItem {
  id: string;
  title: string;
  type: 'space' | 'page';
  icon?: any;
  children?: SidebarItem[];
  href?: string;
  is_public?: boolean;
  parent_page_id?: string | null;
  space_id?: string | null;
  sort_order?: number;
  version?: number;
}

interface EnhancedSidebarTreeItemProps {
  item: SidebarItem;
  level: number;
  onSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreateSubPage?: (parentId: string) => void;
  onCreatePageInEditor?: (parentId?: string) => void;
  onDuplicatePage?: (pageId: string) => void;
  onArchivePage?: (pageId: string) => void;
  onCopyLink?: (pageId: string) => void;
  onMovePage?: (pageId: string, newParentId: string | null) => Promise<{ success: boolean }>;
  hierarchyData?: SidebarItem[];
  onRefreshData?: () => void;
  siblings?: SidebarItem[];
  onMovePageUpDown?: (pageId: string, direction: 'up' | 'down', version: number) => Promise<any>;
}

export function EnhancedSidebarTreeItem({
  item,
  level,
  onSelect,
  selectedId,
  onCreateSubPage,
  onCreatePageInEditor,
  onDuplicatePage,
  onArchivePage,
  onCopyLink,
  onMovePage,
  hierarchyData,
  onRefreshData,
  siblings = [],
  onMovePageUpDown
}: EnhancedSidebarTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isMoving, setIsMoving] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  
  // Check if this page can be moved up or down
  const currentIndex = siblings.findIndex(sibling => sibling.id === item.id);
  const canMoveUp = currentIndex > 0;
  const canMoveDown = currentIndex < siblings.length - 1;

  // Drag and drop functionality
  const handleItemMove = async (itemId: string, newParentId: string | null, targetIndex: number) => {
    if (!onMovePage) return { success: false };
    
    // If moving to the same parent, we should use the up/down movement functions
    // for proper reordering based on the target index
    const draggedItem = hierarchyData?.find(item => findItemById(item, itemId));
    const targetItem = hierarchyData?.find(item => findItemById(item, newParentId || ''));
    
    // For now, just handle parent changes
    if (draggedItem && draggedItem.parent_page_id !== newParentId) {
      return await onMovePage(itemId, newParentId);
    }
    
    return { success: false };
  };

  // Helper function to find item by ID in hierarchy
  const findItemById = (item: SidebarItem, id: string): SidebarItem | null => {
    if (item.id === id) return item;
    if (item.children) {
      for (const child of item.children) {
        const found = findItemById(child, id);
        if (found) return found;
      }
    }
    return null;
  };

  const {
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDropIndicatorClass,
    isDragging,
    draggedItem
  } = useDragDrop(handleItemMove);

  const handleMovePageUp = async () => {
    if (!canMoveUp || isMoving || !onMovePageUpDown) return;
    
    console.log('Moving page up:', { pageId: item.id, version: item.version, currentIndex, canMoveUp });
    setIsMoving(true);
    try {
      const result = await onMovePageUpDown(item.id, 'up', item.version || 1);
      console.log('Move up result:', result);
      
      // Update local version if provided to prevent stale state
      if (result?.success && result.new_version) {
        item.version = result.new_version;
      }
      
      // Always refresh data after attempt (success or failure for latest state)
      onRefreshData?.();
    } catch (error) {
      console.error('Error moving page up:', error);
    } finally {
      setIsMoving(false);
    }
  };
  
  const handleMovePageDown = async () => {
    if (!canMoveDown || isMoving || !onMovePageUpDown) return;
    
    console.log('Moving page down:', { pageId: item.id, version: item.version, currentIndex, canMoveDown });
    setIsMoving(true);
    try {
      const result = await onMovePageUpDown(item.id, 'down', item.version || 1);
      console.log('Move down result:', result);
      
      // Update local version if provided to prevent stale state
      if (result?.success && result.new_version) {
        item.version = result.new_version;
      }
      
      // Always refresh data after attempt (success or failure for latest state)
      onRefreshData?.();
    } catch (error) {
      console.error('Error moving page down:', error);
    } finally {
      setIsMoving(false);
    }
  };

  return (
    <div>
      <div
        ref={itemRef}
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-all duration-200 group relative",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          level > 0 && "ml-2",
          isMoving && "opacity-50",
          getDropIndicatorClass(item.id)
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(item)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        draggable={item.type === 'page'}
        onDragStart={(e) => handleDragStart({
          id: item.id,
          type: item.type,
          title: item.title,
          parent_page_id: item.parent_page_id,
          space_id: item.space_id,
          version: item.version
        }, e)}
        onDragEnd={handleDragEnd}
        onDragOver={(e) => handleDragOver(e, {
          id: item.id,
          type: item.type,
          title: item.title,
          parent_page_id: item.parent_page_id,
          space_id: item.space_id,
          version: item.version
        })}
        onDragLeave={handleDragLeave}
        onDrop={(e) => handleDrop(e, {
          id: item.id,
          type: item.type,
          title: item.title,
          parent_page_id: item.parent_page_id,
          space_id: item.space_id,
          version: item.version
        })}
      >
        {/* Expand/Collapse Button */}
        {hasChildren && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 hover:bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
          </Button>
        )}
        {!hasChildren && <div className="w-4" />}
        
        {/* Icon */}
        {item.type === 'space' || hasChildren || (!item.parent_page_id && item.type === 'page') ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-pink-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-pink-500 flex-shrink-0" />
          )
        ) : (
          <FileText className="h-4 w-4 text-white flex-shrink-0" />
        )}
        
        {/* Title */}
        <span className="truncate flex-1 text-neutral-50 font-medium">{item.title}</span>
        
        {/* Drag indicator */}
        {draggedItem?.id === item.id && (
          <div className="absolute inset-0 bg-primary/20 border border-primary rounded-md pointer-events-none" />
        )}
        
        {/* Action buttons - show on hover */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-200",
          isHovered || isSelected ? "opacity-100" : "opacity-0"
        )}>
          {/* Add child page button */}
          {(item.type === 'space' || item.type === 'page') && onCreatePageInEditor && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0 hover:bg-sidebar-accent/50"
              onClick={(e) => {
                e.stopPropagation();
                onCreatePageInEditor(item.id);
              }}
              title="Add child page"
            >
              <Plus className="h-3 w-3" />
            </Button>
          )}
          
          {/* Move page buttons for reordering pages */}
          {item.type === 'page' && onMovePageUpDown && (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-6 p-0 hover:bg-sidebar-accent/50",
                  !canMoveUp && "opacity-30 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMovePageUp();
                }}
                disabled={!canMoveUp || isMoving}
                title={canMoveUp ? "Move up" : "Already at top"}
              >
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "h-6 w-6 p-0 hover:bg-sidebar-accent/50",
                  !canMoveDown && "opacity-30 cursor-not-allowed"
                )}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMovePageDown();
                }}
                disabled={!canMoveDown || isMoving}
                title={canMoveDown ? "Move down" : "Already at bottom"}
              >
                <ArrowDown className="h-3 w-3" />
              </Button>
            </div>
          )}
          
          {/* Context menu for pages */}
          {item.type === 'page' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 hover:bg-sidebar-accent/50"
                  onClick={(e) => e.stopPropagation()}
                >
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onSelect(item)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopyLink?.(item.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy public link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onDuplicatePage?.(item.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive" 
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete this page? This action cannot be undone.")) {
                      // Handle delete - would need to be passed as prop
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
      
      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {item.children?.map((child, index) => (
            <EnhancedSidebarTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onCreateSubPage={onCreateSubPage}
              onCreatePageInEditor={onCreatePageInEditor}
              onDuplicatePage={onDuplicatePage}
              onArchivePage={onArchivePage}
              onCopyLink={onCopyLink}
              onMovePage={onMovePage}
              hierarchyData={hierarchyData}
              onRefreshData={onRefreshData}
              siblings={item.children || []}
              onMovePageUpDown={onMovePageUpDown}
            />
          ))}
        </div>
      )}
    </div>
  );
}
