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
  Smile,
  Calendar,
  AtSign,
  Plus,
  Minus,
  Settings
} from "lucide-react";

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string, recommendedReading?: Array<{title: string, url?: string, description: string, fileUrl?: string, fileName?: string}>) => void;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
}

interface ContentEditorProps {
  title?: string;
  content?: string;
  onSave: (title: string, content: string, recommendedReading?: Array<{
    title: string;
    url?: string;
    description: string;
    fileUrl?: string;
    fileName?: string;
  }>) => void;
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
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    setCurrentTitle(title);
    
    // Clean content of any RECOMMENDED_READING data before setting
    const cleanContent = content.split('RECOMMENDED_READING:')[0];
    setCurrentContent(cleanContent);
    
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanContent;
    }
    
    // Setup image and video controls after content is set
    setTimeout(() => {
      setupImageControls();
      setupYouTubeControls();
    }, 100);
  }, [title, content]);

  const [currentTableCell, setCurrentTableCell] = useState<HTMLElement | null>(null);

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
            
            // Try to extract recommended reading from content and clean it
            try {
              if (data.content && data.content.includes('RECOMMENDED_READING:')) {
                const parts = data.content.split('RECOMMENDED_READING:');
                if (parts.length > 1) {
                  const readingData = JSON.parse(parts[1]);
                  setRecommendedReading(readingData);
                  setCurrentContent(parts[0]);
                  
                  // Update the database to remove the appended data
                  supabase
                    .from('pages')
                    .update({ content: parts[0] })
                    .eq('id', pageId);
                } else {
                  setCurrentContent(data.content);
                }
              } else {
                setCurrentContent(data.content);
              }
            } catch (e) {
              console.log('No recommended reading data found');
              setCurrentContent(data.content);
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
      triggerAutoSave();
    }
  };

  // Auto-save functionality
  const triggerAutoSave = () => {
    if (!pageId) return; // Only auto-save for existing pages
    
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }
    
    autoSaveTimeoutRef.current = setTimeout(() => {
      autoSave();
    }, 3000); // Auto-save after 3 seconds of inactivity
  };

  // Trigger auto-save when recommended reading changes
  useEffect(() => {
    if (pageId && recommendedReading.length > 0) {
      triggerAutoSave();
    }
  }, [recommendedReading, pageId]);

  const autoSave = async () => {
    if (!pageId || !currentContent) return;
    
    try {
      const { error } = await supabase
        .from('pages')
        .update({ 
          content: currentContent,
          recommended_reading: recommendedReading,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId);

      if (error) throw error;
      
      console.log('Auto-saved successfully');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  };

  const formatText = (command: string, value?: string) => {
    execCommand(command, value);
  };

  const insertText = (text: string) => {
    execCommand('insertHTML', text);
  };

  const insertTable = (rows: number, cols: number) => {
    let tableHTML = `<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0; position: relative; table-layout: fixed;" data-editable-table="true">`;
    
    // Header row
    tableHTML += '<thead><tr>';
    for (let j = 0; j < cols; j++) {
      tableHTML += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #f8f9fa; vertical-align: top; text-align: left; position: relative; min-width: 100px; word-wrap: break-word; overflow-wrap: break-word;" contenteditable="true"></th>`;
    }
    tableHTML += '</tr></thead>';
    
    // Data rows
    tableHTML += '<tbody>';
    for (let i = 0; i < rows - 1; i++) {
      tableHTML += '<tr>';
      for (let j = 0; j < cols; j++) {
        tableHTML += `<td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left; min-width: 100px; word-wrap: break-word; overflow-wrap: break-word;" contenteditable="true"></td>`;
      }
      tableHTML += '</tr>';
    }
    tableHTML += '</tbody>';
    
    tableHTML += '</table>';
    
    insertText(tableHTML + '<br>');
    
    // Add table manipulation functionality
    setTimeout(() => {
      setupTableControls();
      makeTableResizable();
    }, 100);
  };

  const setupTableControls = () => {
    // Remove existing event listeners to prevent duplicates
    document.removeEventListener('contextmenu', handleTableContextMenu);
    document.addEventListener('contextmenu', handleTableContextMenu);
    
    // Add hover effects for table cells
    const tables = editorRef.current?.querySelectorAll('table[data-editable-table="true"]');
    tables?.forEach(table => {
      const cells = table.querySelectorAll('th, td');
      cells.forEach(cell => {
        cell.addEventListener('mouseenter', showTableControls);
        cell.addEventListener('mouseleave', hideTableControls);
      });
    });
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
      { text: 'Change Cell Color', action: () => showCellColorPicker(cell as HTMLElement, e) },
      { text: 'Change Header Color', action: () => cell.tagName === 'TH' ? showHeaderColorPicker(cell as HTMLElement, e) : null },
    ].filter(item => item.action); // Filter out null actions
    
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
      newCell.style.cssText = 'border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left; min-width: 100px;';
      newCell.contentEditable = 'true';
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
      newCell.style.cssText = 'border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left; min-width: 100px;';
      newCell.contentEditable = 'true';
      newRow.appendChild(newCell);
    }
    
    row.parentNode?.insertBefore(newRow, row.nextSibling);
  };

  const insertColumnLeft = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentNode?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
      const newCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      newCell.style.cssText = rowIndex === 0 
        ? 'border: 1px solid #ccc; padding: 8px; position: relative; background-color: #f8f9fa; min-width: 100px;'
        : 'border: 1px solid #ccc; padding: 8px; position: relative; min-width: 100px;';
      newCell.contentEditable = 'true';
      
      const targetCell = row.children[cellIndex];
      row.insertBefore(newCell, targetCell);
    });
  };

  const insertColumnRight = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentNode?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    rows.forEach((row, rowIndex) => {
      const newCell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      newCell.style.cssText = rowIndex === 0 
        ? 'border: 1px solid #ccc; padding: 8px; position: relative; background-color: #f8f9fa; min-width: 100px;'
        : 'border: 1px solid #ccc; padding: 8px; position: relative; min-width: 100px;';
      newCell.contentEditable = 'true';
      
      const targetCell = row.children[cellIndex];
      row.insertBefore(newCell, targetCell?.nextSibling || null);
    });
  };

  const deleteRow = (cell: Element, table: Element) => {
    const row = cell.closest('tr');
    const tbody = table.querySelector('tbody');
    const thead = table.querySelector('thead');
    
    if (row && tbody && tbody.children.length > 1) {
      row.remove();
    } else if (row && thead?.contains(row)) {
      // Don't delete header row if it's the only row
      if (tbody && tbody.children.length > 0) {
        row.remove();
      }
    }
  };

  const deleteColumn = (cell: Element, table: Element) => {
    const cellIndex = Array.from(cell.parentNode?.children || []).indexOf(cell);
    const rows = table.querySelectorAll('tr');
    
    if (rows[0]?.children.length === 1) return; // Don't delete last column
    
    rows.forEach(row => {
      const cellToDelete = row.children[cellIndex];
      cellToDelete?.remove();
    });
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
    });
  };

  const showTableControls = (e: Event) => {
    // Implementation for showing table controls on hover
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

  const hideTableControls = (e: Event) => {
    // Implementation for hiding table controls on hover
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
          <div class="youtube-container" style="text-align: center; margin: 10px 0;">
            <iframe 
              id="${iframeId}"
              width="720" 
              height="405" 
              src="https://www.youtube.com/embed/${videoId}" 
              frameborder="0" 
              allowfullscreen 
              style="max-width: 100%; cursor: pointer; border-radius: 8px;"
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
      
      // Get the parent element to preserve any existing styles
      const parentElement = range.commonAncestorContainer.nodeType === Node.TEXT_NODE 
        ? range.commonAncestorContainer.parentElement 
        : range.commonAncestorContainer as Element;
      
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
      if (selection && selection.toString()) {
        // Apply bullet points to selected text
        const selectedText = selection.toString();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const lines = selectedText.split('\n').filter(line => line.trim() !== '');
        const listItems = lines.map(line => `<li>${line.trim()}</li>`).join('');
        const ul = document.createElement('ul');
        ul.innerHTML = listItems;
        ul.style.cssText = 'margin: 16px 0; padding-left: 40px;';
        
        range.insertNode(ul);
        
        // Move cursor after list
        const afterRange = document.createRange();
        afterRange.setStartAfter(ul);
        afterRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(afterRange);
      } else {
        // Insert empty bullet point
        insertText('<ul style="margin: 16px 0; padding-left: 40px;"><li></li></ul>');
      }
      updateContent();
    }, tooltip: "Bullet List" },
    { icon: ListOrdered, action: () => {
      const selection = window.getSelection();
      if (selection && selection.toString()) {
        // Apply numbered list to selected text
        const selectedText = selection.toString();
        const range = selection.getRangeAt(0);
        range.deleteContents();
        
        const lines = selectedText.split('\n').filter(line => line.trim() !== '');
        const listItems = lines.map(line => `<li>${line.trim()}</li>`).join('');
        const ol = document.createElement('ol');
        ol.innerHTML = listItems;
        ol.style.cssText = 'margin: 16px 0; padding-left: 40px;';
        
        range.insertNode(ol);
        
        // Move cursor after list
        const afterRange = document.createRange();
        afterRange.setStartAfter(ol);
        afterRange.collapse(true);
        selection.removeAllRanges();
        selection.addRange(afterRange);
      } else {
        // Insert empty numbered list
        insertText('<ol style="margin: 16px 0; padding-left: 40px;"><li></li></ol>');
      }
      updateContent();
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
            insertText(`<img src="${result}" alt="Pasted image" style="max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0;" />`);
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
          
          // Style headers
          table.querySelectorAll('th').forEach(th => {
            (th as HTMLElement).style.cssText = 'border: 1px solid #ccc; padding: 8px; background-color: #f8f9fa; vertical-align: top; text-align: left; position: relative; min-width: 100px;';
            (th as HTMLElement).contentEditable = 'true';
          });
          
          // Style data cells
          table.querySelectorAll('td').forEach(td => {
            (td as HTMLElement).style.cssText = 'border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left; min-width: 100px;';
            (td as HTMLElement).contentEditable = 'true';
          });
        });
        
        insertText(doc.body.innerHTML);
        setTimeout(() => {
          setupTableControls();
          makeTableResizable();
        }, 100);
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

  const handleSave = async () => {
    // Save content without appending recommended reading to it
    onSave(currentTitle, currentContent, recommendedReading);
    
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
                        if (newRecommendation.title && newRecommendation.description) {
                          if (newRecommendation.type === 'file') {
                            // Check if file is already selected
                            if (newRecommendation.fileUrl && newRecommendation.fileName) {
                              setRecommendedReading(prev => [...prev, {
                                title: newRecommendation.title,
                                description: newRecommendation.description,
                                type: 'file',
                                fileUrl: newRecommendation.fileUrl,
                                fileName: newRecommendation.fileName
                              }]);
                              setNewRecommendation({ title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: '' });
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
                            <a 
                              href={item.url} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="text-sm text-primary hover:underline break-all cursor-pointer"
                              onClick={(e) => {
                                e.preventDefault();
                                window.open(item.url, '_blank', 'noopener,noreferrer');
                              }}
                            >
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
