import React, { useState, useRef, useEffect } from 'react';
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
  File,
  Trash2,
  Copy,
  ArrowUp,
  ArrowDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
// Generate unique ID without external dependency
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

interface RecommendedReadingItem {
  title: string;
  url?: string;
  description: string;
  type: 'link' | 'file';
  fileName?: string;
  fileUrl?: string;
  category: string;
  order?: number; // Add order field to track position
}

interface ContentEditorProps {
  initialTitle?: string;
  initialContent?: string;
  onSave: (title: string, content: string, recommendedReading: RecommendedReadingItem[]) => void;
  onPreview?: () => void;
  isPreview?: boolean;
}

interface EnhancedContentEditorProps extends ContentEditorProps {
  initialRecommendedReading?: RecommendedReadingItem[];
  className?: string;
  title?: string;
  content?: string;
  pageId?: string;
  isEditing?: boolean;
}

const defaultTags = ['engineering', 'documentation'];

export function EnhancedContentEditor({
  initialTitle = "",
  initialContent = "",
  initialRecommendedReading = [],
  title: propTitle = "",
  content: propContent = "",
  onSave,
  onPreview,
  isPreview = false,
  className = "",
  pageId,
  isEditing
}: EnhancedContentEditorProps) {
  const [title, setTitle] = useState(propTitle || initialTitle);
  const [content, setContent] = useState(propContent || initialContent);
  const [tags, setTags] = useState<string[]>(defaultTags);
  const [recommendedReading, setRecommendedReading] = useState<RecommendedReadingItem[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Initialize recommended reading with order field if not present
  useEffect(() => {
    if (initialRecommendedReading.length > 0) {
      const readingWithOrder = initialRecommendedReading.map((item, index) => ({
        ...item,
        order: item.order !== undefined ? item.order : index
      }));
      
      // Sort by order field to ensure correct display order
      readingWithOrder.sort((a, b) => (a.order || 0) - (b.order || 0));
      
      setRecommendedReading(readingWithOrder);
    }
  }, [initialRecommendedReading]);

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
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newContent = content.substring(0, start) + text + content.substring(end);
    setContent(newContent);
    
    // Reset cursor position
    setTimeout(() => {
      textarea.setSelectionRange(start + text.length, start + text.length);
      textarea.focus();
    }, 0);
  };

  const wrapText = (prefix: string, suffix: string) => {
    if (!textareaRef.current) return;

    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = content.substring(start, end);
    const newText = prefix + selectedText + suffix;
    const newContent = content.substring(0, start) + newText + content.substring(end);
    setContent(newContent);
    
    // Reset cursor position
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

  const addRecommendedReading = () => {
    const newItem: RecommendedReadingItem = {
      title: '',
      url: '',
      description: '',
      type: 'link',
      category: 'General',
      order: recommendedReading.length // Set order based on current position
    };
    setRecommendedReading([...recommendedReading, newItem]);
  };

  const updateRecommendedReading = (index: number, field: keyof RecommendedReadingItem, value: string) => {
    const updated = [...recommendedReading];
    if (field === 'type') {
      updated[index] = { ...updated[index], [field]: value as 'link' | 'file' };
    } else {
      updated[index] = { ...updated[index], [field]: value };
    }
    
    // Maintain order field
    if (!updated[index].order && updated[index].order !== 0) {
      updated[index].order = index;
    }
    
    setRecommendedReading(updated);
  };

  const removeRecommendedReading = (index: number) => {
    const updated = recommendedReading.filter((_, i) => i !== index);
    // Reassign order values to maintain sequence
    const reorderedItems = updated.map((item, i) => ({
      ...item,
      order: i
    }));
    setRecommendedReading(reorderedItems);
  };

  const duplicateRecommendedReading = (index: number) => {
    const itemToDuplicate = recommendedReading[index];
    const duplicated = {
      ...itemToDuplicate,
      title: `${itemToDuplicate.title} (Copy)`,
      order: recommendedReading.length // Add at the end
    };
    setRecommendedReading([...recommendedReading, duplicated]);
  };

  const handleFileUpload = (index: number, file: File) => {
    // Here you would typically handle the file upload to a storage service
    // and get the URL to the uploaded file.
    const fileUrl = URL.createObjectURL(file); // Temporary local URL

    const updated = [...recommendedReading];
    updated[index] = {
      ...updated[index],
      fileName: file.name,
      fileUrl: fileUrl,
      type: 'file',
      url: fileUrl, // Store the URL for display
    };
    setRecommendedReading(updated);
  };

  const clearFile = (index: number) => {
    const updated = [...recommendedReading];
    updated[index] = {
      ...updated[index],
      fileName: undefined,
      fileUrl: undefined,
      type: 'link',
      url: '',
    };
    setRecommendedReading(updated);
  };

  const moveRecommendedReadingUp = (index: number) => {
    if (index > 0) {
      const updated = [...recommendedReading];
      // Swap the items
      [updated[index - 1], updated[index]] = [updated[index], updated[index - 1]];
      
      // Update order fields to reflect new positions
      updated[index - 1].order = index - 1;
      updated[index].order = index;
      
      setRecommendedReading(updated);
    }
  };

  const moveRecommendedReadingDown = (index: number) => {
    if (index < recommendedReading.length - 1) {
      const updated = [...recommendedReading];
      // Swap the items
      [updated[index], updated[index + 1]] = [updated[index + 1], updated[index]];
      
      // Update order fields to reflect new positions
      updated[index].order = index;
      updated[index + 1].order = index + 1;
      
      setRecommendedReading(updated);
    }
  };

  const RecommendedReadingItemComponent = ({ item, index }: { item: RecommendedReadingItem; index: number }) => {
    return (
      <div key={index} className="grid grid-cols-12 gap-4 items-center mb-4">
        <div className="col-span-3">
          <Input
            type="text"
            placeholder="Title"
            value={item.title}
            onChange={(e) => updateRecommendedReading(index, 'title', e.target.value)}
          />
        </div>
        <div className="col-span-3">
          {item.type === 'link' ? (
            <Input
              type="text"
              placeholder="URL"
              value={item.url || ''}
              onChange={(e) => updateRecommendedReading(index, 'url', e.target.value)}
            />
          ) : (
            <>
              <Input
                type="text"
                placeholder="File"
                value={item.fileName || ''}
                disabled
              />
              <input
                type="file"
                className="hidden"
                id={`file-upload-${index}`}
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(index, e.target.files[0]);
                  }
                }}
              />
              <Label htmlFor={`file-upload-${index}`} className="cursor-pointer text-blue-500 hover:text-blue-700">
                Upload File
              </Label>
              {item.fileName && (
                <Button variant="ghost" size="sm" onClick={() => clearFile(index)}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              )}
            </>
          )}
        </div>
        <div className="col-span-2">
          <Select value={item.type} onValueChange={(value) => updateRecommendedReading(index, 'type', value)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="link">Link</SelectItem>
              <SelectItem value="file">File</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2">
          <Input
            type="text"
            placeholder="Category"
            value={item.category}
            onChange={(e) => updateRecommendedReading(index, 'category', e.target.value)}
          />
        </div>
        <div className="col-span-2 flex items-center space-x-2">
          <Button variant="outline" size="icon" onClick={() => moveRecommendedReadingUp(index)} disabled={index === 0}>
            <ArrowUp className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => moveRecommendedReadingDown(index)} disabled={index === recommendedReading.length - 1}>
            <ArrowDown className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => duplicateRecommendedReading(index)}>
            <Copy className="h-4 w-4" />
          </Button>
          <Button variant="destructive" size="icon" onClick={() => removeRecommendedReading(index)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    );
  };

  const groupRecommendedReadingByCategory = (items: RecommendedReadingItem[]) => {
    console.log('Grouping items:', items.map((item, i) => `${i}: ${item.title} (${item.category}) [order: ${item.order}]`));
    
    // Sort items by order field first to ensure proper sequence
    const sortedItems = [...items].sort((a, b) => (a.order || 0) - (b.order || 0));
    
    const categories: string[] = [];
    const grouped: { [key: string]: any[] } = {};
    
    // Process items in the sorted order to capture first occurrence
    sortedItems.forEach((item, index) => {
      const category = item.category || 'General';
      console.log(`Processing item ${index}: "${item.title}" - Category: "${category}" - Order: ${item.order}`);
      
      // Only add category to the order list on first occurrence
      if (!categories.includes(category)) {
        categories.push(category);
        console.log(`First occurrence of category "${category}" at position ${index}`);
      }
      
      // Initialize array if first item in this category
      if (!grouped[category]) {
        grouped[category] = [];
      }
      
      grouped[category].push(item);
    });
    
    console.log('Final category order:', categories);
    console.log('Grouped items:', grouped);
    
    return { categories, grouped };
  };

  const handleSave = () => {
    console.log('Saving with recommended reading:', recommendedReading);
    
    // Ensure all items have order field before saving
    const readingWithOrder = recommendedReading.map((item, index) => ({
      ...item,
      order: item.order !== undefined ? item.order : index
    }));
    
    onSave(title, content, readingWithOrder);
  };

  if (isPreview) {
    const { categories, grouped } = groupRecommendedReadingByCategory(recommendedReading);

    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{title}</h1>
            <div className="flex gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>
          
          <Card className="p-6 mb-6">
            <div className="prose prose-lg max-w-none">
              <pre className="whitespace-pre-wrap text-foreground">{content}</pre>
            </div>
          </Card>

          {recommendedReading.length > 0 && (
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-foreground mb-4">Recommended Reading</h2>
              {categories.map((category) => (
                <div key={category} className="mb-4">
                  <h3 className="text-xl font-semibold text-foreground mb-2">{category}</h3>
                  <ul>
                    {grouped[category].map((item: RecommendedReadingItem, index: number) => (
                      <li key={index} className="mb-2">
                        {item.type === 'link' ? (
                          <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {item.title}
                          </a>
                        ) : (
                          <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                            {item.title} (File)
                          </a>
                        )}
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex-1 flex flex-col overflow-hidden", className)}>
      {/* Editor Header */}
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1 max-w-2xl">
            <Input
              placeholder="Page title..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-2xl font-bold border-none p-0 h-auto shadow-none focus-visible:ring-0"
            />
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onPreview}>
              <Eye className="h-4 w-4 mr-2" />
              Preview
            </Button>
            <Button onClick={handleSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
            <Button variant="ghost" size="sm">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="flex gap-2 mb-4">
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
          <Button variant="outline" size="sm" className="h-6 text-xs">
            + Add tag
          </Button>
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
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 p-4 overflow-hidden">
        <Card className="h-full">
          <Textarea
            ref={textareaRef}
            placeholder="Start writing your content here..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
          />
        </Card>
      </div>

      {/* Recommended Reading Section */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-foreground">Recommended Reading</h2>
          <Button variant="outline" size="sm" onClick={addRecommendedReading}>
            + Add Item
          </Button>
        </div>
        <div>
          {recommendedReading.map((item, index) => (
            <RecommendedReadingItemComponent key={index} item={item} index={index} />
          ))}
        </div>
      </div>
    </div>
  );
}
