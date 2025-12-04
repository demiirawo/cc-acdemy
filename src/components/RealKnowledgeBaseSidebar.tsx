import { useState, useEffect } from "react";
import { Search, Plus, BookOpen, Folder, ChevronRight, ChevronDown, Home, Clock, Tag, Settings, Globe, FolderOpen, FileText, MoreHorizontal, Edit, Copy, Share, Star, Archive, Trash2, ArrowUp, ArrowDown, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { MovePageDialog } from "./MovePageDialog";
import { useUserRole } from "@/hooks/useUserRole";

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

const navigationItems = [{
  id: 'home',
  title: 'Home',
  icon: Home,
  href: '/'
}, {
  id: 'chat',
  title: 'Care Cuddle AI',
  icon: MessageSquare,
  href: '/chat'
}, {
  id: 'recent',
  title: 'Recently Updated',
  icon: Clock,
  href: '/recent'
}, {
  id: 'tags',
  title: 'Tags',
  icon: Tag,
  href: '/tags'
}, {
  id: 'recycling-bin',
  title: 'Recycling Bin',
  icon: Trash2,
  href: '/recycling-bin'
}, {
  id: 'user-management',
  title: 'User Management',
  icon: () => <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="m22 21-3-3m0 0a4.5 4.5 0 1 0-6.364-6.364A4.5 4.5 0 0 0 19 18Z"/>
      </svg>,
  href: '/user-management'
}, {
  id: 'whiteboard',
  title: 'Whiteboard',
  icon: () => <svg className="h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="m7 7 10 10" />
        <path d="m17 7-10 10" />
      </svg>,
  href: '/whiteboard'
}, {
  id: 'glossary',
  title: 'Glossary',
  icon: BookOpen,
  href: '/glossary'
}];

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
  onMovePage?: (pageId: string) => void;
  hierarchyData?: SidebarItem[];
  expandedItems: Set<string>;
  onToggleExpanded: (itemId: string) => void;
}

// Simple SidebarTreeItem component without drag functionality
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
  onMovePage,
  hierarchyData,
  expandedItems,
  onToggleExpanded
}: SidebarTreeItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const isExpanded = expandedItems.has(item.id);
  const { toast } = useToast();

  const handleMovePageUp = async (pageId: string) => {
    if (isLoading) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase.rpc('move_page_up_enhanced', {
        p_page_id: pageId,
        p_expected_version: 0
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (result.success) {
        toast({
          title: "Success",
          description: result.message || "Page moved up successfully"
        });
        window.dispatchEvent(new CustomEvent('pageUpdated'));
      } else {
        toast({
          title: "Cannot move page",
          description: result.error || "Page is already at the top",
          variant: "destructive"
        });
      }
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
      const { data, error } = await supabase.rpc('move_page_down_enhanced', {
        p_page_id: pageId,
        p_expected_version: 0
      });
      
      if (error) throw error;
      
      const result = data as { success: boolean; error?: string; message?: string };
      
      if (result.success) {
        toast({
          title: "Success",
          description: result.message || "Page moved down successfully"
        });
        window.dispatchEvent(new CustomEvent('pageUpdated'));
      } else {
        toast({
          title: "Cannot move page",
          description: result.error || "Page is already at the bottom",
          variant: "destructive"
        });
      }
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

  return (
    <div className="relative group">
      <div className={cn(
        "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-all duration-200",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
        isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        level > 0 && "ml-2",
        isLoading && "opacity-50 pointer-events-none"
      )} 
      style={{ paddingLeft: `${level * 12 + 8}px` }}
      onClick={() => onSelect(item)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}>
        
        {hasChildren && (
          <Button variant="ghost" size="sm" className="h-4 w-4 p-0 hover:bg-transparent" onClick={(e) => {
            e.stopPropagation();
            onToggleExpanded(item.id);
          }}>
            {isExpanded ? <ChevronDown className="h-3 w-3 text-white hover:animate-pulse" /> : <ChevronRight className="h-3 w-3 text-white hover:animate-pulse" />}
          </Button>
        )}
        {!hasChildren && <div className="w-4" />}
        
        {item.type === 'space' || hasChildren || (!item.parent_page_id && item.type === 'page') ? 
          (isExpanded ? <FolderOpen className="h-4 w-4 text-pink-500 flex-shrink-0" /> : <Folder className="h-4 w-4 text-pink-500 flex-shrink-0" />) : 
          <FileText className="h-4 w-4 text-white flex-shrink-0" />
        }
        
        <span className="truncate flex-1 text-neutral-50 font-medium">{item.title}</span>
        
        {/* Action buttons */}
        <div className={cn(
          "flex items-center gap-1 transition-opacity duration-200",
          (isHovered || isSelected) ? "opacity-100" : "opacity-0"
        )}>
          {/* Add child page button */}
          {(item.type === 'space' || item.type === 'page') && onCreatePageInEditor && (
            <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-sidebar-accent/50" 
              onClick={(e) => {
                e.stopPropagation();
                onCreatePageInEditor(item.id);
              }} 
              title="Add child page">
              <Plus className="h-3 w-3" />
            </Button>
          )}
          
          {/* Up/Down arrows for pages */}
          {item.type === 'page' && (
            <>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-sidebar-accent/50" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleMovePageUp(item.id);
                }} 
                title="Move up"
                disabled={isLoading}>
                <ArrowUp className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-sidebar-accent/50" 
                onClick={(e) => {
                  e.stopPropagation();
                  handleMovePageDown(item.id);
                }} 
                title="Move down"
                disabled={isLoading}>
                <ArrowDown className="h-3 w-3" />
              </Button>
            </>
          )}
          
          {/* Context menu for pages */}
          {item.type === 'page' && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:bg-sidebar-accent/50" onClick={(e) => e.stopPropagation()}>
                  <MoreHorizontal className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => onSelect(item)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onMovePage?.(item.id)}>
                  <Share className="h-4 w-4 mr-2" />
                  Move
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onCopyLink?.(item.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy public link
                </DropdownMenuItem>
                <DropdownMenuItem onClick={async () => {
                  try {
                    const { data, error } = await supabase
                      .from('pages')
                      .update({ is_public: !item.is_public })
                      .eq('id', item.id)
                      .select()
                      .single();
                    
                    if (error) throw error;
                    
                    toast({
                      title: item.is_public ? "Page made private" : "Page made public",
                      description: item.is_public ? "Page is now private" : "Page is now public"
                    });
                    
                    window.dispatchEvent(new CustomEvent('pageUpdated'));
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to update page visibility",
                      variant: "destructive"
                    });
                  }
                }}>
                  <Globe className="h-4 w-4 mr-2" />
                  {item.is_public ? 'Make private' : 'Make public'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onDuplicatePage?.(item.id)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={async () => {
                  if (confirm("Are you sure you want to delete this page? You can restore it from the recycling bin.")) {
                    try {
                      // Soft delete by setting deleted_at timestamp
                      const { data, error } = await supabase
                        .from('pages')
                        .update({ deleted_at: new Date().toISOString() })
                        .eq('id', item.id)
                        .select()
                        .single();
                      
                      if (error) throw error;
                      if (!data) throw new Error('No permission to delete this page');
                      
                      toast({
                        title: "Page deleted",
                        description: "Page moved to recycling bin."
                      });
                      
                      window.dispatchEvent(new CustomEvent('pageUpdated'));
                    } catch (error: any) {
                      console.error('Error deleting page:', error);
                      toast({
                        title: "Error",
                        description: error.message || "Failed to delete page.",
                        variant: "destructive"
                      });
                    }
                  }
                }}>
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
              hierarchyData={hierarchyData}
              expandedItems={expandedItems}
              onToggleExpanded={onToggleExpanded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface RealKnowledgeBaseSidebarProps {
  onItemSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreatePage?: () => void;
  onCreateSubPage?: (parentId: string) => void;
  onCreatePageInEditor?: (parentId?: string) => void;
  onMovePage?: (pageId: string) => void;
}

export function RealKnowledgeBaseSidebar({
  onItemSelect,
  selectedId,
  onCreatePage,
  onCreateSubPage,
  onCreatePageInEditor,
  onMovePage
}: RealKnowledgeBaseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SidebarItem[]>([]);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [hierarchyData, setHierarchyData] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [pageToMove, setPageToMove] = useState<{ id: string; title: string } | null>(null);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { isAdmin } = useUserRole();

  const toggleExpanded = (itemId: string) => {
    setExpandedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  useEffect(() => {
    fetchHierarchyData();

    // Event listener for page updates
    const handlePageUpdated = () => {
      console.log('Page updated event received, refreshing hierarchy...');
      // Add a small delay to ensure database writes are complete
      setTimeout(() => {
        fetchHierarchyData();
      }, 100);
    };
    window.addEventListener('pageUpdated', handlePageUpdated);

    // Set up real-time subscriptions with better error handling
    const pagesChannel = supabase
      .channel('pages-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'pages' 
      }, (payload) => {
        console.log('Real-time page change:', payload);
        // Add delay to ensure consistency
        setTimeout(() => {
          fetchHierarchyData();
        }, 100);
      })
      .subscribe((status) => {
        console.log('Pages channel subscription status:', status);
      });

    const spacesChannel = supabase
      .channel('spaces-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'spaces' 
      }, (payload) => {
        console.log('Real-time space change:', payload);
        setTimeout(() => {
          fetchHierarchyData();
        }, 100);
      })
      .subscribe((status) => {
        console.log('Spaces channel subscription status:', status);
      });

    return () => {
      window.removeEventListener('pageUpdated', handlePageUpdated);
      supabase.removeChannel(pagesChannel);
      supabase.removeChannel(spacesChannel);
    };
  }, []);

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length === 0) {
      setShowSearchResults(false);
      setSearchResults([]);
      return;
    }

    if (searchQuery.trim().length < 2) {
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: SidebarItem[] = [];

    // Search pages
    pages
      .filter(page => 
        page.title.toLowerCase().includes(query) || 
        page.content.toLowerCase().includes(query)
      )
      .slice(0, 10)
      .forEach(page => {
        results.push({
          id: page.id,
          title: page.title,
          type: 'page',
          icon: FileText,
          parent_page_id: page.parent_page_id,
          space_id: page.space_id,
          is_public: page.is_public,
          sort_order: page.sort_order
        });
      });

    // Search spaces
    spaces
      .filter(space => 
        space.name.toLowerCase().includes(query) || 
        (space.description && space.description.toLowerCase().includes(query))
      )
      .slice(0, 5)
      .forEach(space => {
        results.push({
          id: space.id,
          title: space.name,
          type: 'space',
          icon: Folder
        });
      });

    setSearchResults(results);
    setShowSearchResults(true);
  }, [searchQuery, pages, spaces]);

  const fetchHierarchyData = async () => {
    setLoading(true);
    try {
      const [spacesResponse, pagesResponse] = await Promise.all([
        supabase.from('spaces').select('*').order('name'),
        supabase.from('pages').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true })
      ]);

      if (spacesResponse.error) throw spacesResponse.error;
      if (pagesResponse.error) throw pagesResponse.error;

      console.log('Fetched hierarchy data - Spaces:', spacesResponse.data?.length, 'Pages:', pagesResponse.data?.length);
      console.log('Pages with hierarchy info:', pagesResponse.data?.map(p => ({ 
        title: p.title, 
        id: p.id,
        parent_page_id: p.parent_page_id, 
        space_id: p.space_id,
        sort_order: p.sort_order 
      })));

      setSpaces(spacesResponse.data || []);
      setPages(pagesResponse.data || []);

      const hierarchy = buildHierarchy(spacesResponse.data || [], pagesResponse.data || []);
      console.log('Built hierarchy:', hierarchy);
      setHierarchyData(hierarchy);
    } catch (error) {
      console.error('Error fetching hierarchy data:', error);
      toast({
        title: "Error loading sidebar",
        description: "Failed to load spaces and pages.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Hierarchy building with proper sort_order handling
  const buildHierarchy = (spacesData: Space[], pagesData: Page[]): SidebarItem[] => {
    const hierarchy: SidebarItem[] = [];

    // Add spaces with their pages
    spacesData.forEach((space) => {
      const spaceItem: SidebarItem = {
        id: space.id,
        title: space.name,
        type: 'space',
        icon: Folder,
        children: []
      };

      // Get root pages for this space, ordered by sort_order
      const spacePages = pagesData
        .filter(page => page.space_id === space.id && !page.parent_page_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

      spaceItem.children = spacePages.map(page => buildPageHierarchy(page, pagesData));
      hierarchy.push(spaceItem);
    });

    // Add orphaned pages (no space, no parent), ordered by sort_order
    const orphanedPages = pagesData
      .filter(page => !page.space_id && !page.parent_page_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    orphanedPages.forEach((page) => {
      hierarchy.push(buildPageHierarchy(page, pagesData));
    });

    return hierarchy;
  };

  const buildPageHierarchy = (page: Page, allPages: Page[]): SidebarItem => {
    // Get children ordered by sort_order
    const children = allPages
      .filter(p => p.parent_page_id === page.id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .map(childPage => buildPageHierarchy(childPage, allPages));

    return {
      id: page.id,
      title: page.title,
      type: 'page',
      icon: FileText,
      is_public: page.is_public || false,
      parent_page_id: page.parent_page_id,
      space_id: page.space_id,
      sort_order: page.sort_order,
      children: children.length > 0 ? children : undefined
    };
  };

  const handleItemSelect = (item: SidebarItem) => {
    if (item.id === 'home' || item.id === 'recent' || item.id === 'tags' || item.id === 'settings' || item.id === 'whiteboard' || item.id === 'user-management' || item.id === 'chat' || item.id === 'glossary' || item.id === 'recycling-bin') {
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
          description: "Page has been successfully duplicated."
        });

        fetchHierarchyData();
      }
    } catch (error) {
      console.error('Error duplicating page:', error);
      toast({
        title: "Error",
        description: "Failed to duplicate page.",
        variant: "destructive"
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
        description: "Page has been moved to archive."
      });

      fetchHierarchyData();
    } catch (error) {
      console.error('Error archiving page:', error);
      toast({
        title: "Error",
        description: "Failed to archive page.",
        variant: "destructive"
      });
    }
  };

  const handleCopyLink = (pageId: string) => {
    const url = `${window.location.origin}/?page=${pageId}`;
    navigator.clipboard.writeText(url);
    toast({
      title: "Link copied",
      description: "Page link copied to clipboard."
    });
  };

  const handleCreatePage = () => {
    if (onCreatePageInEditor) {
      onCreatePageInEditor();
    } else if (onCreatePage) {
      onCreatePage();
    }
  };

  const handleMovePage = (pageId: string) => {
    const page = pages.find(p => p.id === pageId);
    if (page) {
      setPageToMove({ id: pageId, title: page.title });
      setMoveDialogOpen(true);
    }
  };
  const filteredHierarchy = hierarchyData.filter((item) => 
    item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (item.children && item.children.some((child) => child.title.toLowerCase().includes(searchQuery.toLowerCase())))
  );

  return (
    <div className="w-full border-r-0 flex flex-col h-full bg-[#5e18eb]">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-40 h-40 bg-[#5e18eb] rounded-lg flex items-center justify-center overflow-hidden mx-auto">
            <img src="/lovable-uploads/d434f96d-1ac3-4f74-a546-93f9f1b3c09b.png" alt="Care Cuddle Logo" className="h-32 w-32 object-contain" />
          </div>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-black/50" />
          <Input 
            placeholder="Search..." 
            value={searchQuery} 
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-white border-gray-300 text-black placeholder:text-black/50 h-9"
          />
          
          {/* Search Results Dropdown */}
          {showSearchResults && searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-sidebar border border-sidebar-border rounded-md shadow-lg z-50 max-h-64 overflow-y-auto">
              <div className="py-2">
                <div className="px-3 py-1 text-xs font-medium text-sidebar-foreground/70 border-b border-sidebar-border">
                  Search Results ({searchResults.length})
                </div>
                {searchResults.map((result) => {
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
          {navigationItems
            .filter((item) => {
              // Filter navigation items based on user role
              if (item.id === 'user-management' || item.id === 'recycling-bin') {
                return isAdmin;
              }
              return true;
            })
            .map((item) => {
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
                onClick={() => handleItemSelect({
                  ...item,
                  type: item.id === 'chat' ? 'space' : 'page' // Use 'space' for special pages like chat to avoid page fetch
                })}
              >
                <Icon className="h-4 w-4 text-sidebar-foreground/70" />
                <span className="text-zinc-50">{item.title}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Content Tree */}
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
              <div className="space-y-1">
                {filteredHierarchy.length > 0 ? (
                  filteredHierarchy.map((item) => (
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
                      hierarchyData={hierarchyData}
                      expandedItems={expandedItems}
                      onToggleExpanded={toggleExpanded}
                    />
                  ))
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
            )}
          </div>
        </ScrollArea>
      </div>


      {/* Move Page Dialog */}
      {pageToMove && (
        <MovePageDialog
          isOpen={moveDialogOpen}
          onClose={() => {
            setMoveDialogOpen(false);
            setPageToMove(null);
          }}
          pageId={pageToMove.id}
          currentPageTitle={pageToMove.title}
        />
      )}
    </div>
  );
}
