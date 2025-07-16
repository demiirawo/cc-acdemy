import { useState, useEffect } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { 
  Search, 
  Plus, 
  BookOpen, 
  Folder, 
  ChevronRight, 
  ChevronDown,
  Home,
  Clock,
  Tag,
  Users,
  Settings,
  Globe,
  FolderOpen,
  FileText,
  MoreHorizontal,
  Edit,
  Copy,
  Share,
  Star,
  Archive,
  Trash2,
  Move,
  GripVertical
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface SidebarItem {
  id: string;
  title: string;
  type: 'space' | 'page' | 'folder';
  icon?: any;
  children?: SidebarItem[];
  href?: string;
  is_public?: boolean;
  parent_page_id?: string | null;
  space_id?: string | null;
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
}

const navigationItems = [
  { id: 'home', title: 'Home', icon: Home, href: '/' },
  { id: 'recent', title: 'Recently Updated', icon: Clock, href: '/recent' },
  { id: 'tags', title: 'Tags', icon: Tag, href: '/tags' },
  { id: 'people', title: 'People', icon: Users, href: '/people' },
  { id: 'whiteboard', title: 'Whiteboard', icon: () => (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <path d="m7 7 10 10"/>
      <path d="m17 7-10 10"/>
    </svg>
  ), href: '/whiteboard' },
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
}

function DraggablePageItem({ 
  item, 
  level, 
  onSelect, 
  selectedId, 
  onCreateSubPage, 
  onCreatePageInEditor,
  onDuplicatePage,
  onArchivePage,
  onCopyLink,
  onMovePage
}: SidebarTreeItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [isHovered, setIsHovered] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const Icon = item.icon || BookOpen;

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(true);
  };

  const handleDragLeave = () => {
    setIsDropTarget(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDropTarget(false);
    const draggedPageId = e.dataTransfer.getData('text/plain');
    if (draggedPageId && draggedPageId !== item.id && onMovePage) {
      onMovePage(draggedPageId, item.id);
    }
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-all duration-200 group",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          isDropTarget && "bg-primary/20 border border-primary/40",
          level > 0 && "ml-2"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(item)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* Drag Handle */}
        {item.type === 'page' && (
          <div
            {...attributes}
            {...listeners}
            className="opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', item.id);
            }}
          >
            <GripVertical className="h-3 w-3 text-sidebar-foreground/40" />
          </div>
        )}

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
        
        {item.type === 'space' ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )
        ) : (
          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
        )}
        
        <span className="truncate text-sidebar-foreground flex-1">{item.title}</span>
        
        {/* Public indicator */}
        {item.is_public && (
          <Globe className="h-3 w-3 text-sidebar-foreground/50 flex-shrink-0" />
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
                  Copy link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  // Placeholder for star functionality
                  const { toast } = useToast();
                  toast({
                    title: "Star feature",
                    description: "Coming soon!",
                  });
                }}>
                  <Star className="h-4 w-4 mr-2" />
                  Star
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  // Placeholder for share functionality
                  const { toast } = useToast();
                  toast({
                    title: "Share feature",
                    description: "Coming soon!",
                  });
                }}>
                  <Share className="h-4 w-4 mr-2" />
                  Share
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDuplicatePage?.(item.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  // Placeholder for move functionality
                  const { toast } = useToast();
                  toast({
                    title: "Move feature",
                    description: "Use drag and drop to move pages!",
                  });
                }}>
                  <Move className="h-4 w-4 mr-2" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onArchivePage?.(item.id)}>
                  <Archive className="h-4 w-4 mr-2" />
                  Archive
                </DropdownMenuItem>
                <DropdownMenuItem 
                  className="text-destructive focus:text-destructive"
                  onClick={async () => {
                    if (confirm("Are you sure you want to delete this page? This action cannot be undone.")) {
                      try {
                        const { error } = await supabase
                          .from('pages')
                          .delete()
                          .eq('id', item.id);

                        if (error) throw error;

                        const { toast } = useToast();
                        toast({
                          title: "Page deleted",
                          description: "Page has been permanently deleted.",
                        });
                        
                        // Refresh the sidebar data
                        window.location.reload();
                      } catch (error) {
                        console.error('Error deleting page:', error);
                        const { toast } = useToast();
                        toast({
                          title: "Error",
                          description: "Failed to delete page.",
                          variant: "destructive",
                        });
                      }
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
      
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {item.children?.map((child) => (
            <DraggablePageItem
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarTreeItem({ 
  item, 
  level, 
  onSelect, 
  selectedId, 
  onCreateSubPage, 
  onCreatePageInEditor,
  onDuplicatePage,
  onArchivePage,
  onCopyLink,
  onMovePage
}: SidebarTreeItemProps) {
  // Use DraggablePageItem for pages, regular item for spaces
  if (item.type === 'page') {
    return (
      <DraggablePageItem
        item={item}
        level={level}
        onSelect={onSelect}
        selectedId={selectedId}
        onCreateSubPage={onCreateSubPage}
        onCreatePageInEditor={onCreatePageInEditor}
        onDuplicatePage={onDuplicatePage}
        onArchivePage={onArchivePage}
        onCopyLink={onCopyLink}
        onMovePage={onMovePage}
      />
    );
  }

  // Regular non-draggable item for spaces
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const [isHovered, setIsHovered] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-all duration-200 group",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
          level > 0 && "ml-2"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(item)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
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
        
        {item.type === 'space' ? (
          isExpanded ? (
            <FolderOpen className="h-4 w-4 text-amber-500 flex-shrink-0" />
          ) : (
            <Folder className="h-4 w-4 text-amber-500 flex-shrink-0" />
          )
        ) : (
          <FileText className="h-4 w-4 text-blue-500 flex-shrink-0" />
        )}
        
        <span className="truncate text-sidebar-foreground flex-1">{item.title}</span>
        
        {/* Action buttons - show on hover */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-200",
          isHovered || isSelected ? "opacity-100" : "opacity-0"
        )}>
          {/* Add child page button */}
          {item.type === 'space' && onCreatePageInEditor && (
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
        </div>
      </div>
      
      {hasChildren && isExpanded && (
        <SortableContext items={item.children?.map(c => c.id) || []} strategy={verticalListSortingStrategy}>
          <div className="ml-2">
            {item.children?.map((child) => (
              <SidebarTreeItem
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
              />
            ))}
          </div>
        </SortableContext>
      )}
    </div>
  );
}

interface RealKnowledgeBaseSidebarProps {
  onItemSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreatePage?: () => void;
  onCreateSubPage?: (parentId: string) => void;
  onCreateFolder?: () => void;
  onCreatePageInEditor?: (parentId?: string) => void;
}

export function RealKnowledgeBaseSidebar({ 
  onItemSelect, 
  selectedId, 
  onCreatePage, 
  onCreateSubPage,
  onCreateFolder,
  onCreatePageInEditor
}: RealKnowledgeBaseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [hierarchyData, setHierarchyData] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    fetchHierarchyData();
  }, []);

  const fetchHierarchyData = async () => {
    setLoading(true);
    try {
      const [spacesResponse, pagesResponse] = await Promise.all([
        supabase.from('spaces').select('*').order('name'),
        supabase.from('pages').select('*').order('title')
      ]);

      if (spacesResponse.error) throw spacesResponse.error;
      if (pagesResponse.error) throw pagesResponse.error;

      setSpaces(spacesResponse.data || []);
      setPages(pagesResponse.data || []);

      const hierarchy = buildHierarchy(spacesResponse.data || [], pagesResponse.data || []);
      setHierarchyData(hierarchy);
    } catch (error) {
      console.error('Error fetching hierarchy data:', error);
      toast({
        title: "Error loading sidebar",
        description: "Failed to load spaces and pages.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const buildHierarchy = (spacesData: Space[], pagesData: Page[]): SidebarItem[] => {
    const hierarchy: SidebarItem[] = [];

    spacesData.forEach(space => {
      const spaceItem: SidebarItem = {
        id: space.id,
        title: space.name,
        type: 'space',
        icon: Folder,
        children: []
      };

      const spacePages = pagesData.filter(page => 
        page.space_id === space.id && !page.parent_page_id
      );

      spaceItem.children = spacePages.map(page => buildPageHierarchy(page, pagesData));
      hierarchy.push(spaceItem);
    });

    const orphanedPages = pagesData.filter(page => 
      !page.space_id && !page.parent_page_id
    );

    orphanedPages.forEach(page => {
      hierarchy.push(buildPageHierarchy(page, pagesData));
    });

    return hierarchy;
  };

  const buildPageHierarchy = (page: Page, allPages: Page[]): SidebarItem => {
    const children = allPages
      .filter(p => p.parent_page_id === page.id)
      .map(childPage => buildPageHierarchy(childPage, allPages));

    return {
      id: page.id,
      title: page.title,
      type: 'page',
      icon: FileText,
      is_public: page.is_public || false,
      parent_page_id: page.parent_page_id,
      space_id: page.space_id,
      children: children.length > 0 ? children : undefined
    };
  };

  const handleItemSelect = (item: SidebarItem) => {
    if (item.id === 'home' || item.id === 'recent' || item.id === 'tags' || item.id === 'people' || item.id === 'settings' || item.id === 'whiteboard') {
      onItemSelect(item);
    } else if (item.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      onItemSelect(item);
    }
  };

  const handleDuplicatePage = async (pageId: string) => {
    try {
      const { data: originalPage } = await supabase
        .from('pages')
        .select('*')
        .eq('id', pageId)
        .single();

      if (originalPage) {
        const { error } = await supabase
          .from('pages')
          .insert({
            title: `${originalPage.title} (Copy)`,
            content: originalPage.content,
            created_by: originalPage.created_by,
            space_id: originalPage.space_id,
            parent_page_id: originalPage.parent_page_id
          });

        if (error) throw error;

        toast({
          title: "Page duplicated",
          description: "Page has been successfully duplicated.",
        });
        
        fetchHierarchyData();
      }
    } catch (error) {
      console.error('Error duplicating page:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate page.",
        variant: "destructive",
      });
    }
  };

  const handleArchivePage = async (pageId: string) => {
    try {
      const { error } = await supabase
        .from('pages')
        .update({ tags: ['archived'] })
        .eq('id', pageId);

      if (error) throw error;

      toast({
        title: "Page archived",
        description: "Page has been moved to archive.",
      });
      
      fetchHierarchyData();
    } catch (error) {
      console.error('Error archiving page:', error);
      toast({
        title: "Error",
        description: "Failed to archive page.",
        variant: "destructive",
      });
    }
  };

  const handleCopyLink = (pageId: string) => {
    const url = `${window.location.origin}/?page=${pageId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Page link copied to clipboard.",
    });
  };

  const handleMovePage = async (pageId: string, newParentId: string | null) => {
    try {
      const { error } = await supabase
        .from('pages')
        .update({ parent_page_id: newParentId })
        .eq('id', pageId);

      if (error) throw error;

      toast({
        title: "Page moved",
        description: "Page has been moved successfully.",
      });
      
      fetchHierarchyData();
    } catch (error) {
      console.error('Error moving page:', error);
      toast({
        title: "Error",
        description: "Failed to move page.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFolder = async () => {
    if (onCreateFolder) {
      onCreateFolder();
    }
  };

  const handleCreatePage = () => {
    if (onCreatePageInEditor) {
      onCreatePageInEditor();
    } else if (onCreatePage) {
      onCreatePage();
    }
  };

  const filteredHierarchy = hierarchyData.filter(item =>
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (item.children && item.children.some(child => 
      child.title.toLowerCase().includes(searchQuery.toLowerCase())
    ))
  );

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-semibold text-sidebar-foreground">CC Learn</h1>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50 h-9"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="space-y-1">
          {navigationItems.map((item) => {
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
                <span className="text-sidebar-foreground">{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Tree */}
      <div className="flex-1 p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-sidebar-foreground/70 uppercase tracking-wider">
            Spaces & Pages
          </h3>
          <div className="flex gap-1">
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-6 w-6 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={handleCreateFolder}
              title="Create new space"
            >
              <Folder className="h-3 w-3" />
            </Button>
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
            >
              <div className="space-y-1">
                {filteredHierarchy.length > 0 ? (
                  <SortableContext items={filteredHierarchy.map(item => item.id)} strategy={verticalListSortingStrategy}>
                    {filteredHierarchy.map((item) => (
                      <SidebarTreeItem
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
                        onMovePage={handleMovePage}
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
            </DndContext>
          )}
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => handleItemSelect({ id: 'settings', title: 'Settings', type: 'page' })}
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>
  );
}