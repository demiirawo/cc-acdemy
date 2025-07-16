import { useState, useEffect } from "react";
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
  FolderOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
];

interface SidebarTreeItemProps {
  item: SidebarItem;
  level: number;
  onSelect: (item: SidebarItem) => void;
  selectedId?: string;
  onCreateSubPage?: (parentId: string) => void;
}

function SidebarTreeItem({ item, level, onSelect, selectedId, onCreateSubPage }: SidebarTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const Icon = item.icon || BookOpen;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors group",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          isSelected && "bg-sidebar-accent text-sidebar-accent-foreground",
          level > 0 && "ml-4"
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
        onClick={() => onSelect(item)}
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
        <Icon className="h-4 w-4 text-sidebar-foreground/70" />
        <span className="truncate text-sidebar-foreground flex-1">{item.title}</span>
        
        {/* Public indicator */}
        {item.is_public && (
          <Globe className="h-3 w-3 text-sidebar-foreground/50" />
        )}
        
        {/* Add sub-page button */}
        {(item.type === 'space' || item.type === 'page') && onCreateSubPage && (
          <Button
            variant="ghost"
            size="sm"
            className="h-4 w-4 p-0 opacity-0 group-hover:opacity-100 hover:bg-sidebar-accent transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onCreateSubPage(item.id);
            }}
          >
            <Plus className="h-3 w-3" />
          </Button>
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div>
          {item.children?.map((child) => (
            <SidebarTreeItem
              key={child.id}
              item={child}
              level={level + 1}
              onSelect={onSelect}
              selectedId={selectedId}
              onCreateSubPage={onCreateSubPage}
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
}

export function RealKnowledgeBaseSidebar({ 
  onItemSelect, 
  selectedId, 
  onCreatePage, 
  onCreateSubPage 
}: RealKnowledgeBaseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [pages, setPages] = useState<Page[]>([]);
  const [hierarchyData, setHierarchyData] = useState<SidebarItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchHierarchyData();
  }, []);

  const fetchHierarchyData = async () => {
    try {
      // Fetch spaces
      const { data: spacesData, error: spacesError } = await supabase
        .from('spaces')
        .select('*')
        .order('name');

      if (spacesError) throw spacesError;

      // Fetch pages
      const { data: pagesData, error: pagesError } = await supabase
        .from('pages')
        .select('*')
        .order('title');

      if (pagesError) throw pagesError;

      setSpaces(spacesData || []);
      setPages(pagesData || []);

      // Build hierarchy
      const hierarchy = buildHierarchy(spacesData || [], pagesData || []);
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

    // Add spaces with their pages
    spacesData.forEach(space => {
      const spaceItem: SidebarItem = {
        id: space.id,
        title: space.name,
        type: 'space',
        icon: Folder,
        children: []
      };

      // Find pages that belong to this space and have no parent
      const spacePages = pagesData.filter(page => 
        page.space_id === space.id && !page.parent_page_id
      );

      spaceItem.children = spacePages.map(page => buildPageHierarchy(page, pagesData));
      hierarchy.push(spaceItem);
    });

    // Add orphaned pages (no space and no parent)
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
      icon: BookOpen,
      is_public: page.is_public || false,
      parent_page_id: page.parent_page_id,
      space_id: page.space_id,
      children: children.length > 0 ? children : undefined
    };
  };

  const handleItemSelect = (item: SidebarItem) => {
    // Only call onItemSelect for navigation items or real database items with valid UUIDs
    if (item.id === 'home' || item.id === 'recent' || item.id === 'tags' || item.id === 'people') {
      onItemSelect(item);
    } else if (item.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // Valid UUID - safe to pass to database
      onItemSelect(item);
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
          <h1 className="font-semibold text-sidebar-foreground">Knowledge Base</h1>
        </div>
        
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-sidebar-foreground/50" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/50"
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
                  isSelected && "bg-sidebar-accent text-sidebar-accent-foreground"
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
            {onCreatePage && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-6 w-6 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
                onClick={onCreatePage}
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
                    <Button variant="outline" size="sm" onClick={onCreatePage}>
                      <Plus className="h-3 w-3 mr-1" />
                      Create first page
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <Button
          variant="ghost"
          className="w-full justify-start text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        >
          <Settings className="h-4 w-4 mr-2" />
          Settings
        </Button>
      </div>
    </div>
  );
}