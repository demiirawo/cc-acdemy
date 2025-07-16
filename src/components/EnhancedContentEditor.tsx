import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Link,
  Image,
  Code,
  Quote,
  Save,
  Eye,
  Youtube,
  FileText,
  Upload,
  Trash2
} from "lucide-react";

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string) => void;
  onPreview?: () => void;
  isEditing?: boolean;
}

interface MediaFile {
  id: string;
  name: string;
  type: string;
  url: string;
}

export function EnhancedContentEditor({
  title = "",
  content = "",
  onSave,
  onPreview,
  isEditing = true
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const insertLink = () => {
    const url = prompt("Enter URL:");
    const text = prompt("Enter link text:") || url;
    if (url) {
      insertText(`[${text}](${url})`);
    }
  };

  const insertImage = () => {
    const url = prompt("Enter image URL:");
    const alt = prompt("Enter alt text:") || "Image";
    if (url) {
      insertText(`![${alt}](${url})`);
    }
  };

  const insertYouTube = () => {
    const url = prompt("Enter YouTube URL:");
    if (url) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        insertText(`\n<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe>\n`);
      } else {
        toast({
          title: "Invalid YouTube URL",
          description: "Please enter a valid YouTube URL",
          variant: "destructive",
        });
      }
    }
  };

  const toolbarItems = [
    { icon: Bold, action: () => wrapText("**", "**"), tooltip: "Bold" },
    { icon: Italic, action: () => wrapText("*", "*"), tooltip: "Italic" },
    { icon: Underline, action: () => wrapText("<u>", "</u>"), tooltip: "Underline" },
    { icon: List, action: () => insertText("- "), tooltip: "Bullet List" },
    { icon: ListOrdered, action: () => insertText("1. "), tooltip: "Numbered List" },
    { icon: Quote, action: () => insertText("> "), tooltip: "Quote" },
    { icon: Code, action: () => wrapText("```\n", "\n```"), tooltip: "Code Block" },
    { icon: Link, action: insertLink, tooltip: "Link" },
    { icon: Image, action: insertImage, tooltip: "Image" },
    { icon: Youtube, action: insertYouTube, tooltip: "YouTube Video" },
    { icon: FileText, action: () => fileInputRef.current?.click(), tooltip: "Upload File" }
  ];

  const insertText = (text: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newText = currentContent.substring(0, start) + text + currentContent.substring(end);
    
    setCurrentContent(newText);
    
    // Set cursor position after inserted text
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + text.length, start + text.length);
    }, 0);
  };

  const wrapText = (prefix: string, suffix: string) => {
    if (!textareaRef.current) return;
    
    const textarea = textareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = currentContent.substring(start, end);
    const newText = currentContent.substring(0, start) + prefix + selectedText + suffix + currentContent.substring(end);
    
    setCurrentContent(newText);
    
    // Set cursor position
    setTimeout(() => {
      textarea.focus();
      if (selectedText) {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length + selectedText.length);
      } else {
        textarea.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    }, 0);
  };


  const extractYouTubeId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        // In a real app, you would upload to Supabase Storage
        const mockUrl = URL.createObjectURL(file);
        const newFile: MediaFile = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type,
          url: mockUrl
        };
        setMediaFiles(prev => [...prev, newFile]);
        insertText(`[${file.name}](${mockUrl})`);
      });
      
      toast({
        title: "File uploaded",
        description: "File has been added to your content",
      });
    }
  };

  const removeMediaFile = (id: string) => {
    setMediaFiles(prev => prev.filter(file => file.id !== id));
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags(prev => [...prev, tagInput.trim()]);
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      addTag();
    }
  };

  const handleSave = () => {
    onSave(currentTitle, currentContent);
  };

  if (!isEditing) {
    return (
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-4xl font-bold text-foreground">{currentTitle}</h1>
              <Button onClick={onPreview} variant="outline">
                Edit
              </Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {tags.map((tag) => (
                  <Badge key={tag} variant="secondary">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
          
          <div className="prose prose-lg max-w-none">
            <div 
              className="whitespace-pre-wrap text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: currentContent.replace(/\n/g, '<br>') }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between mb-4">
          <Input
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="Page title..."
            className="text-2xl font-bold border-none bg-transparent p-0 focus-visible:ring-0"
          />
          <div className="flex gap-2">
            {onPreview && (
              <Button onClick={onPreview} variant="outline">
                <Eye className="h-4 w-4 mr-2" />
                Preview
              </Button>
            )}
            <Button onClick={handleSave} className="bg-gradient-primary">
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </div>
        </div>

        {/* Tags */}
        <div className="mb-4">
          <div className="flex items-center gap-2 mb-2">
            <Input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add tags..."
              className="max-w-xs"
            />
            <Button onClick={addTag} variant="outline" size="sm">
              Add Tag
            </Button>
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                  {tag} ×
                </Badge>
              ))}
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1 p-2 bg-muted rounded-md">
          {toolbarItems.map((item, index) => (
            <Button
              key={index}
              variant="ghost"
              size="sm"
              onClick={item.action}
              title={item.tooltip}
              className="h-8 w-8 p-0"
            >
              <item.icon className="h-4 w-4" />
            </Button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 p-4">
          <Textarea
            ref={textareaRef}
            value={currentContent}
            onChange={(e) => setCurrentContent(e.target.value)}
            placeholder="Start writing your content... You can use Markdown formatting and add YouTube videos!"
            className="h-full resize-none border-none focus-visible:ring-0 text-base leading-relaxed"
          />
        </div>

        {/* Media Panel */}
        {mediaFiles.length > 0 && (
          <div className="w-80 border-l border-border p-4 overflow-auto">
            <h3 className="font-semibold mb-4">Attached Files</h3>
            <div className="space-y-2">
              {mediaFiles.map((file) => (
                <Card key={file.id} className="p-3">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.type}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeMediaFile(file.id)}
                      className="h-8 w-8 p-0 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileUpload}
        className="hidden"
        accept="image/*,video/*,.pdf,.doc,.docx,.txt"
      />
    </div>
  );
}