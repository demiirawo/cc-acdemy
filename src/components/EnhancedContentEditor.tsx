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
import { EditableTitle } from "./EditableTitle";
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
  onSave: (title: string, content: string, recommendedReading?: Array<{title: string, url?: string, description: string, fileUrl?: string, fileName?: string}>) => void;
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
  const [recommendedReading, setRecommendedReading] = useState<Array<{title: string, url?: string, description: string, type: 'link' | 'file', fileName?: string, fileUrl?: string}>>([]);
  const [newRecommendation, setNewRecommendation] = useState({title: '', url: '', description: '', type: 'link' as 'link' | 'file', fileName: '', fileUrl: ''});
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
            .select('is_public, public_token, content')
            .eq('id', pageId)
            .single();

          if (error) throw error;

          if (data) {
            setIsPublic(data.is_public || false);
            setPublicToken(data.public_token || '');
            
            // Try to extract recommended reading from content
            try {
              if (data.content && data.content.includes('RECOMMENDED_READING:')) {
                const parts = data.content.split('RECOMMENDED_READING:');
                if (parts.length > 1) {
                  const readingData = JSON.parse(parts[1]);
                  setRecommendedReading(readingData);
                  setCurrentContent(parts[0]);
                }
              }
            } catch (e) {
              console.log('No recommended reading data found');
            }
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
    let tableHTML = `<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;" data-table="true"><tbody>`;
    
    // Header row
    tableHTML += '<tr>';
    for (let j = 0; j < cols; j++) {
      tableHTML += `<th style="border: 1px solid #ccc; padding: 8px; position: relative;">
        Header ${j + 1}
        <div class="table-controls" style="position: absolute; top: 2px; right: 2px; display: none;">
          <button onclick="addColumnAfter(this)" style="background: #007bff; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">+Col</button>
          <button onclick="removeColumn(this)" style="background: #dc3545; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">-Col</button>
        </div>
      </th>`;
    }
    tableHTML += '</tr>';
    
    // Data rows
    for (let i = 0; i < rows - 1; i++) {
      tableHTML += '<tr>';
      for (let j = 0; j < cols; j++) {
        tableHTML += `<td style="border: 1px solid #ccc; padding: 8px; min-width: 100px; position: relative;">
          Cell ${i + 1}-${j + 1}
          ${j === 0 ? `<div class="row-controls" style="position: absolute; top: 2px; right: 2px; display: none;">
            <button onclick="addRowAfter(this)" style="background: #007bff; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">+Row</button>
            <button onclick="removeRow(this)" style="background: #dc3545; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">-Row</button>
          </div>` : ''}
        </td>`;
      }
      tableHTML += '</tr>';
    }
    
    tableHTML += '</tbody></table>';
    
    // Add table control functions to window for inline onclick handlers
    const scriptHTML = `
      <script>
        window.addRowAfter = function(btn) {
          const row = btn.closest('tr');
          const table = btn.closest('table');
          const colCount = row.cells.length;
          const newRow = table.insertRow(row.rowIndex + 1);
          for (let i = 0; i < colCount; i++) {
            const cell = newRow.insertCell(i);
            cell.style.cssText = 'border: 1px solid #ccc; padding: 8px; min-width: 100px; position: relative;';
            cell.innerHTML = 'New Cell';
            if (i === 0) {
              cell.innerHTML += '<div class="row-controls" style="position: absolute; top: 2px; right: 2px; display: none;"><button onclick="addRowAfter(this)" style="background: #007bff; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">+Row</button><button onclick="removeRow(this)" style="background: #dc3545; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">-Row</button></div>';
            }
          }
        };
        
        window.removeRow = function(btn) {
          const row = btn.closest('tr');
          const table = btn.closest('table');
          if (table.rows.length > 2) row.remove();
        };
        
        window.addColumnAfter = function(btn) {
          const table = btn.closest('table');
          const cellIndex = btn.closest('th, td').cellIndex;
          for (let i = 0; i < table.rows.length; i++) {
            const cell = table.rows[i].insertCell(cellIndex + 1);
            cell.style.cssText = 'border: 1px solid #ccc; padding: 8px; min-width: 100px; position: relative;';
            if (i === 0) {
              cell.innerHTML = 'New Header<div class="table-controls" style="position: absolute; top: 2px; right: 2px; display: none;"><button onclick="addColumnAfter(this)" style="background: #007bff; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">+Col</button><button onclick="removeColumn(this)" style="background: #dc3545; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">-Col</button></div>';
            } else {
              cell.innerHTML = 'New Cell';
              if (cellIndex + 1 === 0) {
                cell.innerHTML += '<div class="row-controls" style="position: absolute; top: 2px; right: 2px; display: none;"><button onclick="addRowAfter(this)" style="background: #007bff; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">+Row</button><button onclick="removeRow(this)" style="background: #dc3545; color: white; border: none; padding: 2px 4px; margin: 1px; font-size: 10px; cursor: pointer;">-Row</button></div>';
              }
            }
          }
        };
        
        window.removeColumn = function(btn) {
          const table = btn.closest('table');
          const cellIndex = btn.closest('th, td').cellIndex;
          if (table.rows[0].cells.length > 1) {
            for (let i = 0; i < table.rows.length; i++) {
              table.rows[i].deleteCell(cellIndex);
            }
          }
        };
        
        // Show controls on hover
        document.addEventListener('mouseover', function(e) {
          if (e.target.closest('table[data-table="true"]')) {
            const controls = e.target.closest('th, td')?.querySelector('.table-controls, .row-controls');
            if (controls) controls.style.display = 'block';
          }
        });
        
        document.addEventListener('mouseout', function(e) {
          if (e.target.closest('table[data-table="true"]')) {
            const controls = e.target.closest('th, td')?.querySelector('.table-controls, .row-controls');
            if (controls) controls.style.display = 'none';
          }
        });
      </script>
    `;
    
    insertText(tableHTML + scriptHTML + '<br>');
  };

  const insertDivider = () => {
    insertText('<hr style="border: none; border-top: 2px solid #e5e7eb; margin: 20px 0;" /><br>');
  };

  const insertLink = () => {
    const url = prompt("Enter URL:");
    const text = prompt("Enter link text:") || url;
    if (url) {
      insertText(`<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline;">${text}</a>`);
    }
  };

  const insertImage = () => {
    // Create a file input for local uploads
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*,video/*,.pdf,.doc,.docx';
    fileInput.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        if (file.type.startsWith('image/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            insertText(`<img src="${result}" alt="${file.name}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;" />`);
            toast({
              title: "Image inserted",
              description: "Image has been added to your content",
            });
          };
          reader.readAsDataURL(file);
        } else if (file.type.startsWith('video/')) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            insertText(`<video controls style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;"><source src="${result}" type="${file.type}">Your browser does not support the video tag.</video>`);
            toast({
              title: "Video inserted",
              description: "Video has been added to your content",
            });
          };
          reader.readAsDataURL(file);
        } else {
          // For other file types, create a download link
          const fileUrl = URL.createObjectURL(file);
          insertText(`<div style="border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin: 10px 0; background: #f9fafb;"><a href="${fileUrl}" download="${file.name}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">📁 ${file.name}</a><br><small style="color: #6b7280;">Click to download</small></div>`);
          toast({
            title: "File attached",
            description: "File has been added to your content",
          });
        }
      }
    };
    
    // Also provide option for URL
    const choice = confirm("Upload local file? (Cancel for URL input)");
    if (choice) {
      fileInput.click();
    } else {
      const url = prompt("Enter image/file URL:");
      const alt = prompt("Enter alt text or description:") || "Media";
      if (url) {
        if (url.match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i)) {
          insertText(`<img src="${url}" alt="${alt}" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;" />`);
        } else {
          insertText(`<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline;">${alt}</a>`);
        }
      }
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
    { icon: Heading1, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        execCommand('formatBlock', 'h1');
      } else {
        insertText('<h1>Heading 1</h1>');
      }
    }, tooltip: "Heading 1" },
    { icon: Heading2, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        execCommand('formatBlock', 'h2');
      } else {
        insertText('<h2>Heading 2</h2>');
      }
    }, tooltip: "Heading 2" },
    { icon: Heading3, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        execCommand('formatBlock', 'h3');
      } else {
        insertText('<h3>Heading 3</h3>');
      }
    }, tooltip: "Heading 3" },
  ];

  const alignmentToolbarItems = [
    { icon: AlignLeft, action: () => formatText('justifyLeft'), tooltip: "Align Left" },
    { icon: AlignCenter, action: () => formatText('justifyCenter'), tooltip: "Align Center" },
    { icon: AlignRight, action: () => formatText('justifyRight'), tooltip: "Align Right" },
    { icon: AlignJustify, action: () => formatText('justifyFull'), tooltip: "Justify" },
  ];

  const listToolbarItems = [
    { icon: List, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        // Wrap selected text in list items
        const selectedText = selection.toString();
        const listItems = selectedText.split('\n').map(line => `<li>${line.trim()}</li>`).join('');
        execCommand('insertHTML', `<ul>${listItems}</ul>`);
      } else {
        execCommand('insertUnorderedList');
      }
    }, tooltip: "Bullet List" },
    { icon: ListOrdered, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        // Wrap selected text in numbered list items
        const selectedText = selection.toString();
        const listItems = selectedText.split('\n').map(line => `<li>${line.trim()}</li>`).join('');
        execCommand('insertHTML', `<ol>${listItems}</ol>`);
      } else {
        execCommand('insertOrderedList');
      }
    }, tooltip: "Numbered List" },
    { icon: Quote, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        const selectedText = selection.toString();
        execCommand('insertHTML', `<blockquote style="border-left: 4px solid #e5e7eb; padding-left: 16px; margin: 16px 0; font-style: italic;">${selectedText}</blockquote><br>`);
      } else {
        insertText('<blockquote style="border-left: 4px solid #e5e7eb; padding-left: 16px; margin: 16px 0; font-style: italic;">Quote text here</blockquote><br>');
      }
    }, tooltip: "Quote" },
  ];

  const insertToolbarItems = [
    { icon: Link, action: insertLink, tooltip: "Insert Link" },
    { icon: Image, action: insertImage, tooltip: "Insert Image" },
    { icon: Youtube, action: insertYouTube, tooltip: "Insert YouTube Video" },
    { icon: Table, action: () => {
      const rows = parseInt(prompt("Number of rows:") || "3");
      const cols = parseInt(prompt("Number of columns:") || "3");
      if (rows > 0 && cols > 0) {
        insertTable(rows, cols);
      }
    }, tooltip: "Insert Table" },
    { 
      icon: () => (
        <div className="w-4 h-4 border-t-2 border-foreground"></div>
      ), 
      action: insertDivider, 
      tooltip: "Insert Section Divider" 
    },
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
    // Combine content with recommended reading
    let contentToSave = currentContent;
    if (recommendedReading.length > 0) {
      contentToSave += 'RECOMMENDED_READING:' + JSON.stringify(recommendedReading);
    }
    
    onSave(currentTitle, contentToSave, recommendedReading);
    
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
              dangerouslySetInnerHTML={{ __html: currentContent.split('RECOMMENDED_READING:')[0] }}
            />
          </div>
          
          {/* Recommended Reading on Final Page */}
          {recommendedReading.length > 0 && (
            <div className="mt-8 pt-8 border-t border-border">
              <h3 className="text-xl font-semibold mb-4 text-foreground">Recommended Reading</h3>
              <div className="space-y-3">
                 {recommendedReading.map((item, index) => (
                   <div key={index} className="p-4 border rounded-lg bg-muted/20">
                     <h4 className="font-medium text-foreground mb-1">{item.title}</h4>
                     {item.url && (
                       <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm block mb-2">
                         {item.url}
                       </a>
                     )}
                     {item.fileUrl && (
                       <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline text-sm block mb-2">
                         📁 {item.fileName}
                       </a>
                     )}
                     <p className="text-sm text-muted-foreground">{item.description}</p>
                   </div>
                 ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border p-4 bg-background">
        <div className="flex items-center justify-between mb-4">
          <EditableTitle
            value={currentTitle}
            onChange={setCurrentTitle}
            className="text-2xl font-bold"
            placeholder="Page title..."
          />
          <div className="flex gap-2">
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
        {/* Main Editor - Make it scrollable */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={updateContent}
              className="w-full p-4 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background text-foreground min-h-[400px] prose prose-lg max-w-none"
              style={{
                fontFamily: 'system-ui, -apple-system, sans-serif',
                fontSize: '16px',
                lineHeight: '1.6'
              }}
              data-placeholder="Start writing your content..."
            />
            
            {/* Recommended Reading Section */}
            <Card>
              <CardHeader>
                 <div className="flex items-center justify-between">
                   <CardTitle className="text-lg">Recommended Reading</CardTitle>
                   <Button
                     onClick={() => {
                       if (newRecommendation.title && (newRecommendation.url || newRecommendation.type === 'file')) {
                         if (newRecommendation.type === 'file') {
                           // For file type, we'll handle file upload
                           const input = document.createElement('input');
                           input.type = 'file';
                           input.accept = '.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg';
                           input.onchange = (e) => {
                             const file = (e.target as HTMLInputElement).files?.[0];
                             if (file) {
                               const fileUrl = URL.createObjectURL(file);
                                setRecommendedReading(prev => [...prev, {
                                  title: newRecommendation.title,
                                  description: newRecommendation.description,
                                  type: 'file',
                                  fileUrl,
                                  fileName: file.name
                                }]);
                            setNewRecommendation({ title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '' });
                               toast({
                                 title: "Added",
                                 description: "Recommended reading file added.",
                               });
                             }
                           };
                           input.click();
                         } else {
                            setRecommendedReading(prev => [...prev, {
                              title: newRecommendation.title,
                              url: newRecommendation.url,
                              description: newRecommendation.description,
                              type: 'link'
                            }]);
                           setNewRecommendation({ title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '' });
                           toast({
                             title: "Added",
                             description: "Recommended reading item added.",
                           });
                         }
                       }
                     }}
                     variant="outline"
                     size="sm"
                      disabled={!newRecommendation.title || !newRecommendation.description || 
                               (newRecommendation.type === 'link' ? !newRecommendation.url : !newRecommendation.fileName)}
                     className="flex items-center gap-2"
                   >
                     <FileText className="h-4 w-4" />
                     Add Reading
                   </Button>
                 </div>
              </CardHeader>
               <CardContent className="space-y-4">
                 {/* Form for adding new recommendation */}
                 <div className="space-y-3 p-3 border rounded-lg bg-muted/10">
                   <div className="flex gap-2">
                     <Button
                       variant={newRecommendation.type === 'link' ? 'default' : 'outline'}
                       size="sm"
                       onClick={() => setNewRecommendation(prev => ({ ...prev, type: 'link' }))}
                     >
                       Link
                     </Button>
                     <Button
                       variant={newRecommendation.type === 'file' ? 'default' : 'outline'}
                       size="sm"
                       onClick={() => setNewRecommendation(prev => ({ ...prev, type: 'file' }))}
                     >
                       File
                     </Button>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                     <Input
                       placeholder="Title"
                       value={newRecommendation.title}
                       onChange={(e) => setNewRecommendation(prev => ({ ...prev, title: e.target.value }))}
                     />
                     {newRecommendation.type === 'link' && (
                       <Input
                         placeholder="URL"
                         value={newRecommendation.url}
                         onChange={(e) => setNewRecommendation(prev => ({ ...prev, url: e.target.value }))}
                       />
                     )}
                      {newRecommendation.type === 'file' && (
                        <div className="space-y-2">
                          <input
                            type="file"
                            id="reading-file-upload"
                            className="hidden"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const mockUrl = URL.createObjectURL(file);
                                setNewRecommendation(prev => ({ ...prev, fileName: file.name, fileUrl: mockUrl }));
                              }
                            }}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => document.getElementById('reading-file-upload')?.click()}
                            className="w-full"
                          >
                            Upload File
                          </Button>
                          {newRecommendation.fileName && (
                            <p className="text-sm text-muted-foreground">{newRecommendation.fileName}</p>
                          )}
                        </div>
                      )}
                     <Input
                       placeholder="Description"
                       value={newRecommendation.description}
                       onChange={(e) => setNewRecommendation(prev => ({ ...prev, description: e.target.value }))}
                     />
                   </div>
                 </div>

                {/* Existing recommendations */}
                 {recommendedReading.map((item, index) => (
                   <div key={index} className="p-3 border rounded-lg bg-muted/20">
                     <div className="flex items-start justify-between">
                       <div className="flex-1">
                         <h4 className="font-medium text-foreground">{item.title}</h4>
                         {item.url && (
                           <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                             {item.url}
                           </a>
                         )}
                         {item.fileUrl && (
                           <a href={item.fileUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline break-all">
                             📁 {item.fileName}
                           </a>
                         )}
                         {item.description && (
                           <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                         )}
                       </div>
                       <Button
                         variant="ghost"
                         size="sm"
                         onClick={() => setRecommendedReading(prev => prev.filter((_, i) => i !== index))}
                         className="h-8 w-8 p-0 text-destructive"
                       >
                         <Trash2 className="h-3 w-3" />
                       </Button>
                     </div>
                   </div>
                 ))}
                
                {recommendedReading.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No recommended reading yet</p>
                    <p className="text-xs">Add links to helpful resources for this page</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
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