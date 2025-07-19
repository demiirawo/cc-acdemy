
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
  onSubmit: (item: Omit<RecommendedReadingItem, 'id'>) => void;
  initialData?: RecommendedReadingItem | null;
  onCancel: () => void;
}

export function RecommendedReadingForm({ onSubmit, initialData, onCancel }: RecommendedReadingFormProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'file'>(
    initialData?.type === 'file' ? 'file' : 'link'
  );
  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    description: initialData?.description || '',
    category: initialData?.category || 'General',
    url: initialData?.url || '',
    fileUrl: initialData?.fileUrl || '',
    fileName: initialData?.fileName || ''
  });
  const { toast } = useToast();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({
        title: "Title required",
        description: "Please enter a title for the reading item.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === 'link' && !formData.url.trim()) {
      toast({
        title: "URL required",
        description: "Please enter a URL for the link.",
        variant: "destructive",
      });
      return;
    }

    if (activeTab === 'file' && !formData.fileUrl.trim()) {
      toast({
        title: "File required",
        description: "Please upload a file.",
        variant: "destructive",
      });
      return;
    }

    const submitData: Omit<RecommendedReadingItem, 'id'> = {
      title: formData.title,
      description: formData.description,
      type: activeTab,
      category: formData.category,
      ...(activeTab === 'link' ? { url: formData.url } : { fileUrl: formData.fileUrl, fileName: formData.fileName })
    };

    onSubmit(submitData);
  };

  const handleFileUpload = async (file: File) => {
    try {
      // For demo purposes, we'll create a mock file URL
      // In a real implementation, you'd upload to your storage service
      const mockFileUrl = `https://example.com/files/${file.name}`;
      
      setFormData(prev => ({
        ...prev,
        fileUrl: mockFileUrl,
        fileName: file.name
      }));
      
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
          {initialData ? 'Edit Reading Item' : 'Add Reading Item'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
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

          {/* First row: Category → Title → Link/File */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Input
                id="category"
                value={formData.category}
                onChange={(e) => setFormData(prev => ({ ...prev, category: e.target.value }))}
                placeholder="General"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Enter title"
                required
              />
            </div>

            {activeTab === 'link' && (
              <div className="space-y-2">
                <Label htmlFor="url">Link</Label>
                <Input
                  id="url"
                  type="url"
                  value={formData.url}
                  onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com"
                  required
                />
              </div>
            )}

            {activeTab === 'file' && (
              <div className="space-y-2">
                <Label htmlFor="file">File</Label>
                {formData.fileName ? (
                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                    <FileText className="h-4 w-4" />
                    <span className="text-sm">{formData.fileName}</span>
                  </div>
                ) : (
                  <Input
                    id="file"
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleFileUpload(file);
                      }
                    }}
                  />
                )}
              </div>
            )}
          </div>

          {/* Second row: Description (full width) */}
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Enter description"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" className="flex-1">
              <Plus className="h-4 w-4 mr-2" />
              {initialData ? 'Update Item' : 'Add Item'}
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
