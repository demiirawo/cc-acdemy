import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useRecommendedReadingAudit } from "@/hooks/useRecommendedReadingAudit";
import { EditableTitle } from "./EditableTitle";
import { ColorPicker } from "./ColorPicker";
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
  Edit,
  Globe,
  Lock,
  Copy,
  Table,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Type,
  Palette,
  MoreHorizontal,
  ChevronDown,
  ChevronUp,
  Smile,
  Calendar,
  AtSign,
  Plus,
  Minus,
  Settings,
  Monitor
} from "lucide-react";

interface ContentEditorProps {
  title?: string;
  content?: string;
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
  onPageSaved?: () => void;
}

interface MediaFile {
  id: string;
  name: string;
  type: string;
  url: string;
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
  pageId,
  onPageSaved
}: ContentEditorProps) {
  const [currentTitle, setCurrentTitle] = useState(title);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [isPublic, setIsPublic] = useState(false);
  const [publicToken, setPublicToken] = useState('');
  const [showAdvancedToolbar, setShowAdvancedToolbar] = useState(false);
  const [selectedFontSize, setSelectedFontSize] = useState("14");
  const [recommendedReading, setRecommendedReading] = useState<Array<{title: string, url?: string, description: string, type: 'link' | 'file', fileName?: string, fileUrl?: string, category?: string}>>([]);
  const [newRecommendation, setNewRecommendation] = useState({title: '', url: '', description: '', type: 'link' as 'link' | 'file', fileName: '', fileUrl: '', category: 'General'});
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editingItem, setEditingItem] = useState({title: '', url: '', description: '', type: 'link' as 'link' | 'file', fileName: '', fileUrl: '', category: 'General'});
  const [currentTableCell, setCurrentTableCell] = useState<HTMLElement | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Refs for tracking content and save state
  const contentRef = useRef(content);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSavedStateRef = useRef({
    title,
    content,
    tags: [] as string[],
    recommendedReading: [] as Array<{title: string, url?: string, description: string, type: 'link' | 'file', fileName?: string, fileUrl?: string, category?: string}>
  });
  const saveInProgressRef = useRef(false);
  
  // Refs to always access the latest state values during saves
  const currentStateRef = useRef({
    title: currentTitle,
    tags,
    recommendedReading
  });
  
  const { toast } = useToast();
  const { createSnapshot, logChange } = useRecommendedReadingAudit(pageId || '');

  // Unified save function that handles all content consistently
  const performSave = async (isManual = false) => {
    if (!pageId || saveInProgressRef.current) return;
    
    saveInProgressRef.current = true;
    if (isManual) setIsSaving(true);
    
    try {
      const currentContent = contentRef.current;
      
      // Use the ref to get the absolute latest state values
      const currentState = {
        title: currentStateRef.current.title,
        content: currentContent,
        tags: [...currentStateRef.current.tags],
        recommendedReading: [...currentStateRef.current.recommendedReading]
      };
      
      // Check if any field has changed
      const hasChanges = (
        currentState.title !== lastSavedStateRef.current.title ||
        currentState.content !== lastSavedStateRef.current.content ||
        JSON.stringify(currentState.tags) !== JSON.stringify(lastSavedStateRef.current.tags) ||
        JSON.stringify(currentState.recommendedReading) !== JSON.stringify(lastSavedStateRef.current.recommendedReading)
      );
      
      if (!hasChanges && !isManual) {
        console.log('No changes detected, skipping save');
        return;
      }
      
      console.log(`${isManual ? 'Manual' : 'Auto'} save triggered:`, {
        title: currentState.title,
        content: currentState.content.substring(0, 100) + '...',
        tagsCount: currentState.tags.length,
        recommendedReadingCount: currentState.recommendedReading.length,
        hasChanges
      });
      
      // Perform the database update
      const { error } = await supabase
        .from('pages')
        .update({
          title: currentState.title,
          content: currentState.content,
          tags: currentState.tags,
          recommended_reading: currentState.recommendedReading,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId);

      if (error) throw error;
      
      // Update the last saved state
      lastSavedStateRef.current = {
        title: currentState.title,
        content: currentState.content,
        tags: [...currentState.tags],
        recommendedReading: [...currentState.recommendedReading]
      };
      
      console.log(`${isManual ? 'Manual' : 'Auto'} save successful`);
      
      if (isManual) {
        toast({
          title: "Page saved",
        });
        // Trigger callback to switch to view mode
        if (onPageSaved) {
          onPageSaved();
        }
      }
      
    } catch (error) {
      console.error(`${isManual ? 'Manual' : 'Auto'} save failed:`, error);
      if (isManual) {
        toast({
          title: "Error",
          description: "Failed to save page. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      saveInProgressRef.current = false;
      if (isManual) setIsSaving(false);
    }
  };

  // Schedule auto-save with debouncing
  const scheduleAutoSave = () => {
    if (!pageId) return;
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      performSave(false);
    }, 10000); // Auto-save after 10 seconds of inactivity
  };

  // Manual save handler
  const handleManualSave = async () => {
    if (pageId) {
      await performSave(true);
      // For existing pages, trigger callback to refresh content and switch to view mode
      if (onPageSaved) {
        onPageSaved();
      }
    } else {
      // For new pages, use the onSave prop
      try {
        setIsSaving(true);
        console.log('Creating new page with all content:', {
          title: currentTitle,
          content: contentRef.current,
          tags,
          recommendedReading
        });
        
        await onSave(currentTitle, contentRef.current, recommendedReading, [], tags);
        
        toast({
          title: "Page saved",
        });
        
        // Navigate to the dashboard where the new page will be visible
        window.location.href = '/';
      } catch (error) {
        console.error('Error creating page:', error);
        toast({
          title: "Error",
          description: "Failed to create page. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  useEffect(() => {
    setCurrentTitle(title);
    
    // Clean content of any RECOMMENDED_READING data before setting
    const cleanContent = content.split('RECOMMENDED_READING:')[0];
    contentRef.current = cleanContent;
    lastSavedStateRef.current.content = cleanContent;
    lastSavedStateRef.current.title = title;
    
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanContent;
    }
    
    // Setup image and video controls after content is set
    setTimeout(() => {
      setupImageControls();
      setupYouTubeControls();
    }, 100);

    // Add keyboard shortcuts
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'z':
            e.preventDefault();
            document.execCommand('undo');
            updateContent();
            break;
          case 'y':
            e.preventDefault();
            document.execCommand('redo');
            updateContent();
            break;
          case 'c':
            // Let browser handle copy naturally
            break;
          case 'v':
            // Let browser handle paste naturally, but update content after
            setTimeout(() => updateContent(), 50);
            break;
          case 'a':
            // Let browser handle select all naturally
            break;
          case 'b':
            e.preventDefault();
            formatText('bold');
            break;
          case 'i':
            e.preventDefault();
            formatText('italic');
            break;
          case 'u':
            e.preventDefault();
            formatText('underline');
            break;
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    
    // Add navigation-based saving
    const handleBeforeUnload = () => {
      if (pageId) {
        performSave(false); // Save immediately when leaving
      }
    };
    
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden' && pageId) {
        performSave(false); // Save immediately when tab becomes hidden
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      
      // Save one final time when component unmounts
      if (pageId) {
        performSave(false);
      }
    };
  }, [title, content]);

  // Auto-save when title changes
  useEffect(() => {
    if (pageId && currentTitle !== lastSavedStateRef.current.title) {
      scheduleAutoSave();
    }
  }, [currentTitle, pageId]);

  // Update currentStateRef whenever state changes
  useEffect(() => {
    currentStateRef.current = {
      title: currentTitle,
      tags,
      recommendedReading
    };
  }, [currentTitle, tags, recommendedReading]);

  // Auto-save when tags change
  useEffect(() => {
    if (pageId && JSON.stringify(tags) !== JSON.stringify(lastSavedStateRef.current.tags)) {
      scheduleAutoSave();
    }
  }, [tags, pageId]);

  // Auto-save when recommended reading changes
  useEffect(() => {
    if (pageId && JSON.stringify(recommendedReading) !== JSON.stringify(lastSavedStateRef.current.recommendedReading)) {
      scheduleAutoSave();
    }
  }, [recommendedReading, pageId]);

  // Load page settings if editing existing page
  useEffect(() => {
    if (pageId) {
      const fetchPageSettings = async () => {
        try {
          const { data, error } = await supabase
            .from('pages')
            .select('is_public, public_token, content, recommended_reading, tags')
            .eq('id', pageId)
            .single();

          if (error) throw error;

          if (data) {
            setIsPublic(data.is_public || false);
            setPublicToken(data.public_token || '');
            contentRef.current = data.content;
            if (editorRef.current) {
              editorRef.current.innerHTML = data.content;
            }
            
            // Only set recommended reading if we don't have unsaved changes
            const hasUnsavedRecommendedReading = recommendedReading.length > 0 && 
              JSON.stringify(recommendedReading) !== JSON.stringify(lastSavedStateRef.current.recommendedReading);
            
            if (!hasUnsavedRecommendedReading) {
              if (data.recommended_reading && Array.isArray(data.recommended_reading)) {
                console.log('Found recommended reading in database:', data.recommended_reading);
                const typedReadings = data.recommended_reading.map((item: any) => ({
                  title: item.title || '',
                  url: item.url,
                  description: item.description || '',
                  type: (item.type as 'link' | 'file') || 'link',
                  fileName: item.fileName,
                  fileUrl: item.fileUrl,
                  category: item.category || 'General'
                }));
                setRecommendedReading(typedReadings);
                lastSavedStateRef.current.recommendedReading = typedReadings;
              } else {
                console.log('No recommended reading found in database');
                setRecommendedReading([]);
                lastSavedStateRef.current.recommendedReading = [];
              }
            } else {
              console.log('Skipping recommended reading update - has unsaved changes');
            }
            
            // Only set tags if we don't have unsaved changes
            const hasUnsavedTags = tags.length > 0 && 
              JSON.stringify(tags) !== JSON.stringify(lastSavedStateRef.current.tags);
            
            if (!hasUnsavedTags) {
              if (data.tags && Array.isArray(data.tags)) {
                console.log('Found tags in database:', data.tags);
                setTags(data.tags);
                lastSavedStateRef.current.tags = data.tags;
              } else {
                console.log('No tags found in database');
                setTags([]);
                lastSavedStateRef.current.tags = [];
              }
            } else {
              console.log('Skipping tags update - has unsaved changes');
            }
            
            // Handle legacy content format if needed
            if (data.content && data.content.includes('RECOMMENDED_READING:')) {
              try {
                const parts = data.content.split('RECOMMENDED_READING:');
                if (parts.length > 1) {
                  const readingSection = parts[1].trim();
                  if (readingSection) {
                    const readingData = readingSection.split('\n').map(line => {
                      const [title, url] = line.split(' - ');
                      return {
                        title: title || 'Untitled',
                        url: url || '',
                        description: '',
                        type: 'link' as const,
                        category: 'General',
                        fileUrl: url?.startsWith('http') ? undefined : url,
                        fileName: url?.startsWith('http') ? undefined : title
                      };
                    }).filter(item => item.title && (item.url || item.fileUrl));
                    
                    const hasUnsavedRecommendedReadingLegacy = recommendedReading.length > 0 && 
                      JSON.stringify(recommendedReading) !== JSON.stringify(lastSavedStateRef.current.recommendedReading);
                    
                    if (!hasUnsavedRecommendedReadingLegacy && readingData.length > 0) {
                      setRecommendedReading(readingData);
                      lastSavedStateRef.current.recommendedReading = readingData;
                      
                      // Update database to new format
                      await supabase
                        .from('pages')
                        .update({
                          content: parts[0].trim(),
                          recommended_reading: readingData
                        })
                        .eq('id', pageId);
                    }
                  }
                }
              } catch (e) {
                console.log('Error parsing legacy recommended reading:', e);
              }
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
    // Handle text alignment commands manually for better browser support
    if (command.includes('justify')) {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Find the closest block element
        let blockElement = container.nodeType === Node.TEXT_NODE 
          ? container.parentElement 
          : container as Element;
          
        while (blockElement && !['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'TD', 'TH', 'BLOCKQUOTE', 'PRE'].includes(blockElement.tagName)) {
          blockElement = blockElement.parentElement;
        }
        
        if (blockElement) {
          const element = blockElement as HTMLElement;
          switch (command) {
            case 'justifyLeft':
              element.style.textAlign = 'left';
              break;
            case 'justifyCenter':
              element.style.textAlign = 'center';
              break;
            case 'justifyRight':
              element.style.textAlign = 'right';
              break;
            case 'justifyFull':
              element.style.textAlign = 'justify';
              break;
          }
        } else {
          // If no block element found, wrap the selection in a div
          const div = document.createElement('div');
          switch (command) {
            case 'justifyLeft':
              div.style.textAlign = 'left';
              break;
            case 'justifyCenter':
              div.style.textAlign = 'center';
              break;
            case 'justifyRight':
              div.style.textAlign = 'right';
              break;
            case 'justifyFull':
              div.style.textAlign = 'justify';
              break;
          }
          
          try {
            range.surroundContents(div);
          } catch {
            // If surrounding fails, insert the div and move content
            div.appendChild(range.extractContents());
            range.insertNode(div);
          }
        }
      }
    } else {
      // Use execCommand for other formatting
      document.execCommand(command, false, value);
    }
    editorRef.current?.focus();
    updateContent();
  };

  const updateContent = () => {
    if (editorRef.current) {
      contentRef.current = editorRef.current.innerHTML;
      scheduleAutoSave();
    }
  };

  // Auto-save when title, tags, or recommended reading changes
  useEffect(() => {
    if (pageId) {
      scheduleAutoSave();
    }
  }, [currentTitle, tags, recommendedReading, pageId]);

  // Disabled auto-save completely - save only on manual save and navigation
  // (No more auto-save on content changes)

  const formatText = (command: string, value?: string) => {
    execCommand(command, value);
  };

  const insertText = (text: string) => {
    execCommand('insertHTML', text);
  };

  const insertTable = (rows: number, cols: number) => {
    console.log('Inserting table:', rows, 'x', cols);
    
    // Ensure editor has focus
    if (editorRef.current) {
      editorRef.current.focus();
    }
    
    // Create table element programmatically for better control
    const table = document.createElement('table');
    table.setAttribute('data-editable-table', 'true');
    table.style.cssText = `
      border-collapse: collapse;
      width: 100%;
      margin: 10px 0;
      table-layout: fixed;
      border: 1px solid #ccc;
    `;
    
    // Create header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    
     for (let j = 0; j < cols; j++) {
       const th = document.createElement('th');
      th.contentEditable = 'true';
      th.style.cssText = `
        border: 1px solid #ccc;
        padding: 12px;
        background-color: #f8f9fa;
        vertical-align: top;
        text-align: left !important;
        min-width: 120px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        font-size: 14px;
        font-family: inherit;
        height: auto;
        box-sizing: border-box;
        white-space: normal;
        direction: ltr !important;
        unicode-bidi: embed !important;
        writing-mode: horizontal-tb !important;
      `;
      
      // Force proper text direction
      th.dir = 'ltr';
      th.setAttribute('data-cell-type', 'header');
      
      // Add event listeners for proper cursor behavior and cell-specific paste handling
      th.addEventListener('focus', handleCellFocus);
      th.addEventListener('click', handleCellClick);
      th.addEventListener('keydown', handleCellKeydown);
      th.addEventListener('paste', handleCellPaste);
      th.addEventListener('input', updateContent);
      
      headerRow.appendChild(th);
    }
    
    thead.appendChild(headerRow);
    table.appendChild(thead);
    
    // Create body
    const tbody = document.createElement('tbody');
    
    for (let i = 0; i < rows - 1; i++) {
      const row = document.createElement('tr');
      
      for (let j = 0; j < cols; j++) {
         const td = document.createElement('td');
        td.contentEditable = 'true';
        td.style.cssText = `
          border: 1px solid #ccc;
          padding: 12px;
          vertical-align: top;
          text-align: start;
          min-width: 120px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          font-size: 14px;
          font-family: inherit;
          height: auto;
          box-sizing: border-box;
          white-space: normal;
          direction: ltr !important;
          unicode-bidi: embed !important;
          writing-mode: horizontal-tb !important;
        `;
        
        // Force proper text direction
        td.dir = 'ltr';
        td.setAttribute('data-cell-type', 'data');
        
        // Add event listeners for proper cursor behavior and cell-specific paste handling
        td.addEventListener('focus', handleCellFocus);
        td.addEventListener('click', handleCellClick);
        td.addEventListener('keydown', handleCellKeydown);
        td.addEventListener('paste', handleCellPaste);
        td.addEventListener('input', updateContent);
        
        row.appendChild(td);
      }
      
      tbody.appendChild(row);
    }
    
    table.appendChild(tbody);
    
    // Insert the table using execCommand for better compatibility
    try {
      const tableHTML = table.outerHTML + '<br>';
      execCommand('insertHTML', tableHTML);
      
      console.log('Table inserted successfully');
      
      // Position cursor in first cell after a short delay
      setTimeout(() => {
        const insertedTable = editorRef.current?.querySelector('table[data-editable-table]:last-of-type');
        if (insertedTable) {
          const firstCell = insertedTable.querySelector('th') as HTMLElement;
          if (firstCell) {
            firstCell.focus();
            const selection = window.getSelection();
            if (selection) {
              selection.removeAllRanges();
              const range = document.createRange();
              range.setStart(firstCell, 0);
              range.collapse(true);
              selection.addRange(range);
            }
          }
        }
        
        // Setup table controls
        setupTableControls();
      }, 100);
      
    } catch (error) {
      console.error('Error inserting table:', error);
      // Fallback: direct insertion
      if (editorRef.current) {
        editorRef.current.appendChild(table);
        const br = document.createElement('br');
        editorRef.current.appendChild(br);
        updateContent();
      }
    }
  };

  const handleCellFocus = (e: Event) => {
    const cell = e.target as HTMLElement;
    
    // Force proper text direction and alignment with !important to ensure it takes precedence
    cell.style.cssText += `
      direction: ltr !important;
      text-align: start !important;
      unicode-bidi: embed !important;
      writing-mode: horizontal-tb !important;
    `;
    cell.dir = 'ltr';
    
    // Special handling for all cells in first row to fix direction issues
    const table = cell.closest('table');
    if (table) {
      const firstRowCells = table.querySelectorAll('tr:first-child td, tr:first-child th');
      firstRowCells.forEach(firstCell => {
        // More aggressive styling to force horizontal text direction
        const cellEl = firstCell as HTMLElement;
        cellEl.style.cssText = `
          border: 1px solid #ccc;
          padding: 12px;
          background-color: ${cellEl.tagName === 'TH' ? '#f8f9fa' : 'transparent'};
          vertical-align: top;
          text-align: start !important;
          min-width: 120px;
          word-wrap: break-word;
          overflow-wrap: break-word;
          font-size: 14px;
          font-family: inherit;
          height: auto;
          box-sizing: border-box;
          white-space: normal;
          direction: ltr !important;
          text-align: left !important;
          unicode-bidi: embed !important;
          writing-mode: horizontal-tb !important;
        `;
        cellEl.dir = 'ltr';
      });
    }
    
    // Set cursor to beginning if cell is empty
    if (cell.textContent === '') {
      setTimeout(() => {
        const range = document.createRange();
        const selection = window.getSelection();
        
        if (selection) {
          range.setStart(cell, 0);
          range.collapse(true);
          selection.removeAllRanges();
          selection.addRange(range);
        }
      }, 0);
    }
  };

  const handleCellClick = (e: Event) => {
    const cell = e.target as HTMLElement;
    
    // Ensure proper text direction on click
    cell.style.direction = 'ltr';
    cell.style.textAlign = 'left';
    cell.style.unicodeBidi = 'embed';
    cell.style.writingMode = 'horizontal-tb';
    cell.dir = 'ltr';
    cell.focus();
  };

  // Fixed functionality for cell deletion/editing to prevent re-appearing text
  const handleCellPaste = (e: ClipboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cell = e.target as HTMLElement;
    const clipboardData = e.clipboardData;
    
    if (!clipboardData) return;
    
    // Only get plain text for table cells to prevent structure breaking
    const pastedText = clipboardData.getData('text/plain');
    
    if (pastedText) {
      // Clean the text and insert as plain text only
      const cleanText = pastedText.replace(/[\r\n]+/g, ' ').trim();
      
      // Insert text at cursor position
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const textNode = document.createTextNode(cleanText);
        range.insertNode(textNode);
        range.setStartAfter(textNode);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
      }
      
      // Update content and trigger a mutation observer to catch changes
      updateContent();
      
      // Force table to reapply resizable controls
      setTimeout(() => {
        makeTableResizable();
      }, 100);
    }
  };

  const handleCellKeydown = (e: KeyboardEvent) => {
    const cell = e.target as HTMLElement;
    const table = cell.closest('table');
    
    // Force proper text direction and alignment for first cell
    if (table && (cell === table.querySelector('th:first-child') || cell === table.querySelector('td:first-child'))) {
      cell.style.direction = 'ltr !important';
      cell.style.textAlign = 'start !important';
      cell.style.unicodeBidi = 'embed !important';
      cell.style.writingMode = 'horizontal-tb !important';
    }
    
    // Handle navigation between cells
    if (e.key === 'Tab') {
      e.preventDefault();
      if (!table) return;
      
      const cells = Array.from(table.querySelectorAll('th, td'));
      const currentIndex = cells.indexOf(cell);
      
      if (e.shiftKey) {
        // Previous cell
        const prevCell = cells[currentIndex - 1] as HTMLElement;
        if (prevCell) {
          prevCell.focus();
        }
      } else {
        // Next cell
        const nextCell = cells[currentIndex + 1] as HTMLElement;
        if (nextCell) {
          nextCell.focus();
        }
      }
    }
  };

  const setupTableControls = () => {
    // Remove existing event listeners to prevent duplicates
    document.removeEventListener('contextmenu', handleTableContextMenu);
    document.addEventListener('contextmenu', handleTableContextMenu);
    
    // Setup all tables in the editor
    const tables = editorRef.current?.querySelectorAll('table[data-editable-table="true"]');
    tables?.forEach(table => {
      const cells = table.querySelectorAll('th, td');
      cells.forEach(cell => {
        const htmlCell = cell as HTMLElement;
        
        // Ensure proper direction and alignment
        htmlCell.style.direction = 'ltr';
        htmlCell.style.textAlign = 'start';
        htmlCell.dir = 'ltr';
        
        // Add event listeners if not already added
        if (!htmlCell.hasAttribute('data-listeners-added')) {
          htmlCell.addEventListener('focus', handleCellFocus);
          htmlCell.addEventListener('click', handleCellClick);
          htmlCell.addEventListener('keydown', handleCellKeydown);
          htmlCell.addEventListener('paste', handleCellPaste);
          htmlCell.addEventListener('input', updateContent);
          htmlCell.setAttribute('data-listeners-added', 'true');
          
          // Add event listener to fix the reappearing text issue
          htmlCell.addEventListener('keyup', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
              updateContent();
            }
          });
        }
        
        // Add hover effects
        htmlCell.addEventListener('mouseenter', showTableControls);
        htmlCell.addEventListener('mouseleave', hideTableControls);
      });
      
      // Make table resizable after setting up controls
      makeTableResizable();
    });
  };

  const showTableControls = (e: Event) => {
    // Implementation for showing table controls on hover
  };

  const hideTableControls = (e: Event) => {
    // Implementation for hiding table controls
  };

  const handleTableContextMenu = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const cell = target.closest('th, td');
    const table = target.closest('table[data-editable-table="true"]');
    
    if (table && cell) {
      e.preventDefault();
      showTableContextMenu(e, cell, table);
    }
  };

  const showTableContextMenu = (e: MouseEvent, cell: Element, table: Element) => {
    // Remove existing context menu if any
    const existingMenu = document.querySelector('.table-context-menu');
    existingMenu?.remove();
    
    const menu = document.createElement('div');
    menu.className = 'table-context-menu';
    menu.style.cssText = `
      position: fixed;
      top: ${e.clientY}px;
      left: ${e.clientX}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
      z-index: 1000;
      padding: 4px 0;
      min-width: 150px;
    `;
    
    const menuItems = [
      { text: 'Insert Row Above', action: () => insertRowAbove(cell, table) },
      { text: 'Insert Row Below', action: () => insertRowBelow(cell, table) },
      { text: 'Insert Column Left', action: () => insertColumnLeft(cell, table) },
      { text: 'Insert Column Right', action: () => insertColumnRight(cell, table) },
      { text: 'Delete Row', action: () => deleteRow(cell, table) },
      { text: 'Delete Column', action: () => deleteColumn(cell, table) },
      { text: 'Delete Table', action: () => deleteTable(table) },
    ];
    
    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.textContent = item.text;
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        color: #333;
      `;
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.backgroundColor = '#f0f0f0';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.backgroundColor = 'transparent';
      });
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
        updateContent();
      });
      menu.appendChild(menuItem);
    });
    
    document.body.appendChild(menu);
    
    // Remove menu when clicking elsewhere
    const removeMenu = () => {
      menu.remove();
      document.removeEventListener('click', removeMenu);
    };
    setTimeout(() => {
      document.addEventListener('click', removeMenu);
    }, 100);
  };

  const insertRowAbove = (cell: Element, table: Element) => {
    const row = cell.closest('tr');
    if (!row) return;
    
    const newRow = document.createElement('tr');
    const cellCount = row.children.length;
    
    for (let i = 0; i < cellCount; i++) {
      const newCell = document.createElement('td');
      newCell.contentEditable = 'true';
      newCell.style.cssText = `
        border: 1px solid #ccc;
        padding: 12px;
        vertical-align: top;
        text-align: start;
        min-width: 120px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        font-size: 14px;
        font-family: inherit;
        height: auto;
        box-sizing: border-box;
        white-space: normal;
      `;
      newCell.dir = 'ltr';
      newCell.addEventListener('focus', handleCellFocus);
      newCell.addEventListener('click', handleCellClick);
      newCell.addEventListener('keydown', handleCellKeydown);
      newCell.addEventListener('paste', handleCellPaste);
      newCell.addEventListener('input', updateContent);
      newRow.appendChild(newCell);
    }
    
    row.parentNode?.insertBefore(newRow, row);
  };

  const insertRowBelow = (cell: Element, table: Element) => {
    const row = cell.closest('tr');
    if (!row) return;
    
    const newRow = document.createElement('tr');
    const cellCount = row.children.length;
    
    for (let i = 0; i < cellCount; i++) {
      const newCell = document.createElement('td');
      newCell.contentEditable = 'true';
      newCell.style.cssText = `
        border: 1px solid #ccc;
        padding: 12px;
        vertical-align: top;
        text-align: start;
        min-width: 120px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        font-size: 14px;
        font-family: inherit;
        height: auto;
        box-sizing: border-box;
        white-space: normal;
      `;
      newCell.dir = 'ltr';
      newCell.addEventListener('focus', handleCellFocus);
      newCell.addEventListener('click', handleCellClick);
      newCell.addEventListener('keydown', handleCellKeydown);
      newCell.addEventListener('paste', handleCellPaste);
      newCell.addEventListener('input', updateContent);
      newRow.appendChild(newCell);
    }
    
    if (row.nextSibling) {
      row.parentNode?.insertBefore(newRow, row.nextSibling);
    } else {
      row.parentNode?.appendChild(newRow);
    }
  };

  const insertColumnLeft = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentElement?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
      const newCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      newCell.contentEditable = 'true';
      newCell.style.cssText = `
        border: 1px solid #ccc;
        padding: 12px;
        ${rowIndex === 0 ? 'background-color: #f8f9fa;' : ''}
        vertical-align: top;
        text-align: start;
        min-width: 120px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        font-size: 14px;
        font-family: inherit;
        height: auto;
        box-sizing: border-box;
        white-space: normal;
      `;
      newCell.dir = 'ltr';
      newCell.addEventListener('focus', handleCellFocus);
      newCell.addEventListener('click', handleCellClick);
      newCell.addEventListener('keydown', handleCellKeydown);
      newCell.addEventListener('paste', handleCellPaste);
      newCell.addEventListener('input', updateContent);
      
      const targetCell = row.children[cellIndex];
      if (targetCell) {
        row.insertBefore(newCell, targetCell);
      }
    });
  };

  const insertColumnRight = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentElement?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
      const newCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      newCell.contentEditable = 'true';
      newCell.style.cssText = `
        border: 1px solid #ccc;
        padding: 12px;
        ${rowIndex === 0 ? 'background-color: #f8f9fa;' : ''}
        vertical-align: top;
        text-align: start;
        min-width: 120px;
        word-wrap: break-word;
        overflow-wrap: break-word;
        font-size: 14px;
        font-family: inherit;
        height: auto;
        box-sizing: border-box;
        white-space: normal;
      `;
      newCell.dir = 'ltr';
      newCell.addEventListener('focus', handleCellFocus);
      newCell.addEventListener('click', handleCellClick);
      newCell.addEventListener('keydown', handleCellKeydown);
      newCell.addEventListener('paste', handleCellPaste);
      newCell.addEventListener('input', updateContent);
      
      const targetCell = row.children[cellIndex + 1];
      if (targetCell) {
        row.insertBefore(newCell, targetCell);
      } else {
        row.appendChild(newCell);
      }
    });
  };

  const deleteRow = (cell: Element, table: Element) => {
    const row = cell.closest('tr');
    if (!row) return;
    
    // Don't delete if it's the only row
    const rows = table.querySelectorAll('tr');
    if (rows.length <= 1) return;
    
    row.remove();
  };

  const deleteColumn = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentElement?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    // Don't delete if it's the only column
    if (rows[0]?.children.length <= 1) return;
    
    rows.forEach(row => {
      const cellToDelete = row.children[cellIndex];
      if (cellToDelete) {
        cellToDelete.remove();
      }
    });
  };

  const deleteTable = (table: Element) => {
    table.remove();
  };

  const makeTableResizable = () => {
    const tables = editorRef.current?.querySelectorAll('table[data-editable-table="true"]');
    tables?.forEach(table => {
      // Remove any existing resize handles first
      table.querySelectorAll('.resize-handle').forEach(handle => handle.remove());
      
      // Add column resize handles only to headers
      const headers = table.querySelectorAll('thead th');
      headers.forEach((header, index) => {
        if (index < headers.length - 1) { // Don't add handle to last column
          const resizeHandle = document.createElement('div');
          resizeHandle.className = 'resize-handle';
          resizeHandle.style.cssText = `
            position: absolute;
            top: 0;
            right: -2px;
            width: 4px;
            height: 100%;
            background: transparent;
            cursor: col-resize;
            z-index: 1000;
          `;
          
          // Add hover effect
          resizeHandle.addEventListener('mouseenter', () => {
            resizeHandle.style.background = '#007acc';
          });
          
          resizeHandle.addEventListener('mouseleave', () => {
            resizeHandle.style.background = 'transparent';
          });
          
          let isResizing = false;
          let startX = 0;
          let startWidth = 0;
          
          resizeHandle.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = (header as HTMLElement).offsetWidth;
            e.preventDefault();
            e.stopPropagation();
          });
          
          document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            e.preventDefault();
            const width = startWidth + e.clientX - startX;
            if (width > 50) { // Minimum width
              (header as HTMLElement).style.width = width + 'px';
              // Also update corresponding cells in the column
              const columnIndex = Array.from(header.parentElement!.children).indexOf(header);
              table.querySelectorAll(`tbody tr td:nth-child(${columnIndex + 1})`).forEach(cell => {
                (cell as HTMLElement).style.width = width + 'px';
              });
            }
          });
          
          document.addEventListener('mouseup', () => {
            isResizing = false;
          });
          
          // Ensure header has relative positioning for absolute handle
          (header as HTMLElement).style.position = 'relative';
          header.appendChild(resizeHandle);
        }
      });
      
      // Don't make recursive call - already handled in setupTableControls
    });
  };


  const showCellColorPicker = (cell: HTMLElement, e: MouseEvent) => {
    // Remove any existing color picker
    document.querySelectorAll('.cell-color-picker').forEach(picker => picker.remove());
    
    const colorPicker = document.createElement('div');
    colorPicker.className = 'cell-color-picker';
    colorPicker.style.cssText = `
      position: fixed;
      top: ${e.clientY + 10}px;
      left: ${e.clientX + 10}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1001;
      padding: 8px;
    `;
    
    const colors = [
      '#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd',
      '#6c757d', '#495057', '#343a40', '#212529', '#ff0000', '#ff6b6b',
      '#fd79a8', '#fdcb6e', '#e17055', '#00b894', '#00cec9', '#0984e3',
      '#6c5ce7', '#a29bfe', '#ffeaa7', '#fab1a0', '#ff7675', '#fd79a8'
    ];
    
    const colorGrid = document.createElement('div');
    colorGrid.style.cssText = 'display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; margin-bottom: 8px;';
    
    colors.forEach(color => {
      const colorButton = document.createElement('button');
      colorButton.style.cssText = `
        width: 24px;
        height: 24px;
        border: 1px solid #ccc;
        border-radius: 2px;
        background-color: ${color};
        cursor: pointer;
      `;
      colorButton.addEventListener('click', () => {
        cell.style.backgroundColor = color;
        updateContent();
        colorPicker.remove();
      });
      colorGrid.appendChild(colorButton);
    });
    
    colorPicker.appendChild(colorGrid);
    
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove Color';
    removeButton.style.cssText = `
      width: 100%;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 2px;
      background: #f8f9fa;
      cursor: pointer;
      font-size: 12px;
    `;
    removeButton.addEventListener('click', () => {
      cell.style.backgroundColor = '';
      updateContent();
      colorPicker.remove();
    });
    
    colorPicker.appendChild(removeButton);
    document.body.appendChild(colorPicker);
    
    // Remove picker when clicking elsewhere
    const removePicker = () => {
      colorPicker.remove();
      document.removeEventListener('click', removePicker);
    };
    setTimeout(() => {
      document.addEventListener('click', removePicker);
    }, 100);
  };

  const showHeaderColorPicker = (cell: HTMLElement, e: MouseEvent) => {
    // Remove any existing color picker
    document.querySelectorAll('.cell-color-picker').forEach(picker => picker.remove());
    
    const colorPicker = document.createElement('div');
    colorPicker.className = 'cell-color-picker';
    colorPicker.style.cssText = `
      position: fixed;
      top: ${e.clientY + 10}px;
      left: ${e.clientX + 10}px;
      background: white;
      border: 1px solid #ccc;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 1001;
      padding: 8px;
    `;
    
    const headerColors = [
      '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd',
      '#ff6b6b', '#fd79a8', '#fdcb6e', '#e17055', '#00b894', 
      '#00cec9', '#0984e3', '#6c5ce7', '#a29bfe', '#ffeaa7',
      '#fab1a0', '#ff7675', '#fd79a8', '#74b9ff', '#0abde3'
    ];
    
    const colorGrid = document.createElement('div');
    colorGrid.style.cssText = 'display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-bottom: 8px;';
    
    headerColors.forEach(color => {
      const colorButton = document.createElement('button');
      colorButton.style.cssText = `
        width: 24px;
        height: 24px;
        border: 1px solid #ccc;
        border-radius: 2px;
        background-color: ${color};
        cursor: pointer;
      `;
      colorButton.addEventListener('click', () => {
        cell.style.backgroundColor = color;
        updateContent();
        colorPicker.remove();
      });
      colorGrid.appendChild(colorButton);
    });
    
    colorPicker.appendChild(colorGrid);
    
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove Color';
    removeButton.style.cssText = `
      width: 100%;
      padding: 4px 8px;
      border: 1px solid #ccc;
      border-radius: 2px;
      background: #f8f9fa;
      cursor: pointer;
      font-size: 12px;
    `;
    removeButton.addEventListener('click', () => {
      cell.style.backgroundColor = '';
      updateContent();
      colorPicker.remove();
    });
    
    colorPicker.appendChild(removeButton);
    document.body.appendChild(colorPicker);
    
    // Remove picker when clicking elsewhere
    const removePicker = () => {
      colorPicker.remove();
      document.removeEventListener('click', removePicker);
    };
    setTimeout(() => {
      document.addEventListener('click', removePicker);
    }, 100);
  };

  const removeCellColor = (cell: HTMLElement) => {
    cell.style.backgroundColor = '';
    updateContent();
  };

  const changeTextColor = (color: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      // Create a span with the specified color
      const span = document.createElement('span');
      if (color === 'inherit') {
        span.style.color = '';
      } else {
        span.style.color = color;
      }
      span.textContent = selectedText;
      
      // Replace the selected text
      range.deleteContents();
      range.insertNode(span);
      
      // Restore selection to the newly created span
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };


  const insertDivider = () => {
    insertText('<hr style="border: none; border-top: 2px solid #e5e7eb; margin: 20px 0;" /><br>');
  };

  const insertLink = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString() || '';
    
    const url = prompt("Enter URL:");
    if (!url) return;
    
    if (selectedText) {
      // Use selected text as link text and make it bold
      const range = selection!.getRangeAt(0);
      range.deleteContents();
      
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.style.cssText = 'color: #3b82f6; text-decoration: underline; font-weight: bold;';
      link.textContent = selectedText;
      
      range.insertNode(link);
      
      // Move cursor after link
      const afterRange = document.createRange();
      afterRange.setStartAfter(link);
      afterRange.collapse(true);
      selection!.removeAllRanges();
      selection!.addRange(afterRange);
    } else {
      const linkText = prompt("Enter link text:") || url;
      insertText(`<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">${linkText}</a>`);
    }
    updateContent();
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
            const imageId = `img-${Date.now()}`;
            insertText(`
              <div class="image-container" style="text-align: left; margin: 10px 0;">
                <img 
                  id="${imageId}" 
                  src="${result}" 
                  alt="${file.name}" 
                  style="max-width: 100%; height: auto; border-radius: 8px; cursor: pointer; display: block;" 
                  onclick="showImageControls('${imageId}')"
                />
              </div>
            `);
            
            // Add image control functionality
            setTimeout(() => setupImageControls(), 100);
            
            toast({
              title: "Image inserted",
              description: "Click the image to resize and align it",
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
          const imageId = `img-${Date.now()}`;
          insertText(`
            <div class="image-container" style="text-align: left; margin: 10px 0;">
              <img 
                id="${imageId}" 
                src="${url}" 
                alt="${alt}" 
                style="max-width: 100%; height: auto; border-radius: 8px; cursor: pointer; display: block;" 
                onclick="showImageControls('${imageId}')"
              />
            </div>
          `);
          setTimeout(() => setupImageControls(), 100);
        } else {
          insertText(`<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline;">${alt}</a>`);
        }
      }
    }
  };

  const setupImageControls = () => {
    // Add global function for image controls
    (window as any).showImageControls = (imageId: string) => {
      const img = document.getElementById(imageId);
      if (!img) return;
      
      // Remove existing controls
      document.querySelectorAll('.image-controls').forEach(control => control.remove());
      
      const controls = document.createElement('div');
      controls.className = 'image-controls';
      controls.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        padding: 12px;
        min-width: 200px;
      `;
      
      controls.innerHTML = `
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Image Controls</h4>
        <div style="margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px;">Alignment:</label>
          <button onclick="alignImage('${imageId}', 'left')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Left</button>
          <button onclick="alignImage('${imageId}', 'center')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Center</button>
          <button onclick="alignImage('${imageId}', 'right')" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Right</button>
        </div>
        <div style="margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px;">Size:</label>
          <button onclick="resizeImage('${imageId}', '25%')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">25%</button>
          <button onclick="resizeImage('${imageId}', '50%')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">50%</button>
          <button onclick="resizeImage('${imageId}', '100%')" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">100%</button>
        </div>
        <button onclick="closeImageControls()" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: #f5f5f5;">Close</button>
      `;
      
      document.body.appendChild(controls);
      
      // Click outside to close
      setTimeout(() => {
        document.addEventListener('click', (e) => {
          if (!controls.contains(e.target as Node)) {
            controls.remove();
          }
        }, { once: true });
      }, 100);
    };
    
    (window as any).alignImage = (imageId: string, alignment: string) => {
      const img = document.getElementById(imageId);
      if (!img) return;
      
      const container = img.parentElement;
      if (container) {
        container.style.textAlign = alignment;
        updateContent();
      }
    };
    
    (window as any).resizeImage = (imageId: string, size: string) => {
      const img = document.getElementById(imageId) as HTMLImageElement;
      if (!img) return;
      
      img.style.width = size;
      img.style.height = 'auto';
      updateContent();
    };
    
    (window as any).closeImageControls = () => {
      document.querySelectorAll('.image-controls').forEach(control => control.remove());
    };
  };

  const insertYouTube = () => {
    const url = prompt("Enter YouTube URL:");
    if (url) {
      const videoId = extractYouTubeId(url);
      if (videoId) {
        const iframeId = `youtube-${Date.now()}`;
        insertText(`
          <div class="youtube-container" style="text-align: center !important; margin: 10px 0;">
            <iframe 
              id="${iframeId}"
              width="720" 
              height="405" 
              src="https://www.youtube.com/embed/${videoId}" 
              frameborder="0" 
              allowfullscreen 
              style="max-width: 100%; cursor: pointer; border-radius: 8px; display: block; margin: 0 auto;"
              onclick="showYouTubeControls('${iframeId}')"
            ></iframe>
          </div>
        `);
        
        setTimeout(() => setupYouTubeControls(), 100);
        
        toast({
          title: "YouTube video inserted",
          description: "Click the video to change alignment",
        });
      } else {
        toast({
          title: "Invalid YouTube URL",
          description: "Please enter a valid YouTube URL",
          variant: "destructive",
        });
      }
    }
  };

  const setupYouTubeControls = () => {
    (window as any).showYouTubeControls = (iframeId: string) => {
      const iframe = document.getElementById(iframeId);
      if (!iframe) return;
      
      // Remove existing controls
      document.querySelectorAll('.youtube-controls').forEach(control => control.remove());
      
      const controls = document.createElement('div');
      controls.className = 'youtube-controls';
      controls.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        padding: 12px;
        min-width: 200px;
      `;
      
      controls.innerHTML = `
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Video Alignment</h4>
        <div style="margin-bottom: 8px;">
          <button onclick="alignYouTube('${iframeId}', 'left')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Left</button>
          <button onclick="alignYouTube('${iframeId}', 'center')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Center</button>
          <button onclick="alignYouTube('${iframeId}', 'right')" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Right</button>
        </div>
        <button onclick="closeYouTubeControls()" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: #f5f5f5;">Close</button>
      `;
      
      document.body.appendChild(controls);
      
      // Click outside to close
      setTimeout(() => {
        document.addEventListener('click', (e) => {
          if (!controls.contains(e.target as Node)) {
            controls.remove();
          }
        }, { once: true });
      }, 100);
    };
    
    (window as any).alignYouTube = (iframeId: string, alignment: string) => {
      const iframe = document.getElementById(iframeId);
      if (!iframe) return;
      
      const container = iframe.parentElement;
      if (container) {
        container.style.textAlign = alignment;
        updateContent();
      }
    };
    
    (window as any).closeYouTubeControls = () => {
      document.querySelectorAll('.youtube-controls').forEach(control => control.remove());
    };
  };


  const setupIframeControls = () => {
    (window as any).showIframeControls = (iframeId: string) => {
      const iframe = document.getElementById(iframeId);
      if (!iframe) return;
      
      // Remove existing controls
      document.querySelectorAll('.iframe-controls').forEach(control => control.remove());
      
      const controls = document.createElement('div');
      controls.className = 'iframe-controls';
      controls.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: white;
        border: 1px solid #ccc;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        z-index: 1000;
        padding: 12px;
        min-width: 200px;
      `;
      
      controls.innerHTML = `
        <h4 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">Iframe Controls</h4>
        <div style="margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px;">Alignment:</label>
          <button onclick="alignIframe('${iframeId}', 'left')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Left</button>
          <button onclick="alignIframe('${iframeId}', 'center')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Center</button>
          <button onclick="alignIframe('${iframeId}', 'right')" style="padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Right</button>
        </div>
        <div style="margin-bottom: 8px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px;">Size:</label>
          <button onclick="resizeIframe('${iframeId}', '100%', '600px')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Small</button>
          <button onclick="resizeIframe('${iframeId}', '100%', '800px')" style="margin-right: 4px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Medium</button>
          <button onclick="resizeIframe('${iframeId}', '100%', '1200px')" style="margin-bottom: 8px; padding: 4px 8px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer;">Large</button>
        </div>
        <div style="margin-bottom: 12px;">
          <label style="display: block; margin-bottom: 4px; font-size: 12px;">Custom Size:</label>
          <div style="display: flex; gap: 8px; align-items: center;">
            <input type="number" id="iframe-width-${iframeId}" placeholder="Width %" min="10" max="100" step="1" style="width: 80px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;" />
            <span style="font-size: 12px;">%</span>
            <span style="font-size: 12px;">×</span>
            <input type="number" id="iframe-height-${iframeId}" placeholder="Height px" min="100" step="10" style="width: 90px; padding: 4px; border: 1px solid #ccc; border-radius: 4px;" />
            <span style="font-size: 12px;">px</span>
            <button onclick="applyCustomIframeSize('${iframeId}')" style="padding: 4px 8px; border: 1px solid #007acc; border-radius: 4px; cursor: pointer; background: #007acc; color: white;">Apply</button>
          </div>
        </div>
        <button onclick="closeIframeControls()" style="width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; cursor: pointer; background: #f5f5f5;">Close</button>
      `;
      
      document.body.appendChild(controls);
      
      // Click outside to close
      setTimeout(() => {
        document.addEventListener('click', (e) => {
          if (!controls.contains(e.target as Node)) {
            controls.remove();
          }
        }, { once: true });
      }, 100);
    };
    
    (window as any).alignIframe = (iframeId: string, alignment: string) => {
      const iframe = document.getElementById(iframeId);
      if (!iframe) return;
      
      const container = iframe.parentElement;
      if (container) {
        container.style.textAlign = alignment;
        updateContent();
      }
    };
    
    (window as any).resizeIframe = (iframeId: string, width: string, height: string) => {
      const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
      if (!iframe) return;
      
      iframe.style.width = width;
      iframe.style.height = height;
      updateContent();
    };

    (window as any).applyCustomIframeSize = (iframeId: string) => {
      const iframe = document.getElementById(iframeId) as HTMLIFrameElement;
      const widthInput = document.getElementById(`iframe-width-${iframeId}`) as HTMLInputElement;
      const heightInput = document.getElementById(`iframe-height-${iframeId}`) as HTMLInputElement;
      
      if (!iframe || !widthInput || !heightInput) return;
      
      const width = widthInput.value ? `${widthInput.value}%` : '100%';
      const height = heightInput.value ? `${heightInput.value}px` : '800px';
      
      iframe.style.width = width;
      iframe.style.height = height;
      updateContent();
      
      // Show feedback
      toast({
        title: "Iframe resized",
        description: `Size set to ${width} × ${height}`,
      });
    };
    
    (window as any).closeIframeControls = () => {
      document.querySelectorAll('.iframe-controls').forEach(control => control.remove());
    };
  };

  const basicToolbarItems = [
    { icon: Bold, action: () => formatText('bold'), tooltip: "Bold (Ctrl+B)" },
    { icon: Italic, action: () => formatText('italic'), tooltip: "Italic (Ctrl+I)" },
    { icon: Underline, action: () => formatText('underline'), tooltip: "Underline (Ctrl+U)" },
    { icon: Strikethrough, action: () => formatText('strikeThrough'), tooltip: "Strikethrough" },
  ];

  const alignmentToolbarItems = [
    { icon: AlignLeft, action: () => {
      // Check if cursor is near a YouTube video or image
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
        
        // Find nearest YouTube iframe or image
        const nearestMedia = element?.closest('.youtube-container, .image-container') || 
                           element?.querySelector('iframe[src*="youtube"], .image-container img');
        
        if (nearestMedia) {
          if (nearestMedia.classList.contains('youtube-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'left';
          } else if (nearestMedia.classList.contains('image-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'left';
          } else {
            // Direct iframe or img element
            const container = nearestMedia.parentElement;
            if (container) (container as HTMLElement).style.textAlign = 'left';
          }
          updateContent();
        } else {
          formatText('justifyLeft');
        }
      } else {
        formatText('justifyLeft');
      }
    }, tooltip: "Align Left" },
    { icon: AlignCenter, action: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
        
        const nearestMedia = element?.closest('.youtube-container, .image-container') || 
                           element?.querySelector('iframe[src*="youtube"], .image-container img');
        
        if (nearestMedia) {
          if (nearestMedia.classList.contains('youtube-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'center';
          } else if (nearestMedia.classList.contains('image-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'center';
          } else {
            const container = nearestMedia.parentElement;
            if (container) (container as HTMLElement).style.textAlign = 'center';
          }
          updateContent();
        } else {
          formatText('justifyCenter');
        }
      } else {
        formatText('justifyCenter');
      }
    }, tooltip: "Align Center" },
    { icon: AlignRight, action: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.TEXT_NODE ? container.parentElement : container as Element;
        
        const nearestMedia = element?.closest('.youtube-container, .image-container') || 
                           element?.querySelector('iframe[src*="youtube"], .image-container img');
        
        if (nearestMedia) {
          if (nearestMedia.classList.contains('youtube-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'right';
          } else if (nearestMedia.classList.contains('image-container')) {
            (nearestMedia as HTMLElement).style.textAlign = 'right';
          } else {
            const container = nearestMedia.parentElement;
            if (container) (container as HTMLElement).style.textAlign = 'right';
          }
          updateContent();
        } else {
          formatText('justifyRight');
        }
      } else {
        formatText('justifyRight');
      }
    }, tooltip: "Align Right" },
    { icon: AlignJustify, action: () => formatText('justifyFull'), tooltip: "Justify" },
  ];

  const increaseFontSize = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      const currentSize = getCurrentFontSize();
      const newSize = Math.min(48, currentSize + 2);
      
      // Create a span with the new font size
      const span = document.createElement('span');
      span.style.fontSize = `${newSize}px`;
      span.textContent = selectedText;
      
      // Replace the selected text
      range.deleteContents();
      range.insertNode(span);
      
      // Restore selection to the newly created span
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };

  const decreaseFontSize = () => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      const currentSize = getCurrentFontSize();
      const newSize = Math.max(10, currentSize - 2);
      
      // Create a span with the new font size
      const span = document.createElement('span');
      span.style.fontSize = `${newSize}px`;
      span.textContent = selectedText;
      
      // Replace the selected text
      range.deleteContents();
      range.insertNode(span);
      
      // Restore selection to the newly created span
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };

  const setFontSize = (size: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      // Check if we're inside a table cell
      const parentElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer as Element;
      
      const isInTable = parentElement?.closest('table[data-editable-table="true"]');
      
      if (isInTable) {
        // For table cells, apply font size to the entire cell to maintain table structure
        const cell = parentElement?.closest('td, th') as HTMLElement;
        if (cell) {
          cell.style.fontSize = size;
          updateContent();
          return;
        }
      }
      
      // Create a span with the new font size while preserving other styles
      const span = document.createElement('span');
      span.style.fontSize = size;
      
      // Preserve existing styles from parent if any
      if (parentElement && (parentElement as HTMLElement).style) {
        const computedStyle = window.getComputedStyle(parentElement);
        if (computedStyle.textAlign && computedStyle.textAlign !== 'start') {
          span.style.textAlign = computedStyle.textAlign;
        }
        if (computedStyle.fontWeight && computedStyle.fontWeight !== 'normal') {
          span.style.fontWeight = computedStyle.fontWeight;
        }
        if (computedStyle.fontStyle && computedStyle.fontStyle !== 'normal') {
          span.style.fontStyle = computedStyle.fontStyle;
        }
        if (computedStyle.textDecoration && computedStyle.textDecoration !== 'none') {
          span.style.textDecoration = computedStyle.textDecoration;
        }
      }
      
      span.textContent = selectedText;
      
      // Replace the selected text
      range.deleteContents();
      range.insertNode(span);
      
      // Restore selection to the newly created span
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };

  const textSizeToolbarItems = [
    { icon: Minus, action: decreaseFontSize, tooltip: "Decrease Text Size" },
    { icon: Plus, action: increaseFontSize, tooltip: "Increase Text Size" },
  ];

  const getCurrentFontSize = (): number => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const parentElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer as Element;
      
      if (parentElement) {
        const computedStyle = window.getComputedStyle(parentElement as Element);
        return parseInt(computedStyle.fontSize) || 16;
      }
    }
    return 16; // Default font size
  };

  const formattingToolbarItems = [
    ...basicToolbarItems,
    ...alignmentToolbarItems,
  ];

  const listToolbarItems = [
    { icon: List, action: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Check if cursor is already in a list item
        const currentListItem = range.startContainer.parentElement?.closest('li');
        const currentList = currentListItem?.closest('ul, ol');
        
        if (currentList && currentList.tagName === 'UL') {
          // Already in bullet list - remove list formatting
          const listText = Array.from(currentList.querySelectorAll('li'))
            .map(li => li.textContent || '')
            .join('\n');
          
          const textNode = document.createTextNode(listText);
          currentList.parentNode?.replaceChild(textNode, currentList);
          
          // Position cursor after the text
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else if (!selection.toString()) {
          // No text selected - insert new bullet list
          const ul = document.createElement('ul');
          ul.style.cssText = 'margin: 16px 0; padding-left: 40px; list-style-type: disc;';
          const li = document.createElement('li');
          li.innerHTML = '&nbsp;';
          ul.appendChild(li);
          
          range.insertNode(ul);
          
          const newRange = document.createRange();
          newRange.setStart(li, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          // Text is selected - convert to bullet list
          const selectedText = selection.toString();
          range.deleteContents();
          
          const lines = selectedText.split('\n').filter(line => line.trim() !== '');
          const ul = document.createElement('ul');
          ul.style.cssText = 'margin: 16px 0; padding-left: 40px; list-style-type: disc;';
          
          lines.forEach(line => {
            const li = document.createElement('li');
            li.textContent = line.trim();
            ul.appendChild(li);
          });
          
          range.insertNode(ul);
          
          const afterRange = document.createRange();
          afterRange.setStartAfter(ul);
          afterRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(afterRange);
        }
        updateContent();
      }
    }, tooltip: "Bullet List" },
    { icon: ListOrdered, action: () => {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        
        // Check if cursor is already in a list item
        const currentListItem = range.startContainer.parentElement?.closest('li');
        const currentList = currentListItem?.closest('ul, ol');
        
        if (currentList && currentList.tagName === 'OL') {
          // Already in numbered list - remove list formatting
          const listText = Array.from(currentList.querySelectorAll('li'))
            .map(li => li.textContent || '')
            .join('\n');
          
          const textNode = document.createTextNode(listText);
          currentList.parentNode?.replaceChild(textNode, currentList);
          
          // Position cursor after the text
          const newRange = document.createRange();
          newRange.setStartAfter(textNode);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else if (!selection.toString()) {
          // No text selected - insert new numbered list
          const ol = document.createElement('ol');
          ol.style.cssText = 'margin: 16px 0; padding-left: 40px; list-style-type: decimal;';
          const li = document.createElement('li');
          li.innerHTML = '&nbsp;';
          ol.appendChild(li);
          
          range.insertNode(ol);
          
          const newRange = document.createRange();
          newRange.setStart(li, 0);
          newRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(newRange);
        } else {
          // Text is selected - convert to numbered list
          const selectedText = selection.toString();
          range.deleteContents();
          
          const lines = selectedText.split('\n').filter(line => line.trim() !== '');
          const ol = document.createElement('ol');
          ol.style.cssText = 'margin: 16px 0; padding-left: 40px; list-style-type: decimal;';
          
          lines.forEach(line => {
            const li = document.createElement('li');
            li.textContent = line.trim();
            ol.appendChild(li);
          });
          
          range.insertNode(ol);
          
          const afterRange = document.createRange();
          afterRange.setStartAfter(ol);
          afterRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(afterRange);
        }
        updateContent();
      }
    }, tooltip: "Numbered List" },
    { icon: Quote, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        const selectedText = selection.toString();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const blockquote = document.createElement('blockquote');
        blockquote.style.cssText = 'border-left: 4px solid #e5e7eb; padding-left: 16px; margin: 16px 0; font-style: italic;';
        blockquote.textContent = selectedText;
        
        range.insertNode(blockquote);
        
        // Move cursor after blockquote
        const afterRange = document.createRange();
        afterRange.setStartAfter(blockquote);
        afterRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(afterRange);
      } else {
        const blockquote = document.createElement('blockquote');
        blockquote.style.cssText = 'border-left: 4px solid #e5e7eb; padding-left: 16px; margin: 16px 0; font-style: italic;';
        blockquote.textContent = 'Quote text here';
        
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.insertNode(blockquote);
          
          // Move cursor after blockquote
          const afterRange = document.createRange();
          afterRange.setStartAfter(blockquote);
          afterRange.collapse(true);
          selection.removeAllRanges();
          selection.addRange(afterRange);
        }
      }
      updateContent();
    }, tooltip: "Quote" },
  ];

  const insertToolbarItems = [
    { icon: Link, action: insertLink, tooltip: "Insert Link" },
    { icon: Image, action: insertImage, tooltip: "Insert Image" },
    { icon: Youtube, action: insertYouTube, tooltip: "Insert YouTube Video" },
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

  // Enhanced paste handling for tables, images, and links
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    
    const clipboardData = e.clipboardData;
    const items = clipboardData.items;
    
    // Check for images first
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile();
        if (blob) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const result = event.target?.result as string;
            const imageId = `img-${Date.now()}`;
            insertText(`
              <div class="image-container" style="text-align: left; margin: 10px 0;">
                <img 
                  id="${imageId}" 
                  src="${result}" 
                  alt="Pasted image" 
                  style="max-width: 100%; height: auto; border-radius: 8px; cursor: pointer; display: block;" 
                  onclick="showImageControls('${imageId}')"
                />
              </div>
            `);
            // Add image control functionality
            setTimeout(() => setupImageControls(), 100);
            toast({
              title: "Image pasted",
              description: "Click the image to resize and align it",
            });
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
    }
    
    // Handle text content
    const pastedText = clipboardData.getData('text/plain');
    const pastedHtml = clipboardData.getData('text/html');
    
    if (pastedHtml) {
      // Handle HTML content (including tables)
      const parser = new DOMParser();
      const doc = parser.parseFromString(pastedHtml, 'text/html');
      
      // Check if it contains a table
      const tables = doc.querySelectorAll('table');
      if (tables.length > 0) {
        tables.forEach(table => {
          // Convert pasted table to our format with proper styling
          table.setAttribute('data-editable-table', 'true');
          table.style.cssText = 'border-collapse: collapse; width: 100%; margin: 10px 0; position: relative;';
          
          // Style headers and add event listeners
          table.querySelectorAll('th').forEach(th => {
            const thElement = th as HTMLElement;
            thElement.style.cssText = 'border: 1px solid #ccc; padding: 12px; background-color: #f8f9fa; vertical-align: top; text-align: left; min-width: 120px; word-wrap: break-word; overflow-wrap: break-word; font-size: 14px; font-family: inherit; height: auto; box-sizing: border-box; writing-mode: horizontal-tb; direction: ltr; white-space: normal;';
            thElement.contentEditable = 'true';
            thElement.dir = 'ltr';
            thElement.addEventListener('focus', handleCellFocus);
            thElement.addEventListener('click', handleCellClick);
            thElement.addEventListener('keydown', handleCellKeydown);
            thElement.addEventListener('paste', handleCellPaste);
            thElement.addEventListener('input', updateContent);
          });
          
          // Style data cells and add event listeners
          table.querySelectorAll('td').forEach(td => {
            const tdElement = td as HTMLElement;
            tdElement.style.cssText = 'border: 1px solid #ccc; padding: 12px; vertical-align: top; text-align: left; min-width: 120px; word-wrap: break-word; overflow-wrap: break-word; font-size: 14px; font-family: inherit; height: auto; box-sizing: border-box; writing-mode: horizontal-tb; direction: ltr; white-space: normal;';
            tdElement.contentEditable = 'true';
            tdElement.dir = 'ltr';
            tdElement.addEventListener('focus', handleCellFocus);
            tdElement.addEventListener('click', handleCellClick);
            tdElement.addEventListener('keydown', handleCellKeydown);
            tdElement.addEventListener('paste', handleCellPaste);
            tdElement.addEventListener('input', updateContent);
          });
        });
        
        insertText(doc.body.innerHTML);
        setTimeout(() => {
          setupTableControls();
          makeTableResizable();
        }, 100);
        return;
      }
      
      // Check if it contains iframes and handle them specially
      const iframes = doc.querySelectorAll('iframe');
      if (iframes.length > 0) {
        iframes.forEach(iframe => {
          const iframeId = `iframe-${Date.now()}`;
          
          // Create wrapper container
          const container = document.createElement('div');
          container.className = 'iframe-container';
          container.style.cssText = 'text-align: center; margin: 10px 0; border: 1px solid #e5e7eb; border-radius: 8px;';
          
          // Clone the iframe and add our properties
          const newIframe = iframe.cloneNode(true) as HTMLIFrameElement;
          newIframe.id = iframeId;
          
          // Preserve existing height from original iframe
          const originalHeight = iframe.getAttribute('height') || iframe.style.height;
          const originalWidth = iframe.getAttribute('width') || iframe.style.width;
          
          // Build CSS preserving original dimensions but removing height limits
          let cssStyles = 'border: none; display: block; width: 100%;';
          if (originalHeight) {
            cssStyles += ` height: ${originalHeight}${originalHeight.includes('px') || originalHeight.includes('%') ? '' : 'px'};`;
          }
          if (originalWidth) {
            cssStyles += ` width: ${originalWidth}${originalWidth.includes('px') || originalWidth.includes('%') ? '' : '%'};`;
          }
          
          newIframe.style.cssText = cssStyles;
          newIframe.frameBorder = '0';
          newIframe.allowFullscreen = true;
          
          // Set default dimensions only if not specified anywhere
          if (!originalWidth && (!newIframe.width || newIframe.width === '')) {
            newIframe.width = '100%';
          }
          if (!originalHeight && (!newIframe.height || newIframe.height === '')) {
            newIframe.height = '800px';
          }
          
          newIframe.onclick = () => (window as any).showIframeControls(iframeId);
          
          container.appendChild(newIframe);
          iframe.replaceWith(container);
        });
        
        // Insert the modified HTML
        const selection = window.getSelection();
        if (selection && selection.rangeCount > 0) {
          const range = selection.getRangeAt(0);
          range.deleteContents();
          
          // Convert HTML string to actual DOM elements
          const tempDiv = document.createElement('div');
          tempDiv.innerHTML = doc.body.innerHTML;
          
          // Insert each child element
          while (tempDiv.firstChild) {
            range.insertNode(tempDiv.firstChild);
          }
        }
        
        updateContent();
        setTimeout(() => setupIframeControls(), 100);
        
        toast({
          title: "Iframe embedded",
          description: "Iframe has been embedded successfully. Click it to adjust settings.",
        });
        return;
      }
      
      // Process links in HTML content
      const links = doc.querySelectorAll('a');
      links.forEach(link => {
        link.style.cssText = 'color: #3b82f6; text-decoration: underline; font-weight: bold;';
        link.target = '_blank';
      });
      
      if (doc.body.innerHTML.trim()) {
        insertText(doc.body.innerHTML);
        return;
      }
    }
    
    if (pastedText) {
      // Check if it's a URL
      const urlRegex = /^https?:\/\/[^\s]+$/;
      if (urlRegex.test(pastedText.trim())) {
        const url = pastedText.trim();
        const linkText = prompt("Enter link text:") || url;
        insertText(`<a href="${url}" target="_blank" style="color: #3b82f6; text-decoration: underline; font-weight: bold;">${linkText}</a>`);
        return;
      }
      
      // Handle regular text
      const lines = pastedText.split('\n');
      const formattedText = lines.map(line => line.trim()).join('<br>');
      insertText(formattedText);
    }
  };

  // Handle keyboard shortcuts and code block deletion
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Handle code block deletion with backspace
    if (e.key === 'Backspace') {
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        const container = range.commonAncestorContainer;
        
        // Check if cursor is at the start of a code block
        const preElement = container.nodeType === Node.TEXT_NODE 
          ? container.parentElement?.closest('pre')
          : (container as Element).closest('pre');
          
        if (preElement && range.startOffset === 0 && range.endOffset === 0) {
          // If the code block is empty or cursor is at the very beginning
          const textContent = preElement.textContent || '';
          if (textContent.trim() === '' || range.startOffset === 0) {
            e.preventDefault();
            
            // Replace the code block with a regular paragraph
            const newP = document.createElement('p');
            newP.innerHTML = '<br>';
            preElement.parentNode?.replaceChild(newP, preElement);
            
            // Place cursor in the new paragraph
            const newRange = document.createRange();
            newRange.setStart(newP, 0);
            newRange.collapse(true);
            selection.removeAllRanges();
            selection.addRange(newRange);
            
            updateContent();
          }
        }
      }
    }
  };

  // Function to get clean text preview (strip HTML formatting)
  const getCleanTextPreview = (htmlContent: string, maxLength: number = 150): string => {
    if (!htmlContent) return '';
    
    // Create a temporary element to parse HTML
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    
    // Remove script and style elements
    const scripts = tempDiv.querySelectorAll('script, style');
    scripts.forEach(el => el.remove());
    
    // Get text content and clean it up
    let textContent = tempDiv.textContent || tempDiv.innerText || '';
    
    // Remove extra whitespace and line breaks
    textContent = textContent.replace(/\s+/g, ' ').trim();
    
    // Truncate if necessary
    if (textContent.length > maxLength) {
      textContent = textContent.substring(0, maxLength).trim() + '...';
    }
    
    return textContent;
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
      console.log('Attempting to delete page:', pageId);
      const { error } = await supabase
        .from('pages')
        .delete()
        .eq('id', pageId);

      if (error) {
        console.error('Delete error:', error);
        throw error;
      }

      console.log('Page deleted successfully');
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

  const startEditing = (index: number) => {
    const item = recommendedReading[index];
    setEditingIndex(index);
    setEditingItem({
      title: item.title,
      url: item.url || '',
      description: item.description,
      type: item.type,
      fileName: item.fileName || '',
      fileUrl: item.fileUrl || '',
      category: item.category || 'General'
    });
  };

  const saveEdit = () => {
    if (editingIndex !== null && editingItem.title && editingItem.description) {
      if (editingItem.type === 'file') {
        if (editingItem.fileUrl && editingItem.fileName) {
          setRecommendedReading(prev => {
            const newItems = [...prev];
            newItems[editingIndex] = {
              title: editingItem.title,
              description: editingItem.description,
              type: 'file',
              fileUrl: editingItem.fileUrl,
              fileName: editingItem.fileName,
              category: editingItem.category
            };
            return newItems;
          });
          setEditingIndex(null);
          toast({
            title: "Updated",
            description: "Recommended reading item updated.",
          });
        } else {
          toast({
            title: "Missing file",
            description: "Please select a file.",
            variant: "destructive"
          });
        }
      } else if (editingItem.url) {
        setRecommendedReading(prev => {
          const newItems = [...prev];
          newItems[editingIndex] = {
            title: editingItem.title,
            url: editingItem.url,
            description: editingItem.description,
            type: 'link',
            category: editingItem.category
          };
          return newItems;
        });
        setEditingIndex(null);
        toast({
          title: "Updated",
          description: "Recommended reading item updated.",
        });
      } else {
        toast({
          title: "Missing URL",
          description: "Please enter a URL for the link.",
          variant: "destructive"
        });
      }
    } else {
      toast({
        title: "Missing information",
        description: "Please fill in title and description.",
        variant: "destructive"
      });
    }
  };

  const cancelEdit = () => {
    setEditingIndex(null);
    setEditingItem({
      title: '',
      url: '',
      description: '',
      type: 'link',
      fileName: '',
      fileUrl: '',
      category: 'General'
    });
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
              dangerouslySetInnerHTML={{ __html: contentRef.current.split('RECOMMENDED_READING:')[0] }}
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
                        <a 
                          href={item.url} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline text-sm block mb-2"
                          onClick={(e) => {
                            e.preventDefault();
                            // Add protocol if missing
                            let url = item.url || '';
                            if (url && !url.match(/^https?:\/\//i)) {
                              url = 'https://' + url;
                            }
                            window.open(url, '_blank', 'noopener,noreferrer');
                          }}
                        >
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
            
            <Button 
              onClick={handleManualSave} 
              disabled={isSaving}
              className="bg-gradient-primary"
            >
              <Save className="h-4 w-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save'}
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

            {/* Text Size Controls */}
            <div className="flex items-center gap-1 px-2 border-r">
              {textSizeToolbarItems.map((item, index) => (
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
              
              {/* Font Size Dropdown */}
              <Select onValueChange={(value) => setFontSize(`${value}px`)}>
                <SelectTrigger className="h-8 w-20 text-xs">
                  <SelectValue placeholder="Size" />
                </SelectTrigger>
                <SelectContent>
                  {[10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 42, 48].map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}px
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Text Color */}
            <div className="flex items-center gap-1 px-2 border-r">
              <ColorPicker onColorSelect={changeTextColor} size="sm" />
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
              onPaste={handlePaste}
              onKeyDown={handleKeyDown}
              className="w-full p-4 border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 bg-background text-foreground min-h-[800px] prose prose-lg max-w-none"
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
                        if (newRecommendation.title && newRecommendation.description) {
                          if (newRecommendation.type === 'file') {
                            // Check if file is already selected
                             if (newRecommendation.fileUrl && newRecommendation.fileName) {
                               const newItem = {
                                 title: newRecommendation.title,
                                 description: newRecommendation.description,
                                 type: 'file' as const,
                                 fileUrl: newRecommendation.fileUrl,
                                 fileName: newRecommendation.fileName,
                                 category: newRecommendation.category
                               };
                                setRecommendedReading(prev => {
                                  const newList = [...prev, newItem];
                                  // Immediately trigger save to persist the change
                                  setTimeout(() => {
                                    if (pageId) {
                                      performSave(false);
                                    }
                                  }, 100);
                                  // Log the addition
                                  logChange('add', null, newItem, {
                                    item_count: newList.length,
                                    item_type: 'file'
                                  });
                                  return newList;
                                });
                               setNewRecommendation({ title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '', category: 'General' });
                               toast({
                                 title: "Added",
                                 description: "Recommended reading file added.",
                               });
                            } else {
                              toast({
                                title: "No file selected",
                                description: "Please select a file first.",
                                variant: "destructive"
                              });
                            }
                           } else if (newRecommendation.url) {
                             const newItem = {
                               title: newRecommendation.title,
                               url: newRecommendation.url,
                               description: newRecommendation.description,
                               type: 'link' as const,
                               category: newRecommendation.category
                             };
                             setRecommendedReading(prev => {
                               const newList = [...prev, newItem];
                               // Log the addition
                               logChange('add', null, newItem, {
                                 item_count: newList.length,
                                 item_type: 'link'
                               });
                               return newList;
                             });
                             setNewRecommendation({ title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '', category: 'General' });
                             toast({
                               title: "Added",
                               description: "Recommended reading item added.",
                             });
                          } else {
                            toast({
                              title: "Missing URL",
                              description: "Please enter a URL for the link.",
                              variant: "destructive"
                            });
                          }
                        } else {
                          toast({
                            title: "Missing information",
                            description: "Please fill in title and description.",
                            variant: "destructive"
                          });
                        }
                       }}
                       variant="outline"
                       size="sm"
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
                    {/* First row: Category → Title → Link/File */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <Input
                        placeholder="Category"
                        value={newRecommendation.category}
                        onChange={(e) => setNewRecommendation(prev => ({ ...prev, category: e.target.value }))}
                      />
                      <Input
                        placeholder="Title"
                        value={newRecommendation.title}
                        onChange={(e) => setNewRecommendation(prev => ({ ...prev, title: e.target.value }))}
                      />
                      {newRecommendation.type === 'link' && (
                        <Input
                          placeholder="Link"
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
                              accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.mp4,.mov,.avi"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = (event) => {
                                    const result = event.target?.result as string;
                                    setNewRecommendation(prev => ({ 
                                      ...prev, 
                                      fileName: file.name, 
                                      fileUrl: result 
                                    }));
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => document.getElementById('reading-file-upload')?.click()}
                              className="w-full"
                            >
                              {newRecommendation.fileName ? 'Change File' : 'Upload File'}
                            </Button>
                            {newRecommendation.fileName && (
                              <p className="text-sm text-muted-foreground">📁 {newRecommendation.fileName}</p>
                            )}
                          </div>
                        )}
                    </div>
                    
                    {/* Second row: Description (full width) */}
                    <div className="space-y-2">
                      <Textarea
                        placeholder="Description"
                        value={newRecommendation.description}
                        onChange={(e) => setNewRecommendation(prev => ({ ...prev, description: e.target.value }))}
                        rows={3}
                        className="w-full"
                      />
                    </div>
                 </div>

                  {/* Existing recommendations */}
                   {recommendedReading.map((item, index) => (
                     <div key={index} className="p-3 border rounded-lg bg-muted/20">
                       {editingIndex === index ? (
                         // Edit form
                         <div className="space-y-3">
                           <div className="flex gap-2">
                             <Button
                               variant={editingItem.type === 'link' ? 'default' : 'outline'}
                               size="sm"
                               onClick={() => setEditingItem(prev => ({ ...prev, type: 'link' }))}
                             >
                               Link
                             </Button>
                             <Button
                               variant={editingItem.type === 'file' ? 'default' : 'outline'}
                               size="sm"
                               onClick={() => setEditingItem(prev => ({ ...prev, type: 'file' }))}
                             >
                               File
                             </Button>
                           </div>
                           
                           {/* First row: Category, Title, Link/File in 3-column grid */}
                           <div className="grid grid-cols-3 gap-3">
                             <Input
                               placeholder="Category"
                               value={editingItem.category}
                               onChange={(e) => setEditingItem(prev => ({ ...prev, category: e.target.value }))}
                             />
                             <Input
                               placeholder="Title"
                               value={editingItem.title}
                               onChange={(e) => setEditingItem(prev => ({ ...prev, title: e.target.value }))}
                             />
                             {editingItem.type === 'link' ? (
                               <Input
                                 placeholder="URL"
                                 value={editingItem.url}
                                 onChange={(e) => setEditingItem(prev => ({ ...prev, url: e.target.value }))}
                               />
                             ) : (
                               <div className="space-y-1">
                                 <input
                                   type="file"
                                   id={`edit-file-upload-${index}`}
                                   className="hidden"
                                   accept=".pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.mp4,.mov,.avi"
                                   onChange={(e) => {
                                     const file = e.target.files?.[0];
                                     if (file) {
                                       const reader = new FileReader();
                                       reader.onload = (event) => {
                                         const result = event.target?.result as string;
                                         setEditingItem(prev => ({ 
                                           ...prev, 
                                           fileName: file.name, 
                                           fileUrl: result 
                                         }));
                                       };
                                       reader.readAsDataURL(file);
                                     }
                                   }}
                                 />
                                 <Button
                                   type="button"
                                   variant="outline"
                                   onClick={() => document.getElementById(`edit-file-upload-${index}`)?.click()}
                                   className="w-full"
                                   size="sm"
                                 >
                                   {editingItem.fileName ? 'Change File' : 'Upload File'}
                                 </Button>
                                 {editingItem.fileName && (
                                   <p className="text-xs text-muted-foreground">📁 {editingItem.fileName}</p>
                                 )}
                               </div>
                             )}
                           </div>
                           
                           {/* Second row: Description (full width) */}
                           <Textarea
                             placeholder="Description"
                             value={editingItem.description}
                             onChange={(e) => setEditingItem(prev => ({ ...prev, description: e.target.value }))}
                             rows={3}
                             className="w-full"
                           />
                           
                           {/* Action buttons */}
                           <div className="flex gap-2 justify-end">
                             <Button
                               variant="outline"
                               size="sm"
                               onClick={cancelEdit}
                             >
                               Cancel
                             </Button>
                             <Button
                               size="sm"
                               onClick={saveEdit}
                             >
                               Save
                             </Button>
                           </div>
                         </div>
                       ) : (
                         // Display mode
                         <div className="flex items-start justify-between">
                           <div className="flex-1">
                              <Badge variant="outline" className="text-xs mb-1">
                                {item.category || 'General'}
                              </Badge>
                             <h4 className="font-medium text-foreground">{item.title}</h4>
                           {item.url && (
                             <a 
                               href={item.url} 
                               target="_blank" 
                               rel="noopener noreferrer" 
                               className="text-sm text-primary hover:underline break-all"
                               onClick={(e) => {
                                 e.preventDefault();
                                 // Add protocol if missing
                                 let url = item.url || '';
                                 if (url && !url.match(/^https?:\/\//i)) {
                                   url = 'https://' + url;
                                 }
                                 window.open(url, '_blank', 'noopener,noreferrer');
                               }}
                             >
                               {item.url}
                             </a>
                           )}
                          {item.fileUrl && (
                            <a 
                              href={item.fileUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-sm text-primary hover:underline break-all"
                              onClick={(e) => {
                                e.preventDefault();
                                window.open(item.fileUrl, '_blank', 'noopener,noreferrer');
                              }}
                            >
                              📁 {item.fileName}
                            </a>
                          )}
                          {item.description && (
                            <p className="text-sm text-muted-foreground mt-1">{item.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (index > 0) {
                                setRecommendedReading(prev => {
                                  const newItems = [...prev];
                                  [newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]];
                                  return newItems;
                                });
                              }
                            }}
                            disabled={index === 0}
                            className="h-8 w-8 p-0"
                            title="Move up"
                          >
                            <ChevronUp className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              if (index < recommendedReading.length - 1) {
                                setRecommendedReading(prev => {
                                  const newItems = [...prev];
                                  [newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]];
                                  return newItems;
                                });
                              }
                            }}
                            disabled={index === recommendedReading.length - 1}
                            className="h-8 w-8 p-0"
                            title="Move down"
                          >
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                           <Button
                             variant="ghost"
                             size="sm"
                             onClick={() => startEditing(index)}
                             className="h-8 w-8 p-0"
                             title="Edit"
                           >
                             <Edit className="h-3 w-3" />
                           </Button>
                             <Button
                             variant="ghost"
                             size="sm"
                              onClick={() => {
                                const itemToDelete = recommendedReading[index];
                                setRecommendedReading(prev => {
                                  const newList = prev.filter((_, i) => i !== index);
                                  // Log the deletion
                                  logChange('delete', itemToDelete, null, {
                                    item_count: newList.length,
                                    deleted_title: itemToDelete.title
                                  });
                                  return newList;
                                });
                                toast({
                                  title: "Removed",
                                  description: `"${itemToDelete.title}" has been removed.`,
                                });
                              }}
                             className="h-8 w-8 p-0 text-destructive"
                             title="Delete"
                           >
                             <Trash2 className="h-3 w-3" />
                           </Button>
                         </div>
                       </div>
                       )}
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
