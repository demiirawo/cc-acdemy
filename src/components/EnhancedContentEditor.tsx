import React, { useState, useRef, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  FileText,
  Settings,
  Lock,
  Globe
} from "lucide-react";
import { RecommendedReadingForm } from './RecommendedReadingForm';
import { RecommendedReadingSection } from './RecommendedReadingSection';

interface RecommendedReadingItem {
  title: string;
  description: string;
  type: 'link' | 'file';
  url?: string;
  fileUrl?: string;
  fileName?: string;
  category?: string; // Made optional to match database structure
}

interface EnhancedContentEditorProps {
  title?: string;
  content?: string;
  tags?: string[];
  recommendedReading?: RecommendedReadingItem[];
  isPublic?: boolean;
  onSave: (data: {
    title: string;
    content: string;
    tags: string[];
    recommendedReading: RecommendedReadingItem[];
    isPublic: boolean;
  }) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
}

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  tags = [],
  recommendedReading = [],
  isPublic = true,
  onSave, 
  onPreview,
  isEditing = true,
  pageId 
}: EnhancedContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [currentTags, setCurrentTags] = useState<string[]>(tags);
  const [currentRecommendedReading, setCurrentRecommendedReading] = useState<RecommendedReadingItem[]>(
    recommendedReading.map(item => ({
      ...item,
      category: item.category || 'General' // Default to 'General' if category is missing
    }))
  );
  const [currentIsPublic, setCurrentIsPublic] = useState(isPublic);
  const [newTag, setNewTag] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    const textarea = textareaRef.current;
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
    const textarea = textareaRef.current;
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
    if (newTag.trim() && !currentTags.includes(newTag.trim())) {
      setCurrentTags([...currentTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setCurrentTags(currentTags.filter(tag => tag !== tagToRemove));
  };

  const handleSave = () => {
    onSave({
      title: currentTitle,
      content: currentContent,
      tags: currentTags,
      recommendedReading: currentRecommendedReading,
      isPublic: currentIsPublic
    });
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
            <div className="flex gap-2 mb-4">
              {currentTags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>
          
          <Card className="p-6 mb-6">
            <div className="prose prose-lg max-w-none">
              <pre className="whitespace-pre-wrap text-foreground">{currentContent}</pre>
            </div>
          </Card>

          <RecommendedReadingSection 
            items={currentRecommendedReading}
          />
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentIsPublic(!currentIsPublic)}
              className="flex items-center gap-2"
            >
              {currentIsPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {currentIsPublic ? 'Public' : 'Private'}
            </Button>
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
        <div className="flex gap-2 mb-4 flex-wrap">
          {currentTags.map((tag) => (
            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
              {tag}
              <button
                onClick={() => removeTag(tag)}
                className="ml-1 text-xs hover:text-destructive"
              >
                ×
              </button>
            </Badge>
          ))}
          <div className="flex items-center gap-2">
            <Input
              placeholder="Add tag..."
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTag()}
              className="h-6 text-xs w-24"
            />
            <Button variant="outline" size="sm" onClick={addTag} className="h-6 text-xs">
              Add
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
        </div>
      </div>

      {/* Editor Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 p-4">
          <Card className="h-full">
            <Textarea
              ref={textareaRef}
              placeholder="Start writing your content here..."
              value={currentContent}
              onChange={(e) => setCurrentContent(e.target.value)}
              className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
            />
          </Card>
        </div>

        {/* Right sidebar for recommended reading */}
        <div className="w-80 border-l border-border p-4 overflow-auto">
          <RecommendedReadingForm
            items={currentRecommendedReading}
            onChange={setCurrentRecommendedReading}
          />
        </div>
      </div>
    </div>
  );
}
