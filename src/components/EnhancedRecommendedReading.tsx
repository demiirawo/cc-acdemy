import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { validateUrl, validateText } from "@/lib/security";
import { 
  ExternalLink, 
  FileText, 
  Download, 
  Plus, 
  Trash2, 
  Upload,
  Link as LinkIcon,
  Check,
  AlertCircle
} from "lucide-react";

interface RecommendedReadingItem {
  id?: string;
  title: string;
  description: string;
  type: 'link' | 'file';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string;
}

interface EnhancedRecommendedReadingProps {
  items: RecommendedReadingItem[];
  onChange: (items: RecommendedReadingItem[]) => void;
  editable?: boolean;
}

export function EnhancedRecommendedReading({ 
  items, 
  onChange, 
  editable = true 
}: EnhancedRecommendedReadingProps) {
  const [newItem, setNewItem] = useState<Partial<RecommendedReadingItem>>({
    type: 'link',
    category: 'general'
  });
  const [isAdding, setIsAdding] = useState(false);
  const [bulkUrls, setBulkUrls] = useState('');
  const [showBulkImport, setShowBulkImport] = useState(false);
  const { toast } = useToast();

  const categories = ['general', 'documentation', 'tutorial', 'reference'];

  const handleItemClick = (item: RecommendedReadingItem, e: React.MouseEvent) => {
    e.preventDefault();
    
    if (item.url) {
      let url = item.url;
      if (!url.match(/^https?:\/\//i)) {
        url = 'https://' + url;
      }
      
      try {
        new URL(url);
        window.open(url, '_blank', 'noopener,noreferrer');
        
        // Visual feedback
        const target = e.currentTarget as HTMLElement;
        const originalBg = target.style.backgroundColor;
        target.style.backgroundColor = 'hsl(var(--primary))';
        target.style.color = 'white';
        setTimeout(() => {
          target.style.backgroundColor = originalBg;
          target.style.color = '';
        }, 200);
        
        toast({
          title: "Opening link",
          description: `Opening ${item.title}...`,
          duration: 2000,
        });
        
      } catch (error) {
        toast({
          title: "Invalid URL",
          description: "The URL appears to be invalid",
          variant: "destructive",
        });
      }
    } else if (item.fileUrl) {
      window.open(item.fileUrl, '_blank');
    }
  };

  const addNewItem = () => {
    if (!newItem.title || !newItem.description) {
      toast({
        title: "Missing fields",
        description: "Please fill in title and description",
        variant: "destructive",
      });
      return;
    }

    if (newItem.type === 'link' && newItem.url) {
      const isValidUrl = validateUrl(newItem.url);
      if (!isValidUrl) {
        toast({
          title: "Invalid URL",
          description: "Please enter a valid HTTP or HTTPS URL",
          variant: "destructive",
        });
        return;
      }
    }

    const item: RecommendedReadingItem = {
      id: Date.now().toString(),
      title: validateText(newItem.title || ''),
      description: validateText(newItem.description || ''),
      type: newItem.type || 'link',
      url: newItem.url,
      category: newItem.category || 'general',
      fileUrl: newItem.fileUrl,
      fileName: newItem.fileName,
    };

    onChange([...items, item]);
    setNewItem({ type: 'link', category: 'general' });
    setIsAdding(false);
    
    toast({
      title: "Added",
      description: "Recommended reading item added successfully",
    });
  };

  const removeItem = (id: string) => {
    onChange(items.filter(item => item.id !== id));
    toast({
      title: "Removed",
      description: "Item removed from recommended reading",
    });
  };

  const handleBulkImport = () => {
    const urls = bulkUrls.split('\n').filter(url => url.trim());
    let validCount = 0;
    
    const newItems: RecommendedReadingItem[] = urls.map(url => {
      const trimmedUrl = url.trim();
      const urlToTest = trimmedUrl.match(/^https?:\/\//i) ? trimmedUrl : 'https://' + trimmedUrl;
      
      if (validateUrl(urlToTest)) {
        validCount++;
        try {
          const urlObj = new URL(urlToTest);
          return {
            id: Date.now().toString() + Math.random(),
            title: urlObj.hostname.replace('www.', ''),
            description: `Imported from ${urlObj.hostname}`,
            type: 'link' as const,
            url: trimmedUrl,
            category: 'general'
          };
        } catch {
          return null;
        }
      }
      return null;
    }).filter(Boolean) as RecommendedReadingItem[];

    if (newItems.length > 0) {
      onChange([...items, ...newItems]);
      setBulkUrls('');
      setShowBulkImport(false);
      
      toast({
        title: "Bulk import complete",
        description: `Added ${newItems.length} valid URLs`,
      });
    } else {
      toast({
        title: "No valid URLs",
        description: "Please check your URLs and try again",
        variant: "destructive",
      });
    }
  };

  const groupedItems = categories.map(category => ({
    category,
    items: items.filter(item => item.category === category || (!item.category && category === 'general'))
  })).filter(group => group.items.length > 0);

  if (!editable && items.length === 0) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Recommended Reading
          </CardTitle>
          {editable && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowBulkImport(!showBulkImport)}
              >
                <Upload className="h-4 w-4 mr-2" />
                Bulk Import
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAdding(!isAdding)}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Link
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Bulk Import Section */}
        {showBulkImport && editable && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">Paste URLs (one per line)</label>
                  <Textarea
                    placeholder="https://example.com&#10;https://docs.example.com&#10;https://tutorial.example.com"
                    value={bulkUrls}
                    onChange={(e) => setBulkUrls(e.target.value)}
                    rows={4}
                  />
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleBulkImport} size="sm">
                    <Check className="h-4 w-4 mr-2" />
                    Import URLs
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setShowBulkImport(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Add New Item Section */}
        {isAdding && editable && (
          <Card className="border-dashed">
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Title"
                    value={newItem.title || ''}
                    onChange={(e) => setNewItem({ ...newItem, title: e.target.value })}
                  />
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newItem.category || 'general'}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                  >
                    {categories.map(cat => (
                      <option key={cat} value={cat}>
                        {cat.charAt(0).toUpperCase() + cat.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  placeholder="URL"
                  value={newItem.url || ''}
                  onChange={(e) => setNewItem({ ...newItem, url: e.target.value })}
                />
                <Textarea
                  placeholder="Description"
                  value={newItem.description || ''}
                  onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  rows={2}
                />
                <div className="flex gap-2">
                  <Button onClick={addNewItem} size="sm">
                    <Check className="h-4 w-4 mr-2" />
                    Add
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setIsAdding(false)}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Items by Category */}
        {groupedItems.map(group => (
          <div key={group.category}>
            <div className="flex items-center gap-2 mb-3">
              <Badge variant="outline" className="text-xs">
                {group.category.charAt(0).toUpperCase() + group.category.slice(1)}
              </Badge>
              <div className="flex-1 h-px bg-border"></div>
            </div>
            <div className="space-y-3">
              {group.items.map((item, index) => (
                <div 
                  key={item.id || index} 
                  className="group p-4 border border-border rounded-lg bg-card hover:bg-muted/40 transition-all cursor-pointer"
                  onClick={(e) => handleItemClick(item, e)}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      {item.type === 'file' || item.fileUrl ? (
                        <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Download className="h-4 w-4 text-primary" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 bg-blue-50 dark:bg-blue-950 rounded-lg flex items-center justify-center">
                          <ExternalLink className="h-4 w-4 text-blue-600 dark:text-blue-400" />
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
                              {item.description}
                            </p>
                          )}
                          {(item.url || item.fileUrl) && (
                            <div className="mt-2 flex items-center gap-2">
                              {item.url && (
                                <div className="flex items-center gap-1 text-xs text-primary">
                                  <LinkIcon className="h-3 w-3" />
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
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="sm"
                            className="h-8"
                          >
                            {item.type === 'file' || item.fileUrl ? 'Download' : 'Open'}
                          </Button>
                          {editable && (
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="h-8 text-destructive hover:text-destructive"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeItem(item.id || '');
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {items.length === 0 && !isAdding && (
          <div className="text-center py-8 text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No recommended reading items yet.</p>
            {editable && (
              <p className="text-sm">Click "Add Link" to get started.</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}