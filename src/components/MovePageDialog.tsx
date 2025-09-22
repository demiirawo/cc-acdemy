import { useState, useEffect } from "react";
import { Folder, FileText, ChevronRight, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface MoveTarget {
  id: string;
  title: string;
  type: 'space' | 'page' | 'root';
  children?: MoveTarget[];
  level: number;
}

interface MovePageDialogProps {
  isOpen: boolean;
  onClose: () => void;
  pageId: string;
  currentPageTitle: string;
}

interface TreeItemProps {
  item: MoveTarget;
  onSelect: (target: MoveTarget) => void;
  selectedId?: string;
  pageId: string; // To prevent selecting the page itself or its children
}

function TreeItem({ item, onSelect, selectedId, pageId }: TreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = item.children && item.children.length > 0;
  const isSelected = selectedId === item.id;
  const isDisabled = item.id === pageId; // Can't move page to itself

  return (
    <div className="space-y-1">
      <div
        className={cn(
          "flex items-center gap-2 px-2 py-1.5 text-sm rounded-md cursor-pointer transition-colors",
          "hover:bg-accent hover:text-accent-foreground",
          isSelected && "bg-accent text-accent-foreground font-medium",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
        style={{ paddingLeft: `${item.level * 12 + 8}px` }}
        onClick={() => !isDisabled && onSelect(item)}
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

        {item.type === 'root' ? (
          <Folder className="h-4 w-4 text-blue-500 flex-shrink-0" />
        ) : item.type === 'space' ? (
          <Folder className="h-4 w-4 text-purple-500 flex-shrink-0" />
        ) : (
          <FileText className="h-4 w-4 text-gray-500 flex-shrink-0" />
        )}

        <span className="truncate flex-1">{item.title}</span>
      </div>

      {hasChildren && isExpanded && (
        <div className="ml-2">
          {item.children?.map((child) => (
            <TreeItem
              key={child.id}
              item={child}
              onSelect={onSelect}
              selectedId={selectedId}
              pageId={pageId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function MovePageDialog({ isOpen, onClose, pageId, currentPageTitle }: MovePageDialogProps) {
  const [moveTargets, setMoveTargets] = useState<MoveTarget[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<MoveTarget | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      fetchMoveTargets();
    }
  }, [isOpen, pageId]);

  const fetchMoveTargets = async () => {
    try {
      const [spacesResponse, pagesResponse] = await Promise.all([
        supabase.from('spaces').select('*').order('name'),
        supabase.from('pages').select('*').order('sort_order', { ascending: true })
      ]);

      if (spacesResponse.error) throw spacesResponse.error;
      if (pagesResponse.error) throw pagesResponse.error;

      const spaces = spacesResponse.data || [];
      const pages = pagesResponse.data || [];

      // Build hierarchy for move targets
      const targets: MoveTarget[] = [];

      // Add root level option
      targets.push({
        id: 'root',
        title: 'Root Level (No parent)',
        type: 'root',
        level: 0
      });

      // Add spaces and their pages
      spaces.forEach((space) => {
        const spaceTarget: MoveTarget = {
          id: space.id,
          title: space.name,
          type: 'space',
          level: 0,
          children: []
        };

        // Get root pages for this space
        const spacePages = pages.filter(page => 
          page.space_id === space.id && 
          !page.parent_page_id &&
          page.id !== pageId // Exclude the page being moved
        );

        spaceTarget.children = spacePages.map(page => 
          buildPageTarget(page, pages, pageId, 1)
        );

        targets.push(spaceTarget);
      });

      // Add orphaned root pages (no space, no parent)
      const orphanedPages = pages.filter(page => 
        !page.space_id && 
        !page.parent_page_id &&
        page.id !== pageId
      );

      orphanedPages.forEach(page => {
        targets.push(buildPageTarget(page, pages, pageId, 0));
      });

      setMoveTargets(targets);
    } catch (error) {
      console.error('Error fetching move targets:', error);
      toast({
        title: "Error",
        description: "Failed to load move destinations",
        variant: "destructive"
      });
    }
  };

  const buildPageTarget = (page: any, allPages: any[], excludePageId: string, level: number): MoveTarget => {
    const children = allPages
      .filter(p => p.parent_page_id === page.id && p.id !== excludePageId)
      .map(childPage => buildPageTarget(childPage, allPages, excludePageId, level + 1));

    return {
      id: page.id,
      title: page.title,
      type: 'page',
      level,
      children: children.length > 0 ? children : undefined
    };
  };

  const handleMove = async () => {
    if (!selectedTarget) return;

    setLoading(true);
    try {
      let updateData: any = {};

      if (selectedTarget.type === 'root') {
        // Move to root level
        updateData = {
          parent_page_id: null,
          space_id: null
        };
      } else if (selectedTarget.type === 'space') {
        // Move to space root
        updateData = {
          parent_page_id: null,
          space_id: selectedTarget.id
        };
      } else if (selectedTarget.type === 'page') {
        // Move under a page
        const { data: targetPage } = await supabase
          .from('pages')
          .select('space_id')
          .eq('id', selectedTarget.id)
          .single();

        updateData = {
          parent_page_id: selectedTarget.id,
          space_id: targetPage?.space_id || null
        };
      }

      const { error } = await supabase
        .from('pages')
        .update(updateData)
        .eq('id', pageId);

      if (error) throw error;

      console.log('Page moved successfully:', { pageId, updateData });

      toast({
        title: "Success",
        description: `"${currentPageTitle}" moved successfully`
      });

      // Trigger multiple refresh signals to ensure updates
      window.dispatchEvent(new CustomEvent('pageUpdated'));
      
      // Also trigger a delayed refresh to handle any timing issues
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('pageUpdated'));
      }, 200);
      
      onClose();
    } catch (error) {
      console.error('Error moving page:', error);
      toast({
        title: "Error",
        description: "Failed to move page",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move "{currentPageTitle}"</DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Choose where to move this page:
          </p>

          <ScrollArea className="h-64 border rounded-md">
            <div className="p-2">
              {moveTargets.map((target) => (
                <TreeItem
                  key={target.id}
                  item={target}
                  onSelect={setSelectedTarget}
                  selectedId={selectedTarget?.id}
                  pageId={pageId}
                />
              ))}
            </div>
          </ScrollArea>

          {selectedTarget && (
            <div className="mt-4 p-3 bg-muted rounded-md">
              <p className="text-sm">
                <strong>Moving to:</strong> {selectedTarget.title}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button 
            onClick={handleMove} 
            disabled={!selectedTarget || loading}
          >
            {loading ? "Moving..." : "Move Page"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}