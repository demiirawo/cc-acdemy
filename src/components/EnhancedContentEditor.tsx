import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
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
  Trash2,
  Globe,
  Lock,
  Copy,
  Table,
  Heading1,
  Heading2,
  Heading3,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  MoreHorizontal,
  ChevronDown,
  Smile,
  Calendar,
  AtSign
} from "lucide-react";

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
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
  isEditing = true,
  pageId
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [currentContent, setCurrentContent] = useState(content);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [showAdvancedToolbar, setShowAdvancedToolbar] = useState(false);
  const [selectedFontSize, setSelectedFontSize] = useState("14");
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentTitle(title);
    setCurrentContent(content);
    if (editorRef.current) {
      editorRef.current.innerHTML = content;
    }
  }, [title, content]);

  // Load page settings if editing existing page
  useEffect(() => {
    if (pageId) {
      const fetchPageSettings = async () => {
        try {
          const { data, error } = await supabase
            .from('pages')
            .select('is_public, public_token')
            .eq('id', pageId)
            .single();

          if (error) throw error;

          if (data) {
            setIsPublic(data.is_public || false);
            setPublicToken(data.public_token || '');
          }
        } catch (error) {
          console.error('Error fetching page settings:', error);
        }
      };

      fetchPageSettings();
    }
  }, [pageId]);

  const execCommand = (command: string, value?: string) => {
    document.execCommand(command, false, value);
    editorRef.current?.focus();
    updateContent();
  };

  const updateContent = () => {
    if (editorRef.current) {
      setCurrentContent(editorRef.current.innerHTML);
    }
  };

  const formatText = (command: string, value?: string) => {
    execCommand(command, value);
  };

  const insertText = (text: string) => {
    execCommand('insertHTML', text);
  };

  const insertTable = (rows: number, cols: number) => {
    let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;"><tbody>';
    
    // Header row
    tableHTML += '<tr>';
    for (let j = 0; j < cols; j++) {
      tableHTML += `<th style="border: 1px solid #ccc; padding: 8px;">Header ${j + 1}</th>`;
    }
    tableHTML += '</tr>';
    
    // Data rows
    for (let i = 0; i < rows - 1; i++) {
      tableHTML += '<tr>';
      for (let j = 0; j < cols; j++) {
        tableHTML += `<td style="border: 1px solid #ccc; padding: 8px;">Cell ${i + 1}-${j + 1}</td>`;
      }
      tableHTML += '</tr>';
    }
    
    tableHTML += '</tbody></table>';
    insertText(tableHTML);
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    const text = prompt("Enter link text:") || url;
    if (url) {
      insertText(`<a href="${url}" target="_blank">${text}</a>`);
    }
  };

  const insertImage = () => {
    const url = prompt("Enter image URL:");
    const alt = prompt("Enter alt text:") || "Image";
    if (url) {
      insertText(`<img src="${url}" alt="${alt}" style="max-width: 100%; height: auto;" />`);
    }
  };

  const insertYouTube = () => {
    const url = prompt("Enter YouTube URL:");
    if (url) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        insertText(`<iframe width="560" height="315" src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen style="max-width: 100%;"></iframe>`);
      } else {
        toast({
          title: "Invalid YouTube URL",
          description: "Please enter a valid YouTube URL",
          variant: "destructive",
        });
      }
    }
  };

  const basicToolbarItems = [
    { icon: Bold, action: () => formatText('bold'), tooltip: "Bold (Ctrl+B)" },
    { icon: Italic, action: () => formatText('italic'), tooltip: "Italic (Ctrl+I)" },
    { icon: Underline, action: () => formatText('underline'), tooltip: "Underline (Ctrl+U)" },
    { icon: Strikethrough, action: () => formatText('strikeThrough'), tooltip: "Strikethrough" },
  ];

  const formatToolbarItems = [
    { icon: Heading1, action: () => formatText('formatBlock', 'h1'), tooltip: "Heading 1" },
    { icon: Heading2, action: () => formatText('formatBlock', 'h2'), tooltip: "Heading 2" },
    { icon: Heading3, action: () => formatText('formatBlock', 'h3'), tooltip: "Heading 3" },
  ];

  const alignmentToolbarItems = [
    { icon: AlignLeft, action: () => formatText('justifyLeft'), tooltip: "Align Left" },
    { icon: AlignCenter, action: () => formatText('justifyCenter'), tooltip: "Align Center" },
    { icon: AlignRight, action: () => formatText('justifyRight'), tooltip: "Align Right" },
    { icon: AlignJustify, action: () => formatText('justifyFull'), tooltip: "Justify" },
  ];

  const listToolbarItems = [
    { icon: List, action: () => formatText('insertUnorderedList'), tooltip: "Bullet List" },
    { icon: ListOrdered, action: () => formatText('insertOrderedList'), tooltip: "Numbered List" },
    { icon: Quote, action: () => formatText('formatBlock', 'blockquote'), tooltip: "Quote" },
  ];

  const insertToolbarItems = [
    { icon: Link, action: insertLink, tooltip: "Insert Link" },
    { icon: Image, action: insertImage, tooltip: "Insert Image" },
    { icon: Youtube, action: insertYouTube, tooltip: "Insert YouTube Video" },
    { icon: Code, action: () => formatText('formatBlock', 'pre'), tooltip: "Code Block" },
    { icon: FileText, action: () => fileInputRef.current?.click(), tooltip: "Upload File" }
  ];

  const extractYouTubeId = (url: string): string | null => {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const mockUrl = URL.createObjectURL(file);
        const newFile: MediaFile = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type,
          url: mockUrl
        };
        setMediaFiles(prev => [...prev, newFile]);
        insertText(`<a href="${mockUrl}" target="_blank">${file.name}</a>`);
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

  const handleSave = async () => {
    onSave(currentTitle, currentContent);
    
    if (pageId) {
      try {
        await supabase
          .from('pages')
          .update({ is_public: isPublic })
          .eq('id', pageId);
      } catch (error) {
        console.error('Error updating page settings:', error);
      }
    }
  };

  const togglePublicAccess = async () => {
    if (!pageId) return;

    try {
      const newIsPublic = !isPublic;
      const { error } = await supabase
        .from('pages')
        .update({ is_public: newIsPublic })
        .eq('id', pageId);

      if (error) throw error;

      setIsPublic(newIsPublic);
      toast({
        title: newIsPublic ? "Page made public" : "Page made private",
        description: newIsPublic ? "Anyone can view this page" : "Only authorized users can view this page",
      });
    } catch (error) {
      console.error('Error updating public access:', error);
      toast({
        title: "Error",
        description: "Failed to update page visibility",
        variant: "destructive",
      });
    }
  };

  const copyPublicLink = () => {
    if (!publicToken) return;
    
    const publicUrl = `${window.location.origin}/public/${publicToken}`;
    navigator.clipboard.writeText(publicUrl);
    toast({
      title: "Link copied",
      description: "Public link copied to clipboard",
    });
  };

  const handleDeletePage = async () => {
    if (!pageId || !currentTitle) return;
    
    const confirmDelete = window.confirm(`Are you sure you want to delete "${currentTitle}"? This action cannot be undone.`);
    if (!confirmDelete) return;

    try {
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', pageId);

      if (error) throw error;

      toast({
        title: "Page deleted",
        description: `"${currentTitle}" has been deleted successfully.`,
      });

      // Navigate back to dashboard
      window.location.href = '/';
    } catch (error) {
      console.error('Error deleting page:', error);
      toast({
        title: "Error",
        description: "Failed to delete page. Please try again.",
        variant: "destructive",
      });
    }
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
              className="text-foreground leading-relaxed"
              dangerouslySetInnerHTML={{ __html: currentContent }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background">
        <div className="flex items-center justify-between mb-4">
          <Input
            value={currentTitle}
            onChange={(e) => setCurrentTitle(e.target.value)}
            placeholder="Page title..."
            className="text-2xl font-bold border-none bg-transparent p-0 focus-visible:ring-0 text-foreground"
          />
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {isPublic ? <Globe className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              <Label htmlFor="public-toggle" className="text-sm font-medium">
                Public
              </Label>
              <Switch
                id="public-toggle"
                checked={isPublic}
                onCheckedChange={togglePublicAccess}
              />
            </div>
            
            {isPublic && publicToken && (
              <Button variant="outline" size="sm" onClick={copyPublicLink}>
                <Copy className="h-4 w-4 mr-2" />
                Copy Public Link
              </Button>
            )}

            {pageId && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeletePage}
                className="mr-2"
              >
                <Trash2 className="h-4 w-4 mr-2" />
              Delete Page
              </Button>
            )}
            
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

        {/* Enhanced Toolbar - Confluence Style */}
        <div className="space-y-2">
          {/* Primary Toolbar */}
          <div className="flex items-center gap-1 p-2 bg-muted/50 rounded-lg border">
            {/* Basic Formatting */}
            <div className="flex items-center gap-1 pr-2 border-r">
              {basicToolbarItems.map((item, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  title={item.tooltip}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Headings */}
            <div className="flex items-center gap-1 px-2 border-r">
              {formatToolbarItems.map((item, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  title={item.tooltip}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-1 px-2 border-r">
              {alignmentToolbarItems.map((item, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  title={item.tooltip}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Lists */}
            <div className="flex items-center gap-1 px-2 border-r">
              {listToolbarItems.map((item, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  title={item.tooltip}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Insert Elements */}
            <div className="flex items-center gap-1 px-2 border-r">
              {insertToolbarItems.map((item, index) => (
                <Button
                  key={index}
                  variant="ghost"
                  size="sm"
                  onClick={item.action}
                  title={item.tooltip}
                  className="h-8 w-8 p-0 hover:bg-muted"
                >
                  <item.icon className="h-4 w-4" />
                </Button>
              ))}
            </div>

            {/* Table */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 hover:bg-muted"
                  title="Insert Table"
                >
                  <Table className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-4">
                  <h4 className="font-medium">Insert Table</h4>
                  <div className="grid grid-cols-5 gap-1">
                    {Array.from({ length: 25 }, (_, i) => {
                      const row = Math.floor(i / 5) + 1;
                      const col = (i % 5) + 1;
                      return (
                        <Button
                          key={i}
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0 text-xs"
                          onClick={() => insertTable(row, col)}
                        >
                          {row}×{col}
                        </Button>
                      );
                    })}
                  </div>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Main Editor */}
        <div className="flex-1 p-6">
          <div
            ref={editorRef}
            contentEditable
            suppressContentEditableWarning
            onInput={updateContent}
            className="h-full w-full p-4 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background text-foreground min-h-[500px] prose prose-lg max-w-none"
            style={{
              fontFamily: 'system-ui, -apple-system, sans-serif',
              fontSize: '16px',
              lineHeight: '1.6'
            }}
            data-placeholder="Start writing your content..."
          />
        </div>

        {/* Media Panel */}
        {mediaFiles.length > 0 && (
          <div className="w-80 border-l border-border p-4 overflow-auto bg-muted/20">
            <h3 className="font-semibold mb-4 text-foreground">Attached Files</h3>
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