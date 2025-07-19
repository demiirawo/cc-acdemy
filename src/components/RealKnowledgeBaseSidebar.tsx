
import { useState, useEffect } from "react";
import { Search, Plus, BookOpen, Folder, ChevronRight, ChevronDown, Home, Clock, Tag, Users, Settings, Globe, FolderOpen, FileText, MoreHorizontal, Edit, Copy, Share, Star, Archive, Trash2, Move, ArrowUp, ArrowDown, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  useDraggable,
  useDroppable,
  DragOverEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
}

interface Space {
  id: string;
  name: string;
  description: string | null;
  created_by: string;
  created_at: string;
}

interface Page {
  id: string;
  title: string;
  content: string;
  parent_page_id: string | null;
  space_id: string | null;
  is_public: boolean | null;
  created_by: string;
  created_at: string;
  sort_order: number | null;
}

const navigationItems = [
  {
    id: 'home',
    title: 'Home',
    icon: Home,
    href: '/'
  },
  {
    id: 'recent',
    title: 'Recently Updated',
    icon: Clock,
    href: '/recent'
  },
  {
    id: 'tags',
    title: 'Tags',
    icon: Tag,
    href: '/tags'
  },
  {
    id: 'people',
    title: 'People',
    icon: Users,
    href: '/people'
  },
  {
    id: 'user-management',
    title: 'User Management',
    icon: Users,
    href: '/user-management'
  },
  {
    id: 'whiteboard',
    title: 'Whiteboard',
    icon: () => (
      <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="m7 7 10 10" />
        <path d="m17 7-10 10" />
      </svg>
    ),
    href: '/whiteboard'
  }
];

interface SidebarTreeItemProps {
  item: SidebarItem;
  level: number;
  onSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreateSubPage?: (parentId: string) => void;
  onCreatePageInEditor?: (parentId?: string) => void;
  onDuplicatePage?: (pageId: string) => void;
  onArchivePage?: (pageId: string) => void;
  onCopyLink?: (pageId: string) => void;
  onMovePage?: (pageId: string, newParentId: string | null) => void;
  hierarchyData?: SidebarItem[];
  isDragOverlay?: boolean;
}

// Enhanced Draggable/Droppable SidebarTreeItem component
function DraggableSidebarTreeItem({
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
  isDragOverlay = false
}: SidebarTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const { toast } = useToast();

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ 
    id: item.id,
    data: {
      type: item.type,
      item,
      level
    }
  });

  const {
    setNodeRef: setDroppableRef,
    isOver,
  } = useDroppable({
    id: `droppable-${item.id}`,
    data: {
      type: item.type,
      item,
      accepts: ['page'],
      level
    }
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const handleMovePageUp = async (pageId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      // Get current page and find the previous page to swap with
      const { data: currentPage, error: currentError } = await supabase
        .from('pages')
        .select('sort_order, parent_page_id, space_id')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Find previous page with same parent
      const { data: previousPages, error: prevError } = await supabase
        .from('pages')
        .select('id, sort_order')
        .eq('parent_page_id', currentPage.parent_page_id || null)
        .eq('space_id', currentPage.space_id || null)
        .lt('sort_order', currentPage.sort_order)
        .order('sort_order', { ascending: false })
        .limit(1);

      if (prevError || !previousPages?.length) {
        toast({
          title: "Info",
          description: "Page is already at the top",
        });
        return;
      }

      const previousPage = previousPages[0];
      const tempOrder = currentPage.sort_order;
      
      await supabase.from('pages').update({ sort_order: previousPage.sort_order }).eq('id', pageId);
      await supabase.from('pages').update({ sort_order: tempOrder }).eq('id', previousPage.id);
      
      toast({
        title: "Success",
        description: "Page moved up successfully"
      });
      // Trigger refresh
      window.dispatchEvent(new CustomEvent('pageUpdated'));
    } catch (error) {
      console.error('Error moving page up:', error);
      toast({
        title: "Error",
        description: "Failed to move page up",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };
  
  const handleMovePageDown = async (pageId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      // Get current page and find the next page to swap with
      const { data: currentPage, error: currentError } = await supabase
        .from('pages')
        .select('sort_order, parent_page_id, space_id')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Find next page with same parent
      const { data: nextPages, error: nextError } = await supabase
        .from('pages')
        .select('id, sort_order')
        .eq('parent_page_id', currentPage.parent_page_id || null)
        .eq('space_id', currentPage.space_id || null)
        .gt('sort_order', currentPage.sort_order)
        .order('sort_order', { ascending: true })
        .limit(1);

      if (nextError || !nextPages?.length) {
        toast({
          title: "Info",
          description: "Page is already at the bottom",
        });
        return;
      }

      const nextPage = nextPages[0];
      const tempOrder = currentPage.sort_order;
      
      await supabase.from('pages').update({ sort_order: nextPage.sort_order }).eq('id', pageId);
      await supabase.from('pages').update({ sort_order: tempOrder }).eq('id', nextPage.id);
      
      toast({
        title: "Success",
        description: "Page moved down successfully"
      });
      // Trigger refresh
      window.dispatchEvent(new CustomEvent('pageUpdated'));
    } catch (error) {
      console.error('Error moving page down:', error);
      toast({
        title: "Error",
        description: "Failed to move page down",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMoveToParent = async (pageId: string, newParentId: string | null) => {
    if (isLoading) return;
    setIsLoading(true);
    
    try {
      // Get current page info
      const { data: currentPage, error: currentError } = await supabase
        .from('pages')
        .select('space_id')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Get next sort order for new location
      const { data: maxSortOrderData } = await supabase
        .from('pages')
        .select('sort_order')
        .eq('parent_page_id', newParentId || null)
        .eq('space_id', currentPage.space_id || null)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newSortOrder = (maxSortOrderData?.sort_order || 0) + 1000;

      // Update page with new parent and sort order
      const { error: updateError } = await supabase
        .from('pages')
        .update({ 
          parent_page_id: newParentId,
          sort_order: newSortOrder
        })
        .eq('id', pageId);

      if (updateError) throw updateError;
      
      toast({
        title: "Success",
        description: "Page moved successfully"
      });
      // Trigger refresh
      window.dispatchEvent(new CustomEvent('pageUpdated'));
    } catch (error: any) {
      console.error('Error moving page:', error);
      toast({
        title: "Error", 
        description: error.message || "Failed to move page",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Dropdown menu rendering
  const renderDropdownMenu = () => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity",
            "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {item.type === 'page' && (
          <>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreateSubPage?.(item.id); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add sub-page
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreatePageInEditor?.(item.id); }}>
              <Edit className="h-4 w-4 mr-2" />
              Edit in editor
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onDuplicatePage?.(item.id); }}>
              <Copy className="h-4 w-4 mr-2" />
              Duplicate
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCopyLink?.(item.id); }}>
              <Share className="h-4 w-4 mr-2" />
              Copy link
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMovePageUp(item.id); }} disabled={isLoading}>
              <ArrowUp className="h-4 w-4 mr-2" />
              Move up
            </DropdownMenuItem>
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleMovePageDown(item.id); }} disabled={isLoading}>
              <ArrowDown className="h-4 w-4 mr-2" />
              Move down
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onArchivePage?.(item.id); }}>
              <Archive className="h-4 w-4 mr-2" />
              Archive
            </DropdownMenuItem>
          </>
        )}
        {item.type === 'space' && (
          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onCreatePageInEditor?.(item.id); }}>
            <Plus className="h-4 w-4 mr-2" />
            Add page to space
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // Enhanced drop indicator component
  const DropIndicator = ({ isVisible, position }: { isVisible: boolean; position: 'top' | 'bottom' }) => (
    <div 
      className={cn(
        "absolute left-0 right-0 h-0.5 bg-primary transition-opacity",
        position === 'top' ? 'top-0' : 'bottom-0',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
    />
  );

  // Calculate indentation
  const indentationClass = `ml-${Math.min(level * 4, 16)}`;

  const handleReorderPages = async (activeId: string, overId: string) => {
    try {
      // Find the pages in question
      const activePage = pages.find(p => p.id === activeId);
      const overPage = pages.find(p => p.id === overId);
      
      if (!activePage || !overPage) {
        console.error('Could not find pages for reordering');
        return;
      }

      // Only allow reordering if they're in the same context
      if (activePage.parent_page_id !== overPage.parent_page_id || 
          activePage.space_id !== overPage.space_id) {
        console.log('Pages not in same context, skipping reorder');
        return;
      }

      // Get all sibling pages
      let query = supabase.from('pages').select('*');
      
      if (activePage.parent_page_id) {
        query = query.eq('parent_page_id', activePage.parent_page_id);
      } else {
        query = query.is('parent_page_id', null);
      }
      
      if (activePage.space_id) {
        query = query.eq('space_id', activePage.space_id);
      } else {
        query = query.is('space_id', null);
      }

      const { data: siblings } = await query.order('sort_order', { ascending: true });
      
      if (!siblings || siblings.length < 2) {
        console.log('Not enough siblings for reordering');
        return;
      }

      const activeIndex = siblings.findIndex(p => p.id === activeId);
      const overIndex = siblings.findIndex(p => p.id === overId);
      
      if (activeIndex === -1 || overIndex === -1) {
        console.error('Could not find page indices');
        return;
      }

      // Reorder the array
      const reorderedSiblings = arrayMove(siblings, activeIndex, overIndex);
      
      // Update sort_order for all affected pages
      const updates = reorderedSiblings.map((page, index) => ({
        id: page.id,
        sort_order: (index + 1) * 1000 // Give plenty of space between items
      }));

      // Update in batches for better performance
      for (const update of updates) {
        await supabase
          .from('pages')
          .update({ sort_order: update.sort_order } as any)
          .eq('id', update.id);
      }

      toast({
        title: "Success",
        description: "Pages reordered successfully"
      });

      fetchHierarchyData();
    } catch (error) {
      console.error('Error reordering pages:', error);
      toast({
        title: "Error",
        description: "Failed to reorder pages",
        variant: "destructive"
      });
    }
  };

  const activeItem = activeId ? pages.find(p => p.id === activeId) : null;
  const filteredHierarchy = hierarchyData.filter(item => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.children && item.children.some(child => 
      child.title.toLowerCase().includes(searchQuery.toLowerCase())
    ))
  );

  return (
    <div className="w-full border-r-0 flex flex-col h-full bg-purple-800">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-semibold text-sidebar-foreground">Care Cuddle Academy</h1>
        </div>
        
        {/* Enhanced Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input 
            placeholder="Search..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            className="pl-9 bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50 h-9" 
          />
          
          {/* Enhanced Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar border border-sidebar-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
              <div className="py-2">
                <div className="px-3 py-1 text-xs font-medium text-sidebar-foreground/70 border-b border-sidebar-border">
                  Search Results ({searchResults.length})
                </div>
                {searchResults.map(result => {
                  const Icon = result.type === 'space' ? Folder : FileText;
                  return (
                    <div
                      key={result.id}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-sidebar-accent/50 transition-colors"
                      onClick={() => {
                        onItemSelect(result);
                        setSearchQuery("");
                        setShowSearchResults(false);
                      }}
                    >
                      <Icon className="h-4 w-4 text-sidebar-foreground/70 flex-shrink-0" />
                      <span className="truncate text-sidebar-foreground">{result.title}</span>
                      <span className="text-xs text-sidebar-foreground/50 ml-auto">
                        {result.type}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {showSearchResults && searchResults.length === 0 && searchQuery.trim().length >= 2 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar border border-sidebar-border rounded-md shadow-lg z-50">
              <div className="py-4 px-3 text-sm text-sidebar-foreground/70 text-center">
                No results found for "{searchQuery}"
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="space-y-1">
          {navigationItems.map(item => {
            const Icon = item.icon;
            const isSelected = selectedId === item.id;
            return (
              <div
                key={item.id}
                className={cn(
                  "flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                )}
                onClick={() => handleItemSelect({ ...item, type: 'page' })}
              >
                <Icon className="h-4 w-4 text-sidebar-foreground/70" />
                <span className="text-zinc-50">{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Enhanced Content Tree */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-50">
            Pages
          </h3>
          <div className="flex gap-1">
            {onCreatePage && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" 
                onClick={handleCreatePage} 
                title="Create new page"
              >
                <Plus className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        
        <ScrollArea className="h-full">
          <div className="pb-16">
            {loading ? (
              <div className="space-y-2">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-8 bg-sidebar-accent/20 rounded animate-pulse" />
                ))}
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-1">
                  {filteredHierarchy.length > 0 ? (
                    <SortableContext 
                      items={filteredHierarchy.map(item => item.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      {filteredHierarchy.map(item => (
                        <DraggableSidebarTreeItem 
                          key={item.id} 
                          item={item} 
                          level={0} 
                          onSelect={handleItemSelect} 
                          selectedId={selectedId} 
                          onCreateSubPage={onCreateSubPage} 
                          onCreatePageInEditor={onCreatePageInEditor} 
                          onDuplicatePage={handleDuplicatePage} 
                          onArchivePage={handleArchivePage} 
                          onCopyLink={handleCopyLink} 
                          hierarchyData={hierarchyData} 
                        />
                      ))}
                    </SortableContext>
                  ) : searchQuery ? (
                    <div className="text-center py-8 text-sidebar-foreground/50">
                      <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No results found</p>
                    </div>
                  ) : (
                    <div className="text-center py-8 text-sidebar-foreground/50">
                      <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm mb-3">No content yet</p>
                      {onCreatePage && (
                        <Button variant="outline" size="sm" onClick={handleCreatePage}>
                          <Plus className="h-3 w-3 mr-1" />
                          Create first page
                        </Button>
                      )}
                    </div>
                  )}
                </div>
                
                {/* Enhanced Drag overlay */}
                <DragOverlay>
                  {activeItem ? (
                    <DraggableSidebarTreeItem
                      item={{
                        id: activeItem.id,
                        title: activeItem.title,
                        type: 'page',
                        sort_order: activeItem.sort_order
                      }}
                      level={0}
                      onSelect={handleItemSelect}
                      isDragOverlay={true}
                    />
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button 
          variant="ghost" 
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" 
          onClick={() => handleItemSelect({
            id: 'settings',
            title: 'Settings',
            type: 'page'
          })}
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>
  );
}
