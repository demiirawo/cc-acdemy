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
  version?: number;
}

interface HierarchyNode extends SidebarItem {
  children: HierarchyNode[];
  sort_order: number;
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
        .select('sort_order, parent_page_id, space_id, version')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Find previous page with same parent
      const { data: previousPages, error: prevError } = await supabase
        .from('pages')
        .select('id, sort_order, version')
        .eq('parent_page_id', currentPage.parent_page_id)
        .eq('space_id', currentPage.space_id)
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
        .select('sort_order, parent_page_id, space_id, version')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Find next page with same parent
      const { data: nextPages, error: nextError } = await supabase
        .from('pages')
        .select('id, sort_order, version')
        .eq('parent_page_id', currentPage.parent_page_id)
        .eq('space_id', currentPage.space_id)
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
        .select('space_id, version')
        .eq('id', pageId)
        .single();

      if (currentError) throw currentError;

      // Get next sort order for new location
      const { data: maxSortOrderData } = await supabase
        .from('pages')
        .select('sort_order')
        .eq('parent_page_id', newParentId)
        .eq('space_id', currentPage.space_id)
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
  const indentationStyle = { paddingLeft: `${level * 12 + 8}px` };

  return (
    <div
      ref={setNodeRef}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={cn(
        "group relative transition-colors",
        isSelected && "bg-sidebar-accent/50",
        isOver && "bg-sidebar-accent/30",
        isDragging && "opacity-50"
      )}
    >
      <DropIndicator isVisible={isOver} position="top" />
      
      <div
        className={cn(
          "flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-sidebar-accent/50 transition-colors",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground"
        )}
        style={indentationStyle}
        onClick={() => onSelect(item)}
        {...attributes}
      >
        {/* Drag handle */}
        <div 
          {...listeners}
          className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing transition-opacity"
        >
          <GripVertical className="h-3 w-3 text-sidebar-foreground/50" />
        </div>

        {/* Expand/collapse for pages with children */}
        {hasChildren ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
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
        ) : (
          <div className="w-4" />
        )}

        {/* Icon */}
        <div className="flex-shrink-0">
          {item.type === 'space' ? (
            <Folder className="h-4 w-4 text-sidebar-foreground/70" />
          ) : (
            <FileText className="h-4 w-4 text-sidebar-foreground/70" />
          )}
        </div>

        {/* Title */}
        <span className="flex-1 text-sm text-sidebar-foreground truncate">
          {item.title}
        </span>

        {/* Public indicator */}
        {item.is_public && (
          <Globe className="h-3 w-3 text-sidebar-foreground/50" />
        )}

        {/* More options */}
        {renderDropdownMenu()}
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {item.children?.map((child) => (
            <DraggableSidebarTreeItem
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
            />
          ))}
        </div>
      )}

      <DropIndicator isVisible={isOver} position="bottom" />
    </div>
  );
}

interface RealKnowledgeBaseSidebarProps {
  onItemSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreatePage?: () => void;
  onCreateSubPage?: (parentId: string) => void;
  onCreatePageInEditor?: (parentId?: string) => void;
}

export function RealKnowledgeBaseSidebar({
  onItemSelect,
  selectedId,
  onCreatePage,
  onCreateSubPage,
  onCreatePageInEditor
}: RealKnowledgeBaseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarItem[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [hierarchyData, setHierarchyData] = useState<HierarchyNode[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const buildHierarchy = (pages: Page[], spaces: Space[]): HierarchyNode[] => {
    const pageMap = new Map<string, HierarchyNode>();
    const spaceMap = new Map<string, HierarchyNode>();
    
    // Create space nodes
    spaces.forEach(space => {
      const spaceNode: HierarchyNode = {
        id: space.id,
        title: space.name,
        type: 'space',
        children: [],
        sort_order: 0,
        space_id: space.id
      };
      spaceMap.set(space.id, spaceNode);
    });

    // Create page nodes
    pages.forEach(page => {
      const pageNode: HierarchyNode = {
        id: page.id,
        title: page.title,
        type: 'page',
        children: [],
        is_public: page.is_public || false,
        parent_page_id: page.parent_page_id,
        space_id: page.space_id,
        sort_order: page.sort_order || 0
      };
      pageMap.set(page.id, pageNode);
    });

    // Build hierarchy
    const rootNodes: HierarchyNode[] = [];

    // Add pages to their parents or spaces
    pages.forEach(page => {
      const pageNode = pageMap.get(page.id);
      if (!pageNode) return;

      if (page.parent_page_id) {
        // Add to parent page
        const parentNode = pageMap.get(page.parent_page_id);
        if (parentNode) {
          parentNode.children.push(pageNode);
        }
      } else if (page.space_id) {
        // Add to space
        const spaceNode = spaceMap.get(page.space_id);
        if (spaceNode) {
          spaceNode.children.push(pageNode);
        }
      } else {
        // Root level page
        rootNodes.push(pageNode);
      }
    });

    // Add spaces to root
    spaces.forEach(space => {
      const spaceNode = spaceMap.get(space.id);
      if (spaceNode) {
        rootNodes.push(spaceNode);
      }
    });

    // Sort children by sort_order
    const sortChildren = (nodes: HierarchyNode[]) => {
      nodes.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      nodes.forEach(node => sortChildren(node.children));
    };

    sortChildren(rootNodes);

    return rootNodes;
  };

  const fetchHierarchyData = async () => {
    try {
      setLoading(true);
      
      // Fetch spaces
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('*')
        .order('created_at', { ascending: true });

      if (spacesError) throw spacesError;

      // Fetch pages with sort_order
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('id, title, content, parent_page_id, space_id, is_public, created_by, created_at, sort_order, version')
        .order('sort_order', { ascending: true });

      if (pagesError) throw pagesError;

      setSpaces(spacesData || []);
      setPages(pagesData || []);
      
      const hierarchy = buildHierarchy(pagesData || [], spacesData || []);
      setHierarchyData(hierarchy);
    } catch (error) {
      console.error('Error fetching hierarchy data:', error);
      toast({
        title: "Error",
        description: "Failed to load content",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHierarchyData();

    const handlePageUpdate = () => {
      fetchHierarchyData();
    };

    window.addEventListener('pageUpdated', handlePageUpdate);
    return () => window.removeEventListener('pageUpdated', handlePageUpdate);
  }, []);

  const performSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('pages')
        .select('id, title, content, is_public, parent_page_id, space_id')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
        .limit(10);

      if (error) throw error;

      const results: SidebarItem[] = (data || []).map(page => ({
        id: page.id,
        title: page.title,
        type: 'page' as const,
        is_public: page.is_public || false,
        parent_page_id: page.parent_page_id,
        space_id: page.space_id
      }));

      setSearchResults(results);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    performSearch(value);
  };

  const handleItemSelect = (item: SidebarItem) => {
    onItemSelect(item);
    if (searchQuery) {
      setSearchQuery("");
      setShowSearchResults(false);
    }
  };

  const handleCreatePage = () => {
    onCreatePage?.();
  };

  const handleDuplicatePage = async (pageId: string) => {
    try {
      const { data: originalPage, error } = await supabase
        .from('pages')
        .select('*')
        .eq('id', pageId)
        .single();

      if (error) throw error;

      const { error: insertError } = await supabase
        .from('pages')
        .insert({
          title: `${originalPage.title} (Copy)`,
          content: originalPage.content,
          parent_page_id: originalPage.parent_page_id,
          space_id: originalPage.space_id,
          is_public: originalPage.is_public,
          created_by: originalPage.created_by,
          tags: originalPage.tags
        });

      if (insertError) throw insertError;

      toast({
        title: "Success",
        description: "Page duplicated successfully"
      });

      fetchHierarchyData();
    } catch (error) {
      console.error('Error duplicating page:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate page",
        variant: "destructive"
      });
    }
  };

  const handleArchivePage = async (pageId: string) => {
    try {
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', pageId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Page archived successfully"
      });

      fetchHierarchyData();
    } catch (error) {
      console.error('Error archiving page:', error);
      toast({
        title: "Error",
        description: "Failed to archive page",
        variant: "destructive"
      });
    }
  };

  const handleCopyLink = (pageId: string) => {
    const url = `${window.location.origin}/page/${pageId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Success",
      description: "Link copied to clipboard"
    });
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragOver = (event: DragOverEvent) => {
    // Handle drag over logic if needed
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);

    if (!over || active.id === over.id) {
      return;
    }

    try {
      const activeItem = pages.find(p => p.id === active.id);
      if (!activeItem) return;

      // Handle different drop scenarios
      if (over.id.toString().startsWith('droppable-')) {
        // Dropped on a droppable area (page or space)
        const targetId = over.id.toString().replace('droppable-', '');
        const targetPage = pages.find(p => p.id === targetId);
        const targetSpace = spaces.find(s => s.id === targetId);

        if (targetPage) {
          // Move as child of target page
          await handleMoveToParent(activeItem.id, targetId);
        } else if (targetSpace) {
          // Move to space root
          await handleMoveToParent(activeItem.id, null);
        }
      } else {
        // Dropped on another page for reordering
        await handleReorderPages(active.id as string, over.id as string);
      }
    } catch (error) {
      console.error('Error in drag end:', error);
      toast({
        title: "Error",
        description: "Failed to move page",
        variant: "destructive"
      });
    }
  };

  const handleMoveToParent = async (pageId: string, newParentId: string | null) => {
    try {
      const currentPage = pages.find(p => p.id === pageId);
      if (!currentPage) return;

      // Get next sort order for new location
      const { data: maxSortOrderData } = await supabase
        .from('pages')
        .select('sort_order')
        .eq('parent_page_id', newParentId)
        .eq('space_id', currentPage.space_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const newSortOrder = (maxSortOrderData?.sort_order || 0) + 1000;

      const { error } = await supabase
        .from('pages')
        .update({ 
          parent_page_id: newParentId,
          sort_order: newSortOrder
        })
        .eq('id', pageId);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Page moved successfully"
      });

      fetchHierarchyData();
    } catch (error: any) {
      console.error('Error moving page:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to move page",
        variant: "destructive"
      });
    }
  };

  const handleReorderPages = async (activeId: string, overId: string) => {
    try {
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
          .update({ sort_order: update.sort_order })
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

  return (
    <div className="flex flex-col h-full bg-sidebar-background">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="h-5 w-5 text-sidebar-foreground" />
          <span className="font-semibold text-sidebar-foreground">Knowledge Base</span>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input
            placeholder="Search pages..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-8 bg-sidebar-background border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        {/* Search Results */}
        {showSearchResults && searchResults.length > 0 && (
          <div className="p-2 border-b border-sidebar-border">
            <div className="text-xs font-medium text-sidebar-foreground/70 mb-2 px-2">
              Search Results ({searchResults.length})
            </div>
            {searchResults.map((result) => (
              <Button
                key={result.id}
                variant="ghost"
                className="w-full justify-start h-auto p-2 text-left"
                onClick={() => handleItemSelect(result)}
              >
                <FileText className="h-4 w-4 mr-2 flex-shrink-0 text-sidebar-foreground/70" />
                <span className="text-sm text-sidebar-foreground truncate">{result.title}</span>
                {result.is_public && (
                  <Globe className="h-3 w-3 ml-auto text-sidebar-foreground/50" />
                )}
              </Button>
            ))}
          </div>
        )}

        {!showSearchResults && (
          <>
            {/* Navigation Items */}
            <div className="p-2">
              {navigationItems.map((item) => {
                const IconComponent = item.icon;
                return (
                  <Button
                    key={item.id}
                    variant="ghost"
                    className={cn(
                      "w-full justify-start mb-1 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                      selectedId === item.id && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                    onClick={() => handleItemSelect({
                      id: item.id,
                      title: item.title,
                      type: 'page',
                      href: item.href
                    })}
                  >
                    <IconComponent className="h-4 w-4 mr-2" />
                    {item.title}
                  </Button>
                );
              })}
            </div>

            {/* Create Page Button */}
            {onCreatePage && (
              <div className="px-2 pb-2">
                <Button
                  variant="outline"
                  className="w-full justify-start border-sidebar-border hover:bg-sidebar-accent"
                  onClick={handleCreatePage}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Page
                </Button>
              </div>
            )}

            {/* Hierarchy */}
            {loading ? (
              <div className="p-4 text-center">
                <div className="text-sm text-sidebar-foreground/70">Loading...</div>
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={hierarchyData.map(item => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="pb-4">
                    {hierarchyData.map((item) => (
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
                  </div>
                </SortableContext>

                <DragOverlay>
                  {activeItem ? (
                    <div className="bg-sidebar-background border border-sidebar-border rounded p-2 shadow-lg">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-sidebar-foreground/70" />
                        <span className="text-sm text-sidebar-foreground">{activeItem.title}</span>
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
            )}
          </>
        )}
      </ScrollArea>
    </div>
  );
}