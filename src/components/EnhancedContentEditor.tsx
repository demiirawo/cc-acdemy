import { useState, useEffect, useRef, useCallback } from "react";
import { 
  Bold, 
  Italic, 
  Underline, 
  List, 
  ListOrdered,
  Quote,
  Code,
  Link,
  Image,
  Heading1,
  Heading2,
  Heading3,
  Save,
  Eye,
  MoreHorizontal,
  Plus,
  X,
  FileText,
  ExternalLink,
  Upload,
  Hash,
  Settings,
  Palette,
  Type,
  Eye as EyeIcon,
  EyeOff,
  ChevronDown,
  ChevronUp,
  GripVertical,
  Edit,
  Trash2,
  FileDown,
  Globe,
  Lock,
  Users,
  Shield
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface MediaFile {
  id: string;
  url: string;
  name: string;
  type: string;
}

interface ContentEditorProps {
  title?: string;
  content?: string;
  tags?: string[];
  recommendedReading?: Array<{
    id?: string;
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
    type?: string;
    category?: string;
  }>;
  categoryOrder?: string[];
  onSave: (title: string, content: string, recommendedReading?: Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
    type?: string;
    category?: string;
  }>, orderedCategories?: string[], tags?: string[]) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
}

interface SortableItemProps {
  id: string;
  children: React.ReactNode;
}

function SortableItem({ id, children }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="relative">
      {children}
    </div>
  );
}

export function EnhancedContentEditor({
  title = "",
  content = "",
  tags: initialTags = [],
  recommendedReading: initialRecommendedReading = [],
  categoryOrder = [],
  onSave,
  onPreview,
  isEditing = true,
  pageId
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const { toast } = useToast();
  
  // Remove conflicting auto-save mechanism - use only manual save
  const titleRef = useRef(title);
  const contentRef = useRef(content);
  
  const [tags, setTags] = useState<string[]>(initialTags || []);
  const [tagInput, setTagInput] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [showAdvancedToolbar, setShowAdvancedToolbar] = useState(false);
  const [selectedFontSize, setSelectedFontSize] = useState("14");
  const [recommendedReading, setRecommendedReading] = useState<Array<{title: string, url?: string, description: string, type: 'link' | 'file', fileName?: string, fileUrl?: string, category?: string}>>(initialRecommendedReading?.map(item => ({
    ...item,
    type: (item.type as 'link' | 'file') || (item.url ? 'link' : 'file')
  })) || []);
  const [newRecommendation, setNewRecommendation] = useState({title: '', url: '', description: '', type: 'link' as 'link' | 'file', fileName: '', fileUrl: '', category: 'General'});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState({title: '', url: '', description: '', type: 'link' as 'link' | 'file', fileName: '', fileUrl: '', category: 'General'});
  const [showRecommendedReading, setShowRecommendedReading] = useState(false);
  const [orderedCategories, setOrderedCategories] = useState<string[]>(categoryOrder || []);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // Update refs when props change
  useEffect(() => {
    titleRef.current = title;
    contentRef.current = content;
    setCurrentTitle(title);
    setCurrentContent(content);
    setTags(initialTags || []);
    setRecommendedReading(initialRecommendedReading?.map(item => ({
      ...item,
      type: (item.type as 'link' | 'file') || (item.url ? 'link' : 'file')
    })) || []);
    setOrderedCategories(categoryOrder || []);
  }, [title, content, initialTags, initialRecommendedReading, categoryOrder]);

  // Remove auto-save completely - only use manual save
  const handleManualSave = useCallback(async () => {
    console.log('Manual save triggered with:', {
      title: currentTitle,
      content: currentContent,
      tags,
      recommendedReading,
      orderedCategories
    });
    
    try {
      await onSave(currentTitle, currentContent, recommendedReading, orderedCategories, tags);
      
      toast({
        title: "Page saved",
        description: "",
      });
    } catch (error) {
      console.error('Error saving page:', error);
      toast({
        title: "Save failed", 
        description: "Could not save changes. Please try again.",
        variant: "destructive",
      });
    }
  }, [currentTitle, currentContent, tags, recommendedReading, orderedCategories, onSave, toast]);

  const toolbarItems = [
    { icon: Heading1, action: () => insertText('# '), label: 'Heading 1' },
    { icon: Heading2, action: () => insertText('## '), label: 'Heading 2' },
    { icon: Heading3, action: () => insertText('### '), label: 'Heading 3' },
    { type: 'separator' },
    { icon: Bold, action: () => wrapText('**', '**'), label: 'Bold' },
    { icon: Italic, action: () => wrapText('*', '*'), label: 'Italic' },
    { icon: Underline, action: () => wrapText('<u>', '</u>'), label: 'Underline' },
    { type: 'separator' },
    { icon: List, action: () => insertText('- '), label: 'Bullet List' },
    { icon: ListOrdered, action: () => insertText('1. '), label: 'Numbered List' },
    { icon: Quote, action: () => insertText('> '), label: 'Quote' },
    { icon: Code, action: () => wrapText('`', '`'), label: 'Inline Code' },
    { type: 'separator' },
    { icon: Link, action: () => insertLink(), label: 'Link' },
    { icon: Image, action: () => insertImage(), label: 'Image' },
  ];

  const insertText = (text: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = currentContent.substring(0, start) + text + currentContent.substring(end);
    setCurrentContent(newContent);
    
    setTimeout(() => {
      textarea.setSelectionRange(start + text.length, start + text.length);
      textarea.focus();
    }, 0);
  };

  const wrapText = (prefix: string, suffix: string) => {
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = currentContent.substring(start, end);
    const newText = prefix + selectedText + suffix;
    const newContent = currentContent.substring(0, start) + newText + currentContent.substring(end);
    setCurrentContent(newContent);
    
    setTimeout(() => {
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, end + prefix.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
      textarea.focus();
    }, 0);
  };

  const insertLink = () => {
    const url = prompt('Enter URL:');
    const text = prompt('Enter link text:') || url;
    if (url) {
      insertText(`[${text}](${url})`);
    }
  };

  const insertImage = () => {
    const url = prompt('Enter image URL:');
    const alt = prompt('Enter alt text:') || 'Image';
    if (url) {
      insertText(`![${alt}](${url})`);
    }
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags([...tags, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = recommendedReading.findIndex(item => 
        `${item.title}-${item.category || 'General'}` === active.id
      );
      const newIndex = recommendedReading.findIndex(item => 
        `${item.title}-${item.category || 'General'}` === over.id
      );

      if (oldIndex !== -1 && newIndex !== -1) {
        setRecommendedReading(arrayMove(recommendedReading, oldIndex, newIndex));
      }
    }
  };

  const addRecommendation = () => {
    if (newRecommendation.title.trim() && newRecommendation.description.trim()) {
      const recommendation = {
        ...newRecommendation,
        title: newRecommendation.title.trim(),
        description: newRecommendation.description.trim(),
        category: newRecommendation.category || 'General'
      };
      
      setRecommendedReading([...recommendedReading, recommendation]);
      
      if (!orderedCategories.includes(recommendation.category)) {
        setOrderedCategories([...orderedCategories, recommendation.category]);
      }
      
      setNewRecommendation({title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '', category: 'General'});
    }
  };

  const updateRecommendation = (index: number) => {
    if (editingItem.title.trim() && editingItem.description.trim()) {
      const updated = [...recommendedReading];
      updated[index] = {
        ...editingItem,
        title: editingItem.title.trim(),
        description: editingItem.description.trim(),
        category: editingItem.category || 'General'
      };
      setRecommendedReading(updated);
      
      if (!orderedCategories.includes(editingItem.category)) {
        setOrderedCategories([...orderedCategories, editingItem.category]);
      }
      
      setEditingIndex(null);
      setEditingItem({title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '', category: 'General'});
    }
  };

  const removeRecommendation = (index: number) => {
    const updated = [...recommendedReading];
    updated.splice(index, 1);
    setRecommendedReading(updated);
  };

  const startEditing = (index: number) => {
    setEditingIndex(index);
    setEditingItem({...recommendedReading[index]});
  };

  const cancelEditing = () => {
    setEditingIndex(null);
    setEditingItem({title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '', category: 'General'});
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, isNewRecommendation: boolean = true) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `chat-documents/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('chat-documents')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('chat-documents')
        .getPublicUrl(filePath);

      if (isNewRecommendation) {
        setNewRecommendation(prev => ({
          ...prev,
          type: 'file',
          fileName: file.name,
          fileUrl: publicUrl,
          url: publicUrl
        }));
      } else {
        setEditingItem(prev => ({
          ...prev,
          type: 'file',
          fileName: file.name,
          fileUrl: publicUrl,
          url: publicUrl
        }));
      }

      toast({
        title: "File uploaded",
        description: `${file.name} has been uploaded successfully.`,
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: "Upload failed",
        description: "Failed to upload file. Please try again.",
        variant: "destructive",
      });
    }
  };

  const groupedRecommendations = recommendedReading.reduce((acc, item, index) => {
    const category = item.category || 'General';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push({ ...item, originalIndex: index });
    return acc;
  }, {} as Record<string, Array<any>>);

  const addCategory = () => {
    if (newCategoryName.trim() && !orderedCategories.includes(newCategoryName.trim())) {
      setOrderedCategories([...orderedCategories, newCategoryName.trim()]);
      setNewCategoryName('');
    }
  };

  const removeCategory = (categoryToRemove: string) => {
    setOrderedCategories(orderedCategories.filter(cat => cat !== categoryToRemove));
    setRecommendedReading(recommendedReading.map(item => 
      item.category === categoryToRemove ? { ...item, category: 'General' } : item
    ));
  };

  const moveCategoryUp = (index: number) => {
    if (index > 0) {
      const newOrder = [...orderedCategories];
      [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
      setOrderedCategories(newOrder);
    }
  };

  const moveCategoryDown = (index: number) => {
    if (index < orderedCategories.length - 1) {
      const newOrder = [...orderedCategories];
      [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
      setOrderedCategories(newOrder);
    }
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
          </div>
          
          <Card className="p-6">
            <div className="prose prose-lg max-w-none">
              <pre className="whitespace-pre-wrap text-foreground">{currentContent}</pre>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Editor Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-2xl">
            <Input
              placeholder="Page title..."
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              className="text-2xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0"
            />
          </div>
          
          <div className="flex items-center gap-2">
            {onPreview && (
              <Button variant="outline" size="sm" onClick={onPreview}>
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            )}
            <Button onClick={handleManualSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 p-2 bg-muted rounded-lg">
          {toolbarItems.map((item, index) => {
            if (item.type === 'separator') {
              return <Separator key={index} orientation="vertical" className="h-6 mx-1" />;
            }
            
            const Icon = item.icon!;
            return (
              <Button
                key={index}
                variant="ghost"
                size="sm"
                onClick={item.action}
                className="h-8 w-8 p-0"
                title={item.label}
              >
                <Icon className="h-4 w-4" />
              </Button>
            );
          })}
          
          <Separator orientation="vertical" className="h-6 mx-1" />
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowAdvancedToolbar(!showAdvancedToolbar)}
            className="h-8 px-2"
            title="Advanced Tools"
          >
            <Settings className="h-4 w-4 mr-1" />
            {showAdvancedToolbar ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
        </div>

        {/* Advanced Toolbar */}
        {showAdvancedToolbar && (
          <div className="mt-2 p-3 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                <Label htmlFor="font-size" className="text-sm">Font Size:</Label>
                <Select value={selectedFontSize} onValueChange={setSelectedFontSize}>
                  <SelectTrigger className="w-20 h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="12">12px</SelectItem>
                    <SelectItem value="14">14px</SelectItem>
                    <SelectItem value="16">16px</SelectItem>
                    <SelectItem value="18">18px</SelectItem>
                    <SelectItem value="20">20px</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {/* Tags Section */}
        <div className="mt-4 p-3 bg-muted/30 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Hash className="h-4 w-4" />
            <Label className="text-sm font-medium">Tags</Label>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {tags.map((tag, index) => (
              <Badge key={index} variant="secondary" className="flex items-center gap-1">
                {tag}
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 hover:bg-destructive hover:text-destructive-foreground"
                  onClick={() => removeTag(tag)}
                >
                  <X className="h-3 w-3" />
                </Button>
              </Badge>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add a tag..."
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              className="flex-1"
            />
            <Button onClick={addTag} size="sm">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Recommended Reading Section */}
        <Collapsible open={showRecommendedReading} onOpenChange={setShowRecommendedReading}>
          <div className="mt-4 p-3 bg-muted/30 rounded-lg">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="flex items-center gap-2 p-0 h-auto text-sm font-medium">
                <FileText className="h-4 w-4" />
                Recommended Reading ({recommendedReading.length})
                {showRecommendedReading ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
            
            <CollapsibleContent className="mt-3 space-y-4">
              {/* Category Management */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Categories</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCategoryManager(!showCategoryManager)}
                  >
                    <Settings className="h-4 w-4 mr-1" />
                    Manage
                  </Button>
                </div>
                
                {showCategoryManager && (
                  <div className="p-3 border rounded-lg space-y-2">
                    <div className="flex gap-2">
                      <Input
                        placeholder="New category name..."
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && addCategory()}
                        className="flex-1"
                      />
                      <Button onClick={addCategory} size="sm">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    
                    <div className="space-y-1">
                      {orderedCategories.map((category, index) => (
                        <div key={category} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                          <span className="text-sm">{category}</span>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => moveCategoryUp(index)}
                              disabled={index === 0}
                            >
                              <ChevronUp className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0"
                              onClick={() => moveCategoryDown(index)}
                              disabled={index === orderedCategories.length - 1}
                            >
                              <ChevronDown className="h-3 w-3" />
                            </Button>
                            {category !== 'General' && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                onClick={() => removeCategory(category)}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Add New Recommendation */}
              <div className="p-3 border rounded-lg space-y-3">
                <Label className="text-sm font-medium">Add New Recommendation</Label>
                
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    placeholder="Title"
                    value={newRecommendation.title}
                    onChange={(e) => setNewRecommendation({...newRecommendation, title: e.target.value})}
                  />
                  <Select value={newRecommendation.category} onValueChange={(value) => setNewRecommendation({...newRecommendation, category: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="General">General</SelectItem>
                      {orderedCategories.filter(cat => cat !== 'General').map(category => (
                        <SelectItem key={category} value={category}>{category}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <Textarea
                  placeholder="Description"
                  value={newRecommendation.description}
                  onChange={(e) => setNewRecommendation({...newRecommendation, description: e.target.value})}
                  className="min-h-[60px]"
                />
                
                <div className="flex items-center gap-3">
                  <Select value={newRecommendation.type} onValueChange={(value: 'link' | 'file') => setNewRecommendation({...newRecommendation, type: value})}>
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="link">Link</SelectItem>
                      <SelectItem value="file">File</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  {newRecommendation.type === 'link' ? (
                    <Input
                      placeholder="URL"
                      value={newRecommendation.url}
                      onChange={(e) => setNewRecommendation({...newRecommendation, url: e.target.value})}
                      className="flex-1"
                    />
                  ) : (
                    <div className="flex-1 flex items-center gap-2">
                      <Input
                        type="file"
                        onChange={(e) => handleFileUpload(e, true)}
                        className="flex-1"
                      />
                      {newRecommendation.fileName && (
                        <span className="text-sm text-muted-foreground">{newRecommendation.fileName}</span>
                      )}
                    </div>
                  )}
                  
                  <Button onClick={addRecommendation} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Existing Recommendations */}
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <div className="space-y-4">
                  {orderedCategories.filter(category => groupedRecommendations[category]?.length > 0).map(category => (
                    <div key={category} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {category}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          ({groupedRecommendations[category]?.length || 0} items)
                        </span>
                      </div>
                      
                      <SortableContext
                        items={groupedRecommendations[category]?.map(item => `${item.title}-${category}`) || []}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="space-y-2">
                          {groupedRecommendations[category]?.map((item, idx) => (
                            <SortableItem key={`${item.title}-${category}`} id={`${item.title}-${category}`}>
                              <div className="p-3 border rounded-lg bg-background">
                                {editingIndex === item.originalIndex ? (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-2 gap-3">
                                      <Input
                                        value={editingItem.title}
                                        onChange={(e) => setEditingItem({...editingItem, title: e.target.value})}
                                        placeholder="Title"
                                      />
                                      <Select value={editingItem.category || 'General'} onValueChange={(value) => setEditingItem({...editingItem, category: value})}>
                                        <SelectTrigger>
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="General">General</SelectItem>
                                          {orderedCategories.filter(cat => cat !== 'General').map(cat => (
                                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    
                                    <Textarea
                                      value={editingItem.description}
                                      onChange={(e) => setEditingItem({...editingItem, description: e.target.value})}
                                      placeholder="Description"
                                      className="min-h-[60px]"
                                    />
                                    
                                    <div className="flex items-center gap-3">
                                      <Select value={editingItem.type} onValueChange={(value: 'link' | 'file') => setEditingItem({...editingItem, type: value})}>
                                        <SelectTrigger className="w-32">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="link">Link</SelectItem>
                                          <SelectItem value="file">File</SelectItem>
                                        </SelectContent>
                                      </Select>
                                      
                                      {editingItem.type === 'link' ? (
                                        <Input
                                          value={editingItem.url || ''}
                                          onChange={(e) => setEditingItem({...editingItem, url: e.target.value})}
                                          placeholder="URL"
                                          className="flex-1"
                                        />
                                      ) : (
                                        <div className="flex-1 flex items-center gap-2">
                                          <Input
                                            type="file"
                                            onChange={(e) => handleFileUpload(e, false)}
                                            className="flex-1"
                                          />
                                          {editingItem.fileName && (
                                            <span className="text-sm text-muted-foreground">{editingItem.fileName}</span>
                                          )}
                                        </div>
                                      )}
                                      
                                      <Button onClick={() => updateRecommendation(item.originalIndex)} size="sm">
                                        <Save className="h-4 w-4" />
                                      </Button>
                                      <Button onClick={cancelEditing} variant="outline" size="sm">
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex items-start justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1">
                                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                                        {item.type === 'link' ? (
                                          <ExternalLink className="h-4 w-4 text-blue-500" />
                                        ) : (
                                          <FileDown className="h-4 w-4 text-green-500" />
                                        )}
                                        <h4 className="font-medium text-sm truncate">{item.title}</h4>
                                      </div>
                                      <p className="text-sm text-muted-foreground line-clamp-2 ml-6">{item.description}</p>
                                      {item.url && (
                                        <div className="ml-6 mt-1">
                                          <a 
                                            href={item.url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-xs text-blue-500 hover:underline truncate block max-w-xs"
                                          >
                                            {item.fileName || item.url}
                                          </a>
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="flex items-center gap-1">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0"
                                        onClick={() => startEditing(item.originalIndex)}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 hover:bg-destructive hover:text-destructive-foreground"
                                        onClick={() => removeRecommendation(item.originalIndex)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </SortableItem>
                          ))}
                        </div>
                      </SortableContext>
                    </div>
                  ))}
                </div>
              </DndContext>
            </CollapsibleContent>
          </div>
        </Collapsible>
      </div>

      {/* Editor Content */}
      <div className="flex-1 p-4 overflow-hidden">
        <Card className="h-full">
          <Textarea
            placeholder="Start writing your content here..."
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
            style={{ fontSize: `${selectedFontSize}px` }}
          />
        </Card>
      </div>
    </div>
  );
}
