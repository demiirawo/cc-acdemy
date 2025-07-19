
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ExternalLink, FileText, Download } from "lucide-react";

interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file' | 'document' | 'guide' | 'reference';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category: string; // Updated to be required
}

interface RecommendedReadingSectionProps {
  items: RecommendedReadingItem[];
  onItemClick?: (item: RecommendedReadingItem) => void;
}

// Function to get clean text preview (strip HTML formatting)
const getCleanTextPreview = (htmlContent: string, maxLength: number = 150): string => {
  if (!htmlContent) return '';
  
  // Create a temporary element to parse HTML
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = htmlContent;
  
  // Remove script and style elements
  const scripts = tempDiv.querySelectorAll('script, style');
  scripts.forEach(el => el.remove());
  
  // Get text content and clean it up
  let textContent = tempDiv.textContent || tempDiv.innerText || '';
  
  // Remove extra whitespace and line breaks
  textContent = textContent.replace(/\s+/g, ' ').trim();
  
  // Truncate if necessary
  if (textContent.length > maxLength) {
    textContent = textContent.substring(0, maxLength).trim() + '...';
  }
  
  return textContent;
};

// Function to group items by category
const groupItemsByCategory = (items: RecommendedReadingItem[]) => {
  const grouped = items.reduce((acc, item) => {
    // Default to 'General' if category is missing or empty
    const category = item.category?.trim() || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {} as Record<string, RecommendedReadingItem[]>);

  // Sort categories alphabetically, but put 'General' last
  const sortedCategories = Object.keys(grouped).sort((a, b) => {
    if (a === 'General') return 1;
    if (b === 'General') return -1;
    return a.localeCompare(b);
  });

  return sortedCategories.map(category => ({
    category,
    items: grouped[category]
  }));
};

export function RecommendedReadingSection({ items, onItemClick }: RecommendedReadingSectionProps) {
  if (!items || items.length === 0) {
    return null;
  }

  const handleItemClick = (item: RecommendedReadingItem, e: React.MouseEvent) => {
    e.preventDefault();
    
    if (item.url) {
      // Add protocol if missing
      let url = item.url;
      if (!url.match(/^https?:\/\//i)) {
        url = 'https://' + url;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } else if (item.fileUrl) {
      window.open(item.fileUrl, '_blank', 'noopener,noreferrer');
    }
    
    onItemClick?.(item);
  };

  const groupedItems = groupItemsByCategory(items);

  return (
    <Card className="mt-8">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Recommended Reading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {groupedItems.map(({ category, items: categoryItems }) => (
            <div key={category} className="space-y-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide border-b border-border pb-1">
                {category}
              </h3>
              <div className="space-y-3">
                {categoryItems.map((item, index) => (
                  <div 
                    key={item.id || `${category}-${index}`} 
                    className="group p-4 border border-border rounded-lg bg-muted/20 hover:bg-muted/40 transition-colors cursor-pointer"
                    onClick={(e) => handleItemClick(item, e)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-1">
                        {item.type === 'file' || item.fileUrl ? (
                          <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                            <Download className="h-4 w-4 text-primary" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                            <ExternalLink className="h-4 w-4 text-blue-600" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                              {item.title}
                            </h4>
                            {item.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {getCleanTextPreview(item.description, 100)}
                              </p>
                            )}
                            {(item.url || item.fileUrl) && (
                              <div className="mt-2 flex items-center gap-2">
                                {item.url && (
                                  <div className="flex items-center gap-1 text-xs text-primary">
                                    <ExternalLink className="h-3 w-3" />
                                    <span className="truncate max-w-[200px]">{item.url}</span>
                                  </div>
                                )}
                                {item.fileUrl && item.fileName && (
                                  <div className="flex items-center gap-1 text-xs text-primary">
                                    <FileText className="h-3 w-3" />
                                    <span className="truncate max-w-[200px]">{item.fileName}</span>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {item.type === 'file' || item.fileUrl ? 'Download' : 'Open'}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
