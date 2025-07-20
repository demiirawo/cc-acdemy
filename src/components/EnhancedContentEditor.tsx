import { useState } from "react";
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
  MoreHorizontal
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RecommendedReadingForm } from "@/components/RecommendedReadingForm";
import { RecommendedReadingManager } from "@/components/RecommendedReadingManager";
import { RecommendedReadingSection } from "@/components/RecommendedReadingSection";

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  recommendedReading?: { title: string; url: string }[];
  onRecommendedReadingChange?: (items: { title: string; url: string }[]) => void;
}

export function EnhancedContentEditor({ 
  title = "", 
  content = "", 
  onSave, 
  onPreview,
  isEditing = true,
  recommendedReading = [],
  onRecommendedReadingChange
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>(['engineering', 'documentation']);
  const [activeTab, setActiveTab] = useState("editor");

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
    
    // Reset cursor position
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

  const handleSave = () => {
    onSave(currentTitle, currentContent);
  };

  const handleRecommendedReadingChange = (items: { title: string; url: string }[]) => {
    onRecommendedReadingChange?.(items);
  };

  const processIframes = (htmlContent: string): string => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');
    const iframes = doc.querySelectorAll('iframe');
    
    iframes.forEach((iframe) => {
      console.log('Processing iframe:', {
        src: iframe.src,
        attributeHeight: iframe.getAttribute('height'),
        styleHeight: iframe.style.height,
        currentStyle: iframe.getAttribute('style')
      });

      // Get height from attribute or existing style
      const attributeHeight = iframe.getAttribute('height');
      const existingStyle = iframe.getAttribute('style') || '';
      const existingHeight = iframe.style.height;
      
      // Determine the height to preserve
      let heightValue = null;
      if (attributeHeight) {
        heightValue = attributeHeight.includes('px') ? attributeHeight : `${attributeHeight}px`;
      } else if (existingHeight) {
        heightValue = existingHeight;
      }

      // Build CSS styles additively
      const baseStyles = 'width: 100%; border: 1px solid #e5e7eb; border-radius: 8px;';
      let finalStyle = baseStyles;
      
      // Add height if we found one
      if (heightValue) {
        finalStyle += ` height: ${heightValue};`;
        console.log('Preserving height:', heightValue);
      } else {
        finalStyle += ' height: 400px;'; // Default height only if no height specified
        console.log('Using default height: 400px');
      }
      
      // Preserve any other existing styles (except width, border, border-radius, height which we're setting)
      if (existingStyle) {
        const existingStyleParts = existingStyle.split(';').filter(style => {
          const trimmed = style.trim().toLowerCase();
          return trimmed && 
                 !trimmed.startsWith('width') && 
                 !trimmed.startsWith('border') && 
                 !trimmed.startsWith('height');
        });
        if (existingStyleParts.length > 0) {
          finalStyle += ' ' + existingStyleParts.join(';') + ';';
        }
      }

      iframe.setAttribute('style', finalStyle);
      
      console.log('Final iframe style:', finalStyle);
    });
    
    return doc.documentElement.outerHTML;
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-foreground mb-2">{currentTitle}</h1>
            <div className="flex gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary">{tag}</Badge>
              ))}
            </div>
          </div>
          
          <Card className="p-6">
            <div 
              className="prose prose-lg max-w-none overflow-visible"
              dangerouslySetInnerHTML={{ __html: processIframes(currentContent) }}
            />
          </Card>

          {/* Recommended Reading Section */}
          {recommendedReading && recommendedReading.length > 0 && (
            <div className="mt-8">
              <RecommendedReadingSection items={recommendedReading} />
            </div>
          )}
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
      <div className="flex-1 flex overflow-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <TabsList className="grid w-full grid-cols-4 mx-4 mt-2">
            <TabsTrigger value="editor">Editor</TabsTrigger>
            <TabsTrigger value="preview">Preview</TabsTrigger>
            <TabsTrigger value="recommended">Recommended Reading</TabsTrigger>
            <TabsTrigger value="manager">Manager</TabsTrigger>
          </TabsList>
          
          <TabsContent value="editor" className="flex-1 p-4 overflow-hidden">
            <Card className="h-full">
              <Textarea
                placeholder="Start writing your content here..."
                value={currentContent}
                onChange={(e) => setCurrentContent(e.target.value)}
                className="h-full resize-none border-none shadow-none focus-visible:ring-0 text-base leading-relaxed"
              />
            </Card>
          </TabsContent>
          
          <TabsContent value="preview" className="flex-1 p-4 overflow-auto">
            <Card className="p-6 h-full overflow-visible">
              <div 
                className="prose prose-lg max-w-none overflow-visible"
                dangerouslySetInnerHTML={{ __html: processIframes(currentContent) }}
              />
            </Card>
          </TabsContent>
          
          <TabsContent value="recommended" className="flex-1 p-4 overflow-auto">
            <RecommendedReadingForm 
              items={recommendedReading || []}
              onChange={handleRecommendedReadingChange}
            />
          </TabsContent>

          <TabsContent value="manager" className="flex-1 p-4 overflow-auto">
            <RecommendedReadingManager />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
