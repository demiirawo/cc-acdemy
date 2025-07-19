import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X, FileText } from "lucide-react";

interface RecommendedReadingItem {
  title: string;
  description: string;
  type: 'link' | 'file';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category: string;
}

interface RecommendedReadingFormProps {
  items: RecommendedReadingItem[];
  onChange: (items: RecommendedReadingItem[]) => void;
}

export function RecommendedReadingForm({ items, onChange }: RecommendedReadingFormProps) {
  const [newItem, setNewItem] = useState<RecommendedReadingItem>({
    title: '',
    description: '',
    type: 'link',
    url: '',
    category: ''
  });

  const addItem = () => {
    if (!newItem.title.trim() || !newItem.category.trim()) return;
    
    if (newItem.type === 'link' && !newItem.url?.trim()) return;
    if (newItem.type === 'file' && (!newItem.fileUrl?.trim() || !newItem.fileName?.trim())) return;

    onChange([...items, { ...newItem }]);
    setNewItem({
      title: '',
      description: '',
      type: 'link',
      url: '',
      category: ''
    });
  };

  const removeItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    onChange(updatedItems);
  };

  const updateNewItem = (field: keyof RecommendedReadingItem, value: string) => {
    setNewItem(prev => ({ ...prev, [field]: value }));
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Recommended Reading
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Existing Items */}
        {items.length > 0 && (
          <div className="space-y-2">
            {items.map((item, index) => (
              <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-muted/20">
                <div className="flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className="text-sm text-muted-foreground">
                    Category: {item.category} • Type: {item.type}
                  </div>
                  {item.description && (
                    <div className="text-sm text-muted-foreground mt-1">{item.description}</div>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => removeItem(index)}
                  className="text-destructive hover:text-destructive"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Add New Item Form */}
        <div className="space-y-4 p-4 border-2 border-dashed rounded-lg">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Plus className="h-4 w-4" />
            Add Reading
          </div>

          <Tabs value={newItem.type} onValueChange={(value) => updateNewItem('type', value)}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="link">Link</TabsTrigger>
              <TabsTrigger value="file">File</TabsTrigger>
            </TabsList>
            
            <TabsContent value="link" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newItem.title}
                    onChange={(e) => updateNewItem('title', e.target.value)}
                    placeholder="Enter title"
                  />
                </div>
                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Input
                    id="category"
                    value={newItem.category}
                    onChange={(e) => updateNewItem('category', e.target.value)}
                    placeholder="e.g., Training, Policies, Resources"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="url">URL *</Label>
                <Input
                  id="url"
                  type="url"
                  value={newItem.url || ''}
                  onChange={(e) => updateNewItem('url', e.target.value)}
                  placeholder="https://example.com"
                />
              </div>
              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={newItem.description}
                  onChange={(e) => updateNewItem('description', e.target.value)}
                  placeholder="Brief description of the content"
                  rows={2}
                />
              </div>
            </TabsContent>
            
            <TabsContent value="file" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="title-file">Title *</Label>
                  <Input
                    id="title-file"
                    value={newItem.title}
                    onChange={(e) => updateNewItem('title', e.target.value)}
                    placeholder="Enter title"
                  />
                </div>
                <div>
                  <Label htmlFor="category-file">Category *</Label>
                  <Input
                    id="category-file"
                    value={newItem.category}
                    onChange={(e) => updateNewItem('category', e.target.value)}
                    placeholder="e.g., Training, Policies, Resources"
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="file-url">File URL *</Label>
                <Input
                  id="file-url"
                  value={newItem.fileUrl || ''}
                  onChange={(e) => updateNewItem('fileUrl', e.target.value)}
                  placeholder="https://example.com/file.pdf"
                />
              </div>
              <div>
                <Label htmlFor="file-name">File Name *</Label>
                <Input
                  id="file-name"
                  value={newItem.fileName || ''}
                  onChange={(e) => updateNewItem('fileName', e.target.value)}
                  placeholder="document.pdf"
                />
              </div>
              <div>
                <Label htmlFor="description-file">Description</Label>
                <Textarea
                  id="description-file"
                  value={newItem.description}
                  onChange={(e) => updateNewItem('description', e.target.value)}
                  placeholder="Brief description of the content"
                  rows={2}
                />
              </div>
            </TabsContent>
          </Tabs>

          <Button 
            onClick={addItem}
            disabled={!newItem.title.trim() || !newItem.category.trim() || 
              (newItem.type === 'link' && !newItem.url?.trim()) ||
              (newItem.type === 'file' && (!newItem.fileUrl?.trim() || !newItem.fileName?.trim()))}
            className="w-full"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Reading
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
