
import { FileText, Link as LinkIcon, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file' | 'document' | 'guide' | 'reference';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string;
}

interface RecommendedReadingListProps {
  items: RecommendedReadingItem[];
  orderedCategories?: string[];
  onEdit?: (item: RecommendedReadingItem) => void;
  onDelete?: (id: string) => void;
  onReorderCategories?: (categories: string[]) => void;
  isEditing?: boolean;
}

export function RecommendedReadingList({ 
  items, 
  orderedCategories = [], 
  onEdit, 
  onDelete, 
  onReorderCategories,
  isEditing = false 
}: RecommendedReadingListProps) {
  const getIcon = (type: string) => {
    switch (type) {
      case 'link':
        return <LinkIcon className="h-4 w-4 text-muted-foreground" />;
      case 'file':
      default:
        return <FileText className="h-4 w-4 text-muted-foreground" />;
    }
  };

  if (items.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p>No recommended reading items yet.</p>
      </div>
    );
  }

  // Group items by category
  const groupedItems = items.reduce((acc, item) => {
    const category = item.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, RecommendedReadingItem[]>);

  // Use ordered categories or default to alphabetical
  const categories = orderedCategories.length > 0 
    ? orderedCategories.filter(cat => groupedItems[cat])
    : Object.keys(groupedItems).sort();

  return (
    <div className="space-y-4">
      {categories.map((category) => (
        <div key={category} className="space-y-2">
          <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            {category}
          </h4>
          <div className="space-y-2">
            {groupedItems[category].map((item, index) => (
              <div key={item.id || index} className="flex items-start gap-3 p-3 bg-muted/30 rounded-md border border-border/50">
                <div className="flex-shrink-0 mt-0.5">
                  {getIcon(item.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h5 className="font-medium text-foreground text-sm">{item.title}</h5>
                  {item.description && (
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                  )}
                  {(item.url || item.fileUrl) && (
                    <div className="text-xs text-primary mt-1 truncate">
                      {item.url || item.fileName}
                    </div>
                  )}
                </div>
                {isEditing && onEdit && onDelete && (
                  <div className="flex gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onEdit(item)}
                      className="h-8 w-8 p-0"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDelete(item.id!)}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive/80"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
