import { useState } from "react";
import { 
  Search, 
  Plus, 
  BookOpen, 
  Folder, 
  ChevronRight, 
  ChevronDown,
  Home,
  Clock,
  Settings,
  MessageSquare
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SidebarItem {
  id: string;
  title: string;
  type: 'space' | 'page' | 'folder';
  icon?: any;
  children?: SidebarItem[];
  href?: string;
}

const sampleData: SidebarItem[] = [
  {
    id: '1',
    title: 'Engineering',
    type: 'space',
    icon: Folder,
    children: [
      { id: '1-1', title: 'API Documentation', type: 'page', icon: BookOpen },
      { id: '1-2', title: 'Deployment Guide', type: 'page', icon: BookOpen },
      { 
        id: '1-3', 
        title: 'Best Practices', 
        type: 'folder',
        icon: Folder,
        children: [
          { id: '1-3-1', title: 'Code Review Guidelines', type: 'page', icon: BookOpen },
          { id: '1-3-2', title: 'Testing Standards', type: 'page', icon: BookOpen },
        ]
      }
    ]
  },
  {
    id: '2',
    title: 'Product',
    type: 'space',
    icon: Folder,
    children: [
      { id: '2-1', title: 'Product Requirements', type: 'page', icon: BookOpen },
      { id: '2-2', title: 'User Research', type: 'page', icon: BookOpen },
    ]
  },
  {
    id: '3',
    title: 'HR & Operations',
    type: 'space',
    icon: Folder,
    children: [
      { id: '3-1', title: 'Employee Handbook', type: 'page', icon: BookOpen },
      { id: '3-2', title: 'Onboarding Process', type: 'page', icon: BookOpen },
    ]
  }
];

const navigationItems: SidebarItem[] = [
  { id: 'home', title: 'Home', icon: Home, href: '/', type: 'page' },
  { id: 'recent', title: 'Recently Updated', icon: Clock, href: '/recent', type: 'page' },
  { id: 'chat', title: 'Care Cuddle AI', icon: MessageSquare, href: '/chat', type: 'page' },
  { id: 'glossary', title: 'Glossary', icon: BookOpen, href: '/glossary', type: 'page' },
];

interface SidebarTreeItemProps {
  item: SidebarItem;
  level: number;
  onSelect: (item: SidebarItem) => void;
  selectedId?: string;
}

function SidebarTreeItem({ item, level, onSelect, selectedId }: SidebarTreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Tree item state
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const Icon = item.icon || BookOpen;

  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
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
        <span className="truncate text-sidebar-foreground">{item.title}</span>
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface KnowledgeBaseSidebarProps {
  onItemSelect: (item: SidebarItem) => void;
  selectedId?: string;
}

export function KnowledgeBaseSidebar({ onItemSelect, selectedId }: KnowledgeBaseSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleItemSelect = (item: SidebarItem) => {
    // Only call onItemSelect for actual navigation items or real pages
    if (item.id === 'home' || item.id === 'recent' || item.id === 'tags' || item.id === 'chat' || item.id === 'glossary') {
      onItemSelect(item);
    } else if (item.type === 'page' && item.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // Only try to load real pages with valid UUIDs
      onItemSelect(item);
    } else if (item.type === 'space' && item.id.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {
      // Only try to load real spaces with valid UUIDs
      onItemSelect(item);
    }
  };

  return (
    <div className="w-64 bg-sidebar border-r border-sidebar-border flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 bg-gradient-primary rounded-lg flex items-center justify-center">
            <BookOpen className="h-4 w-4 text-primary-foreground" />
          </div>
          <h1 className="font-semibold text-sidebar-foreground">Care Cudde Academy</h1>
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
                onClick={() => handleItemSelect(item)}
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
            Spaces
          </h3>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-sidebar-foreground/70 hover:text-sidebar-foreground">
            <Plus className="h-3 w-3" />
          </Button>
        </div>
        
        <ScrollArea className="h-full">
          <div className="space-y-1">
            {sampleData.map((item) => (
              <SidebarTreeItem
                key={item.id}
                item={item}
                level={0}
                onSelect={handleItemSelect}
                selectedId={selectedId}
              />
            ))}
          </div>
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
