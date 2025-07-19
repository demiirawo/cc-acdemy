import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, X, Link as LinkIcon, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

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

interface RecommendedReadingFormProps {
  items: RecommendedReadingItem[];
  onItemsChange: (items: RecommendedReadingItem[]) => void;
}

export function RecommendedReadingForm({ items, onItemsChange }: RecommendedReadingFormProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
  const { toast } = useToast();

  const addItem = () => {
    const newItem: RecommendedReadingItem = {
      title: '',
      description: '',
      type: activeTab === 'link' ? 'link' : 'file',
      category: 'General',
      ...(activeTab === 'link' ? { url: '' } : { fileUrl: '', fileName: '' })
    };
    onItemsChange([...items, newItem]);
  };

  const updateItem = (index: number, field: keyof RecommendedReadingItem, value: string) => {
    const updatedItems = [...items];
    (updatedItems[index] as any)[field] = value;
    onItemsChange(updatedItems);
  };

  const removeItem = (index: number) => {
    const updatedItems = items.filter((_, i) => i !== index);
    onItemsChange(updatedItems);
  };

  const handleFileUpload = async (index: number, file: File) => {
    try {
      // For demo purposes, we'll create a mock file URL
      // In a real implementation, you'd upload to your storage service
      const mockFileUrl = `https://example.com/files/${file.name}`;
      
      updateItem(index, 'fileUrl', mockFileUrl);
      updateItem(index, 'fileName', file.name);
      
      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
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
        {/* Tab buttons */}
        <div className="flex gap-2">
          <Button
            type="button"
            variant={activeTab === 'link' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('link')}
            className="flex items-center gap-2"
          >
            <LinkIcon className="h-4 w-4" />
            Link
          </Button>
          <Button
            type="button"
            variant={activeTab === 'file' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setActiveTab('file')}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            File
          </Button>
        </div>

        {/* Form fields for new item */}
        <div className="space-y-4 p-4 border border-border rounded-lg bg-muted/20">
          <div className="space-y-2">
            <Label htmlFor="new-title">Title</Label>
            <Input
              id="new-title"
              placeholder="Enter title"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-category">Category</Label>
            <Input
              id="new-category"
              placeholder="General"
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-description">Description</Label>
            <Textarea
              id="new-description"
              placeholder="Enter description"
              className="w-full"
              rows={3}
            />
          </div>

          {activeTab === 'link' && (
            <div className="space-y-2">
              <Label htmlFor="new-url">URL</Label>
              <Input
                id="new-url"
                type="url"
                placeholder="https://example.com"
                className="w-full"
              />
            </div>
          )}

          {activeTab === 'file' && (
            <div className="space-y-2">
              <Label htmlFor="new-file">File</Label>
              <Input
                id="new-file"
                type="file"
                className="w-full"
              />
            </div>
          )}

          <Button
            type="button"
            onClick={addItem}
            className="w-full"
            size="sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Reading Item
          </Button>
        </div>

        {/* Existing items */}
        {items.length > 0 && (
          <div className="space-y-4">
            {items.map((item, index) => (
              <div key={index} className="p-4 border border-border rounded-lg bg-background">
                <div className="flex items-start justify-between mb-4">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    {item.type === 'link' ? 'LINK' : 'FILE'} ITEM {index + 1}
                  </h4>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeItem(index)}
                    className="text-destructive hover:text-destructive/80"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      value={item.title}
                      onChange={(e) => updateItem(index, 'title', e.target.value)}
                      placeholder="Enter title"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Input
                      value={item.category || 'General'}
                      onChange={(e) => updateItem(index, 'category', e.target.value)}
                      placeholder="General"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Textarea
                      value={item.description}
                      onChange={(e) => updateItem(index, 'description', e.target.value)}
                      placeholder="Enter description"
                      rows={3}
                    />
                  </div>

                  {item.type === 'link' && (
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input
                        type="url"
                        value={item.url || ''}
                        onChange={(e) => updateItem(index, 'url', e.target.value)}
                        placeholder="https://example.com"
                      />
                    </div>
                  )}

                  {item.type === 'file' && (
                    <div className="space-y-2">
                      <Label>File</Label>
                      {item.fileName ? (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded">
                          <FileText className="h-4 w-4" />
                          <span className="text-sm">{item.fileName}</span>
                        </div>
                      ) : (
                        <Input
                          type="file"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              handleFileUpload(index, file);
                            }
                          }}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
