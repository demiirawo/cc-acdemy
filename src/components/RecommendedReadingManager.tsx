
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Plus, 
  Trash2, 
  Edit, 
  ExternalLink, 
  FileText, 
  Upload,
  GripVertical,
  Book,
  BookOpen
} from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { SortableItem } from "./ui/sortable-item";
import { cn } from "@/lib/utils";

export interface RecommendedReadingManagerProps {
  items: Array<{
    id?: string;
    title: string;
    description: string;
    type: 'link' | 'file' | 'document' | 'guide' | 'reference';
    url?: string;
    fileUrl?: string;
    fileName?: string;
    category?: string;
  }>;
  onChange: (
    newReading: Array<{
      id?: string;
      title: string;
      description: string;
      type: 'link' | 'file' | 'document' | 'guide' | 'reference';
      url?: string;
      fileUrl?: string;
      fileName?: string;
      category?: string;
    }>,
    newOrderedCategories: string[]
  ) => void;
  pageId: string;
}

export function RecommendedReadingManager({ 
  items, 
  onChange, 
  pageId 
}: RecommendedReadingManagerProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    title: '',
    description: '',
    type: 'link' as const,
    url: '',
    category: 'General'
  });
  const [showAddForm, setShowAddForm] = useState(false);
  const [categories, setCategories] = useState<string[]>(['General']);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Extract unique categories from items
  useEffect(() => {
    const uniqueCategories = Array.from(new Set([
      'General',
      ...items.map(item => item.category || 'General')
    ]));
    setCategories(uniqueCategories);
  }, [items]);

  const handleAddItem = () => {
    if (!newItem.title.trim() || !newItem.description.trim()) {
      toast({
        title: "Missing information",
        description: "Please fill in both title and description.",
        variant: "destructive"
      });
      return;
    }

    const itemToAdd = {
      id: Date.now().toString(),
      ...newItem,
      category: newItem.category || 'General'
    };

    const updatedItems = [...items, itemToAdd];
    const updatedCategories = Array.from(new Set([
      ...categories,
      itemToAdd.category
    ]));

    onChange(updatedItems, updatedCategories);
    
    setNewItem({
      title: '',
      description: '',
      type: 'link',
      url: '',
      category: 'General'
    });
    setShowAddForm(false);

    toast({
      title: "Item added",
      description: "Recommended reading item has been added."
    });
  };

  const handleRemoveItem = (id: string) => {
    const updatedItems = items.filter(item => item.id !== id);
    onChange(updatedItems, categories);
    
    toast({
      title: "Item removed",
      description: "Recommended reading item has been removed."
    });
  };

  const handleEditItem = (id: string, updates: Partial<typeof newItem>) => {
    const updatedItems = items.map(item => 
      item.id === id ? { ...item, ...updates } : item
    );
    onChange(updatedItems, categories);
    setEditingId(null);
  };

  const handleDragEnd = (event: any) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      const oldIndex = items.findIndex(item => item.id === active.id);
      const newIndex = items.findIndex(item => item.id === over.id);

      const reorderedItems = arrayMove(items, oldIndex, newIndex);
      onChange(reorderedItems, categories);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document': return <FileText className="h-4 w-4" />;
      case 'guide': return <Book className="h-4 w-4" />;
      case 'reference': return <BookOpen className="h-4 w-4" />;
      case 'file': return <Upload className="h-4 w-4" />;
      default: return <ExternalLink className="h-4 w-4" />;
    }
  };

  const groupedItems = categories.reduce((acc, category) => {
    acc[category] = items.filter(item => (item.category || 'General') === category);
    return acc;
  }, {} as Record<string, typeof items>);

  return (
    <div className="space-y-4">
      {/* Add New Item Form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <Input
              placeholder="Title"
              value={newItem.title}
              onChange={(e) => setNewItem(prev => ({ ...prev, title: e.target.value }))}
            />
            <Textarea
              placeholder="Description"
              value={newItem.description}
              onChange={(e) => setNewItem(prev => ({ ...prev, description: e.target.value }))}
              rows={2}
            />
            <div className="flex gap-2">
              <Select value={newItem.type} onValueChange={(value: any) => setNewItem(prev => ({ ...prev, type: value }))}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="link">Link</SelectItem>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="document">Document</SelectItem>
                  <SelectItem value="guide">Guide</SelectItem>
                  <SelectItem value="reference">Reference</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder="Category"
                value={newItem.category}
                onChange={(e) => setNewItem(prev => ({ ...prev, category: e.target.value }))}
                className="flex-1"
              />
            </div>
            {newItem.type === 'link' && (
              <Input
                placeholder="URL"
                value={newItem.url}
                onChange={(e) => setNewItem(prev => ({ ...prev, url: e.target.value }))}
              />
            )}
            <div className="flex gap-2">
              <Button onClick={handleAddItem} size="sm">
                Add Item
              </Button>
              <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add Button */}
      {!showAddForm && (
        <Button 
          variant="outline" 
          onClick={() => setShowAddForm(true)}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add Recommended Reading
        </Button>
      )}

      {/* Grouped Items */}
      {categories.map(category => {
        const categoryItems = groupedItems[category];
        if (categoryItems.length === 0) return null;

        return (
          <div key={category} className="space-y-2">
            <h4 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
              {category}
            </h4>
            
            <DndContext 
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext 
                items={categoryItems.map(item => item.id!)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {categoryItems.map((item) => (
                    <SortableItem key={item.id} id={item.id!}>
                      <Card className="group hover:shadow-sm transition-shadow">
                        <CardContent className="p-3">
                          {editingId === item.id ? (
                            <div className="space-y-2">
                              <Input
                                defaultValue={item.title}
                                onBlur={(e) => handleEditItem(item.id!, { title: e.target.value })}
                                className="font-medium"
                              />
                              <Textarea
                                defaultValue={item.description}
                                onBlur={(e) => handleEditItem(item.id!, { description: e.target.value })}
                                rows={2}
                              />
                              <Button 
                                size="sm" 
                                onClick={() => setEditingId(null)}
                              >
                                Done
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-start gap-3">
                              <GripVertical className="h-4 w-4 text-muted-foreground mt-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-grab" />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getTypeIcon(item.type)}
                                  <h5 className="font-medium text-sm truncate">{item.title}</h5>
                                  <Badge variant="secondary" className="text-xs">
                                    {item.type}
                                  </Badge>
                                </div>
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {item.description}
                                </p>
                                {item.url && (
                                  <a 
                                    href={item.url} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-xs text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 mt-1"
                                  >
                                    Open <ExternalLink className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setEditingId(item.id!)}
                                  className="h-6 w-6 p-0"
                                >
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveItem(item.id!)}
                                  className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </SortableItem>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>
        );
      })}

      {items.length === 0 && !showAddForm && (
        <div className="text-center py-8 text-muted-foreground">
          <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
          <p className="text-sm">No recommended reading items yet.</p>
          <p className="text-xs">Click "Add Recommended Reading" to get started.</p>
        </div>
      )}
    </div>
  );
}
