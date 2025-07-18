import { useState, useEffect } from "react";
import { Search, Plus, BookOpen, Folder, ChevronRight, ChevronDown, Home, Clock, Tag, Users, Settings, Globe, FolderOpen, FileText, MoreHorizontal, Edit, Copy, Share, Star, Archive, Trash2, Move, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { EnhancedSidebarTreeItem } from "./EnhancedSidebarTreeItem";

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
  version: number | null;
}

// Type for database function results
interface DatabaseFunctionResult {
  success: boolean;
  message?: string;
  error?: string;
  code?: string;
  new_version?: number;
}

const navigationItems = [{
  id: 'home',
  title: 'Home',
  icon: Home,
  href: '/'
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
  id: 'people',
  title: 'People',
  icon: Users,
  href: '/people'
}, {
  id: 'user-management',
  title: 'User Management',
  icon: Users,
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
}];

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
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [hierarchyData, setHierarchyData] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchHierarchyData();

    // Listen for page updates from editor
    const handlePageUpdated = () => {
      fetchHierarchyData();
    };

    window.addEventListener('pageUpdated', handlePageUpdated);

    // Set up real-time subscriptions for pages and spaces
    const pagesChannel = supabase
      .channel('pages-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'pages'
        },
        () => {
          // Refetch data when pages change
          fetchHierarchyData();
        }
      )
      .subscribe();

    const spacesChannel = supabase
      .channel('spaces-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spaces'
        },
        () => {
          // Refetch data when spaces change
          fetchHierarchyData();
        }
      )
      .subscribe();

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

    // Search through pages and spaces
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
          version: page.version
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
        supabase.from('pages').select('*').order('sort_order', { ascending: true })
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
        variant: "destructive"
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

      const spacePages = pagesData
        .filter(page => page.space_id === space.id && !page.parent_page_id)
        .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
      
      spaceItem.children = spacePages.map(page => buildPageHierarchy(page, pagesData));
      hierarchy.push(spaceItem);
    });

    const orphanedPages = pagesData
      .filter(page => !page.space_id && !page.parent_page_id)
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    orphanedPages.forEach(page => {
      hierarchy.push(buildPageHierarchy(page, pagesData));
    });

    return hierarchy;
  };

  const buildPageHierarchy = (page: Page, allPages: Page[]): SidebarItem => {
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
      sort_order: page.sort_order || 0,
      version: page.version || 1,
      children: children.length > 0 ? children : undefined
    };
  };

  const handleItemSelect = (item: SidebarItem) => {
    if (item.id === 'home' || item.id === 'recent' || item.id === 'tags' || item.id === 'people' || item.id === 'settings' || item.id === 'whiteboard' || item.id === 'user-management') {
      onItemSelect(item);
    } else if (item.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      onItemSelect(item);
    }
  };

  // Enhanced move page up/down with new safe functions
  const handleMovePageUpDown = async (pageId: string, direction: 'up' | 'down', version: number) => {
    try {
      console.log('Moving page:', { pageId, direction, version });
      
      // Use enhanced functions with better error handling and auto-retry
      const functionName = direction === 'up' ? 'move_page_up_enhanced' : 'move_page_down_enhanced';
      const { data: result, error } = await supabase.rpc(functionName, {
        p_page_id: pageId,
        p_expected_version: version
      });

      if (error) {
        console.error('Database error:', error);
        toast({
          title: "Database Error",
          description: error.message,
          variant: "destructive"
        });
        return { success: false };
      }

      // Type assertion for the database function result
      const typedResult = result as unknown as DatabaseFunctionResult;
      console.log('Move result:', typedResult);

      if (typedResult.success) {
        // Force immediate refresh for better UX
        await fetchHierarchyData();
        
        toast({
          title: "Success",
          description: `Page moved ${direction} successfully`,
          variant: "default"
        });
        
        return { success: true, new_version: typedResult.new_version };
      } else {
        // Handle specific error codes gracefully
        switch (typedResult.code) {
          case 'VERSION_CONFLICT':
          case 'RETRY_EXCEEDED':
            // Auto-refresh data and don't show error - user can retry
            await fetchHierarchyData();
            toast({
              title: "Please try again",
              description: "Data was updated, please retry the move",
              variant: "default"
            });
            break;
          
          case 'ALREADY_AT_TOP':
          case 'ALREADY_AT_BOTTOM':
            // Silent fail - these are expected behavior
            break;
            
          case 'PAGE_NOT_FOUND':
            await fetchHierarchyData();
            toast({
              title: "Page not found",
              description: "The page may have been deleted",
              variant: "destructive"
            });
            break;
            
          default:
            toast({
              title: "Cannot move page",
              description: typedResult.error || "Unknown error occurred",
              variant: "destructive"
            });
        }
        
        return { success: false };
      }
    } catch (error) {
      console.error('Error in handleMovePageUpDown:', error);
      toast({
        title: "Error",
        description: "Failed to move page. Please try again.",
        variant: "destructive"
      });
      return { success: false };
    }
  };

  // Enhanced move page to new parent
  const handleMovePage = async (pageId: string, newParentId: string | null) => {
    try {
      const page = pages.find(p => p.id === pageId);
      if (!page) {
        return { success: false };
      }

      const { data: result, error } = await supabase.rpc('move_page_to_parent_safe', {
        p_page_id: pageId,
        p_new_parent_id: newParentId,
        p_expected_version: page.version || 1
      });

      if (error) throw error;

      // Type assertion for the database function result - convert through unknown for safety
      const typedResult = result as unknown as DatabaseFunctionResult;

      if (typedResult.success) {
        toast({
          title: "Success",
          description: typedResult.message
        });
        fetchHierarchyData();
        return { success: true };
      } else {
        if (typedResult.code === 'VERSION_CONFLICT') {
          toast({
            title: "Page was modified",
            description: "Page was modified by another user. Please refresh and try again.",
            variant: "destructive"
          });
          fetchHierarchyData();
        } else {
          toast({
            title: "Cannot move",
            description: typedResult.error,
            variant: "destructive"
          });
        }
        return { success: false };
      }
    } catch (error) {
      console.error('Error moving page:', error);
      toast({
        title: "Error",
        description: "Failed to move page.",
        variant: "destructive"
      });
      return { success: false };
    }
  };

  const handleDuplicatePage = async (pageId: string) => {
    try {
      const { data: originalPage } = await supabase.from('pages').select('*').eq('id', pageId).single();
      if (originalPage) {
        const { error } = await supabase.from('pages').insert({
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
      const { error } = await supabase.from('pages').update({
        tags: ['archived']
      }).eq('id', pageId);
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
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input 
            placeholder="Search..." 
            value={searchQuery} 
            onChange={e => setSearchQuery(e.target.value)} 
            className="pl-9 bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50 h-9" 
          />
          
          {/* Search Results Dropdown */}
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
          return <div key={item.id} className={cn("flex items-center gap-3 px-2 py-2 text-sm rounded-md cursor-pointer transition-colors", "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground", isSelected && "bg-sidebar-accent text-sidebar-accent-foreground font-medium")} onClick={() => handleItemSelect({
            ...item,
            type: 'page'
          })}>
                <Icon className="h-4 w-4 text-sidebar-foreground/70" />
                <span className="text-zinc-50">{item.title}</span>
              </div>;
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
            {onCreatePage && <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={handleCreatePage} title="Create new page">
                <Plus className="h-3 w-3" />
              </Button>}
          </div>
        </div>
        
        <ScrollArea className="h-full">
          <div className="pb-16">
            {loading ? <div className="space-y-2">
                {[...Array(5)].map((_, i) => <div key={i} className="h-8 bg-sidebar-accent/20 rounded animate-pulse" />)}
              </div> : <div className="space-y-1">
                {filteredHierarchy.length > 0 ? filteredHierarchy.map(item => <EnhancedSidebarTreeItem key={item.id} item={item} level={0} onSelect={handleItemSelect} selectedId={selectedId} onCreateSubPage={onCreateSubPage} onCreatePageInEditor={onCreatePageInEditor} onDuplicatePage={handleDuplicatePage} onArchivePage={handleArchivePage} onCopyLink={handleCopyLink} onMovePage={handleMovePage} hierarchyData={hierarchyData} onRefreshData={fetchHierarchyData} siblings={filteredHierarchy} onMovePageUpDown={handleMovePageUpDown} />) : searchQuery ? <div className="text-center py-8 text-sidebar-foreground/50">
                    <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No results found</p>
                  </div> : <div className="text-center py-8 text-sidebar-foreground/50">
                    <FolderOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm mb-3">No content yet</p>
                    {onCreatePage && <Button variant="outline" size="sm" onClick={handleCreatePage}>
                        <Plus className="h-3 w-3 mr-1" />
                        Create first page
                      </Button>}
                  </div>}
              </div>}
          </div>
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button variant="ghost" className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent" onClick={() => handleItemSelect({
        id: 'settings',
        title: 'Settings',
        type: 'page'
      })}>
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>
  );
}
