import { useState, useRef, useEffect, useCallback } from "react";
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

  // Session persistence for auto-save
  const [lastSavedTime, setLastSavedTime] = useState<number>(Date.now());
  const [autoSaveInterval, setAutoSaveInterval] = useState<NodeJS.Timeout | null>(null);

  // Initialize auto-save when content changes
  useEffect(() => {
    if (autoSaveInterval) {
      clearTimeout(autoSaveInterval);
    }

    const interval = setTimeout(() => {
      if (currentTitle || currentContent) {
        // Auto-save every 30 seconds
        autoSave();
      }
    }, 30000);

    setAutoSaveInterval(interval);

    return () => {
      if (interval) clearTimeout(interval);
    };
  }, [currentContent, currentTitle]);

  const autoSave = useCallback(async () => {
    if (!pageId || !currentTitle.trim()) return;
    
    try {
      const { error } = await supabase
        .from('pages')
        .update({ 
          title: currentTitle,
          content: currentContent,
          updated_at: new Date().toISOString()
        })
        .eq('id', pageId);

      if (error) throw error;
      
      setLastSavedTime(Date.now());
      console.log('Auto-saved successfully');
    } catch (error) {
      console.error('Auto-save error:', error);
    }
  }, [pageId, currentTitle, currentContent]);

  useEffect(() => {
    setCurrentTitle(title);
    
    // Clean content of any RECOMMENDED_READING data before setting
    const cleanContent = content.split('RECOMMENDED_READING:')[0];
    setCurrentContent(cleanContent);
    
    if (editorRef.current) {
      editorRef.current.innerHTML = cleanContent;
    }
  }, [title, content]);

  // Load page settings if editing existing page
  useEffect(() => {
    if (pageId) {
      const fetchPageSettings = async () => {
        try {
          const { data, error } = await supabase
            .from('pages')
            .select('is_public, public_token, content, tags')
            .eq('id', pageId)
            .single();

          if (error) throw error;

          if (data) {
            setIsPublic(data.is_public || false);
            setPublicToken(data.public_token || '');
            setTags(data.tags || []);
            
            // Try to extract recommended reading from content and clean it
            try {
              if (data.content && data.content.includes('RECOMMENDED_READING:')) {
                const parts = data.content.split('RECOMMENDED_READING:');
                if (parts.length > 1) {
                  const readingData = JSON.parse(parts[1]);
                  setRecommendedReading(readingData);
                  setCurrentContent(parts[0]);
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

  // Enhanced paste handler for tables, images, and links
  const handlePaste = useCallback((e: ClipboardEvent) => {
    e.preventDefault();
    
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // Handle HTML content (including tables)
    const htmlData = clipboardData.getData('text/html');
    if (htmlData) {
      // Check if it contains a table
      if (htmlData.includes('<table') || htmlData.includes('<tr')) {
        insertPastedTable(htmlData);
        return;
      }
      
      // Handle links
      const linkMatch = htmlData.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]+)<\/a>/i);
      if (linkMatch) {
        const url = linkMatch[1];
        const linkText = linkMatch[2];
        insertText(`<a href="${url}" style="color: #007acc; text-decoration: underline; font-weight: bold;" target="_blank">${linkText}</a>`);
        return;
      }
      
      // Clean and insert HTML content
      const cleanHtml = sanitizeHtmlContent(htmlData);
      insertText(cleanHtml);
      return;
    }

    // Handle plain text with tab-delimited data (spreadsheet paste)
    const textData = clipboardData.getData('text/plain');
    if (textData) {
      // Check if it looks like table data (contains tabs and newlines)
      const lines = textData.split('\n').filter(line => line.trim());
      const hasTabDelimited = lines.some(line => line.includes('\t'));
      
      if (hasTabDelimited && lines.length > 1) {
        createTableFromTabData(textData);
        return;
      }
      
      // Handle URL pasting
      const urlRegex = /^https?:\/\/[^\s]+$/;
      if (urlRegex.test(textData.trim())) {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) {
          // Use selected text as link text
          const linkText = selection.toString();
          const range = selection.getRangeAt(0);
          range.deleteContents();
          range.insertNode(document.createRange().createContextualFragment(
            `<a href="${textData.trim()}" style="color: #007acc; text-decoration: underline; font-weight: bold;" target="_blank">${linkText}</a>`
          ));
        } else {
          insertText(`<a href="${textData.trim()}" style="color: #007acc; text-decoration: underline; font-weight: bold;" target="_blank">${textData.trim()}</a>`);
        }
        return;
      }
      
      // Insert plain text
      insertText(textData);
    }
  }, []);

  const sanitizeHtmlContent = (html: string): string => {
    // Create a temporary div to parse HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;
    
    // Remove script tags and dangerous attributes
    temp.querySelectorAll('script').forEach(el => el.remove());
    temp.querySelectorAll('*').forEach(el => {
      // Remove dangerous attributes
      ['onclick', 'onload', 'onerror', 'onfocus'].forEach(attr => {
        el.removeAttribute(attr);
      });
    });
    
    return temp.innerHTML;
  };

  const insertPastedTable = (htmlData: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = htmlData;
    const table = temp.querySelector('table');
    
    if (table) {
      // Convert to our table format
      const rows = Array.from(table.querySelectorAll('tr'));
      if (rows.length === 0) return;
      
      let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;" data-editable-table="true">';
      
      // First row as header
      const firstRow = rows[0];
      const headerCells = Array.from(firstRow.querySelectorAll('th, td'));
      tableHTML += '<thead><tr>';
      headerCells.forEach(cell => {
        tableHTML += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #f8f9fa; vertical-align: top; text-align: left; position: relative;" contenteditable="true">${cell.textContent || ''}</th>`;
      });
      tableHTML += '</tr></thead>';
      
      // Remaining rows as data
      if (rows.length > 1) {
        tableHTML += '<tbody>';
        rows.slice(1).forEach(row => {
          const cells = Array.from(row.querySelectorAll('th, td'));
          tableHTML += '<tr>';
          cells.forEach(cell => {
            tableHTML += `<td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left;" contenteditable="true">${cell.textContent || ''}</td>`;
          });
          tableHTML += '</tr>';
        });
        tableHTML += '</tbody>';
      }
      
      tableHTML += '</table><br>';
      insertText(tableHTML);
      
      setTimeout(() => {
        setupTableControls();
      }, 100);
    }
  };

  const createTableFromTabData = (textData: string) => {
    const lines = textData.split('\n').filter(line => line.trim());
    const rows = lines.map(line => line.split('\t'));
    
    if (rows.length === 0) return;
    
    let tableHTML = '<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0;" data-editable-table="true">';
    
    // First row as header
    tableHTML += '<thead><tr>';
    rows[0].forEach(cell => {
      tableHTML += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #f8f9fa; vertical-align: top; text-align: left; position: relative;" contenteditable="true">${cell.trim()}</th>`;
    });
    tableHTML += '</tr></thead>';
    
    // Remaining rows as data
    if (rows.length > 1) {
      tableHTML += '<tbody>';
      rows.slice(1).forEach(row => {
        tableHTML += '<tr>';
        row.forEach(cell => {
          tableHTML += `<td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left;" contenteditable="true">${cell.trim()}</td>`;
        });
        tableHTML += '</tr>';
      });
      tableHTML += '</tbody>';
    }
    
    tableHTML += '</table><br>';
    insertText(tableHTML);
    
    setTimeout(() => {
      setupTableControls();
    }, 100);
  };

  // Setup editor event listeners
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;

    editor.addEventListener('paste', handlePaste);
    
    return () => {
      editor.removeEventListener('paste', handlePaste);
    };
  }, [handlePaste]);

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
    let tableHTML = `<table border="1" style="border-collapse: collapse; width: 100%; margin: 10px 0; position: relative;" data-editable-table="true">`;
    
    // Header row
    tableHTML += '<thead><tr>';
    for (let j = 0; j < cols; j++) {
      tableHTML += `<th style="border: 1px solid #ccc; padding: 8px; background-color: #f8f9fa; vertical-align: top; text-align: left; position: relative;" contenteditable="true"></th>`;
    }
    tableHTML += '</tr></thead>';
    
    // Data rows
    tableHTML += '<tbody>';
    for (let i = 0; i < rows - 1; i++) {
      tableHTML += '<tr>';
      for (let j = 0; j < cols; j++) {
        tableHTML += `<td style="border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left;" contenteditable="true"></td>`;
      }
      tableHTML += '</tr>';
    }
    tableHTML += '</tbody>';
    
    tableHTML += '</table>';
    
    insertText(tableHTML + '<br>');
    
    // Add table manipulation functionality
    setTimeout(() => {
      setupTableControls();
    }, 100);
  };

  const setupTableControls = () => {
    // Remove existing event listeners to prevent duplicates
    document.removeEventListener('contextmenu', handleTableContextMenu);
    document.addEventListener('contextmenu', handleTableContextMenu);
    
    // Add resize functionality
    makeTableResizable();
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
      min-width: 200px;
    `;
    
    const menuItems = [
      { text: 'Insert Row Above', action: () => insertRowAbove(cell, table) },
      { text: 'Insert Row Below', action: () => insertRowBelow(cell, table) },
      { text: 'Insert Column Left', action: () => insertColumnLeft(cell, table) },
      { text: 'Insert Column Right', action: () => insertColumnRight(cell, table) },
      { text: 'Delete Row', action: () => deleteRow(cell, table) },
      { text: 'Delete Column', action: () => deleteColumn(cell, table) },
      { text: '---', action: () => {} }, // Separator
      { text: 'Change Cell Color', action: () => showCellColorPicker(cell as HTMLElement, e) },
      { text: 'Change Header Color', action: () => showHeaderColorPicker(cell as HTMLElement, e) },
    ];
    
    menuItems.forEach(item => {
      if (item.text === '---') {
        const separator = document.createElement('div');
        separator.style.cssText = 'height: 1px; background: #eee; margin: 4px 0;';
        menu.appendChild(separator);
        return;
      }
      
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
      padding: 10px;
      display: grid;
      grid-template-columns: repeat(6, 30px);
      gap: 5px;
    `;
    
    const colors = [
      '#ffffff', '#f8f9fa', '#e9ecef', '#dee2e6', '#ced4da', '#adb5bd',
      '#ffebee', '#ffcdd2', '#ef9a9a', '#e57373', '#ef5350', '#f44336',
      '#e8f5e8', '#c8e6c9', '#a5d6a7', '#81c784', '#66bb6a', '#4caf50',
      '#e3f2fd', '#bbdefb', '#90caf9', '#64b5f6', '#42a5f5', '#2196f3',
      '#fff3e0', '#ffcc80', '#ffb74d', '#ffa726', '#ff9800', '#f57c00',
      '#f3e5f5', '#ce93d8', '#ba68c8', '#ab47bc', '#9c27b0', '#8e24aa'
    ];
    
    colors.forEach(color => {
      const colorBtn = document.createElement('div');
      colorBtn.style.cssText = `
        width: 25px;
        height: 25px;
        background-color: ${color};
        border: 1px solid #ddd;
        border-radius: 3px;
        cursor: pointer;
      `;
      colorBtn.addEventListener('click', () => {
        cell.style.backgroundColor = color;
        colorPicker.remove();
        updateContent();
      });
      colorPicker.appendChild(colorBtn);
    });
    
    // Add remove color option
    const removeBtn = document.createElement('div');
    removeBtn.textContent = '✕';
    removeBtn.style.cssText = `
      width: 25px;
      height: 25px;
      border: 1px solid #ddd;
      border-radius: 3px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      background: white;
    `;
    removeBtn.addEventListener('click', () => {
      cell.style.backgroundColor = '';
      colorPicker.remove();
      updateContent();
    });
    colorPicker.appendChild(removeBtn);
    
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
    // Only work on header cells
    if (cell.tagName !== 'TH') {
      toast({
        title: "Header Color",
        description: "This option only works on table header cells (TH)",
        variant: "destructive",
      });
      return;
    }
    
    showCellColorPicker(cell, e);
  };

  const insertRowAbove = (cell: Element, table: Element) => {
    const row = cell.closest('tr');
    if (!row) return;
    
    const newRow = document.createElement('tr');
    const cellCount = row.children.length;
    
    for (let i = 0; i < cellCount; i++) {
      const newCell = document.createElement('td');
      newCell.style.cssText = 'border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left;';
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
      newCell.style.cssText = 'border: 1px solid #ccc; padding: 8px; vertical-align: top; text-align: left;';
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
        ? 'border: 1px solid #ccc; padding: 8px; position: relative; background-color: #f8f9fa;'
        : 'border: 1px solid #ccc; padding: 8px; position: relative;';
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
        ? 'border: 1px solid #ccc; padding: 8px; position: relative; background-color: #f8f9fa;'
        : 'border: 1px solid #ccc; padding: 8px; position: relative;';
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
      
      // Add column resize handles to headers
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

      // Add row resize handles
      const rows = table.querySelectorAll('tbody tr');
      rows.forEach(row => {
        // Remove existing row handles
        row.querySelectorAll('.row-resize-handle').forEach(handle => handle.remove());
        
        const rowHandle = document.createElement('div');
        rowHandle.className = 'row-resize-handle';
        rowHandle.style.cssText = `
          position: absolute;
          left: -10px;
          top: 50%;
          transform: translateY(-50%);
          width: 8px;
          height: 20px;
          background: transparent;
          cursor: row-resize;
          border-radius: 3px;
          z-index: 1000;
        `;
        
        rowHandle.addEventListener('mouseenter', () => {
          rowHandle.style.background = '#007acc';
        });
        
        rowHandle.addEventListener('mouseleave', () => {
          rowHandle.style.background = 'transparent';
        });
        
        let isResizing = false;
        let startY = 0;
        let startHeight = 0;
        
        rowHandle.addEventListener('mousedown', (e) => {
          isResizing = true;
          startY = e.clientY;
          startHeight = (row as HTMLElement).offsetHeight;
          e.preventDefault();
          e.stopPropagation();
        });
        
        document.addEventListener('mousemove', (e) => {
          if (!isResizing) return;
          e.preventDefault();
          const height = startHeight + e.clientY - startY;
          if (height > 30) { // Minimum height
            (row as HTMLElement).style.height = height + 'px';
            // Update all cells in the row
            row.querySelectorAll('td').forEach(cell => {
              (cell as HTMLElement).style.height = height + 'px';
            });
          }
        });
        
        document.addEventListener('mouseup', () => {
          isResizing = false;
        });
        
        // Position the row relatively for the handle
        (row as HTMLElement).style.position = 'relative';
        row.appendChild(rowHandle);
      });
    });
  };

  // Text color functionality
  const setTextColor = (color: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      const span = document.createElement('span');
      span.style.color = color;
      span.textContent = selectedText;
      
      range.deleteContents();
      range.insertNode(span);
      
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };

  // Clean text for previews (strip HTML tags)
  const getCleanTextPreview = (htmlContent: string, maxLength: number = 120): string => {
    const temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    const textContent = temp.textContent || temp.innerText || '';
    return textContent.length > maxLength 
      ? textContent.substring(0, maxLength) + '...'
      : textContent;
  };

  const insertLink = () => {
    const selection = window.getSelection();
    const selectedText = selection?.toString();
    
    const url = prompt("Enter URL:");
    if (url) {
      const linkText = selectedText || url;
      const linkHtml = `<a href="${url}" style="color: #007acc; text-decoration: underline; font-weight: bold;" target="_blank">${linkText}</a>`;
      
      if (selectedText) {
        // Replace selected text with link
        const range = selection?.getRangeAt(0);
        if (range) {
          range.deleteContents();
          range.insertNode(document.createRange().createContextualFragment(linkHtml));
        }
      } else {
        insertText(linkHtml);
      }
      updateContent();
    }
  };

  const insertImage = () => {
    const url = prompt("Enter image URL:");
    if (url) {
      insertText(`<img src="${url}" alt="Image" style="max-width: 100%; height: auto; margin: 10px 0;" />`);
    }
  };

  const insertYouTubeVideo = () => {
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

  const extractYouTubeId = (url: string): string | null => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  // Bullet point functionality
  const insertBulletList = () => {
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
  };

  const insertNumberedList = () => {
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
  };

  const setFontSize = (size: string) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed) {
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString();
      
      const span = document.createElement('span');
      span.style.fontSize = size + 'px';
      span.textContent = selectedText;
      
      range.deleteContents();
      range.insertNode(span);
      
      const newRange = document.createRange();
      newRange.selectNodeContents(span);
      selection.removeAllRanges();
      selection.addRange(newRange);
      
      updateContent();
    }
  };

  // Code block functionality with proper deletion support
  const insertCodeBlock = () => {
    const codeBlock = `<pre style="background-color: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 12px; margin: 10px 0; font-family: 'Courier New', monospace; white-space: pre-wrap; position: relative;" contenteditable="true" data-code-block="true"><code></code></pre>`;
    insertText(codeBlock);
    
    // Add keydown event listener for backspace handling
    setTimeout(() => {
      const codeBlocks = editorRef.current?.querySelectorAll('[data-code-block="true"]');
      codeBlocks?.forEach(block => {
        block.addEventListener('keydown', (e: Event) => {
          const keyEvent = e as KeyboardEvent;
          if (keyEvent.key === 'Backspace' && (block as HTMLElement).textContent?.trim() === '') {
            e.preventDefault();
            block.remove();
            updateContent();
          }
        });
      });
    }, 100);
  };

  // Toolbar items
  const basicToolbarItems = [
    { icon: Bold, action: () => formatText('bold'), tooltip: "Bold (Ctrl+B)" },
    { icon: Italic, action: () => formatText('italic'), tooltip: "Italic (Ctrl+I)" },
    { icon: Underline, action: () => formatText('underline'), tooltip: "Underline (Ctrl+U)" },
    { icon: Strikethrough, action: () => formatText('strikeThrough'), tooltip: "Strikethrough" },
  ];

  const alignmentToolbarItems = [
    { icon: AlignLeft, action: () => formatText('justifyLeft'), tooltip: "Align Left" },
    { icon: AlignCenter, action: () => formatText('justifyCenter'), tooltip: "Align Center" },
    { icon: AlignRight, action: () => formatText('justifyRight'), tooltip: "Align Right" },
    { icon: AlignJustify, action: () => formatText('justifyFull'), tooltip: "Justify" },
  ];

  const listToolbarItems = [
    { icon: List, action: insertBulletList, tooltip: "Bullet List" },
    { icon: ListOrdered, action: insertNumberedList, tooltip: "Numbered List" },
  ];

  const mediaToolbarItems = [
    { icon: Link, action: insertLink, tooltip: "Insert Link" },
    { icon: Image, action: insertImage, tooltip: "Insert Image" },
    { icon: Youtube, action: insertYouTubeVideo, tooltip: "Insert YouTube Video" },
    { icon: Table, action: () => insertTable(3, 3), tooltip: "Insert Table" },
  ];

  const advancedToolbarItems = [
    { icon: Code, action: () => insertCodeBlock(), tooltip: "Code Block" },
    { icon: Quote, action: () => formatText('formatBlock', '<blockquote>'), tooltip: "Quote" },
  ];

  const handleSave = () => {
    const content = editorRef.current?.innerHTML || '';
    onSave(currentTitle, content, recommendedReading);
    
    toast({
      title: "Content saved",
      description: "Your page has been saved successfully.",
    });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const newFile: MediaFile = {
          id: Date.now().toString(),
          name: file.name,
          type: file.type,
          url: event.target?.result as string
        };
        setMediaFiles(prev => [...prev, newFile]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeMediaFile = (id: string) => {
    setMediaFiles(prev => prev.filter(file => file.id !== id));
  };

  const addTag = () => {
    if (tagInput.trim() && !tags.includes(tagInput.trim())) {
      setTags(prev => [...prev, tagInput.trim()]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(prev => prev.filter(tag => tag !== tagToRemove));
  };

  const copyPublicLink = () => {
    if (publicToken) {
      const publicUrl = `${window.location.origin}/public/${publicToken}`;
      navigator.clipboard.writeText(publicUrl);
      toast({
        title: "Link copied",
        description: "Public link has been copied to clipboard",
      });
    }
  };

  const addRecommendation = () => {
    if (newRecommendation.title && newRecommendation.description) {
      setRecommendedReading(prev => [...prev, { ...newRecommendation }]);
      setNewRecommendation({title: '', url: '', description: '', type: 'link', fileName: '', fileUrl: ''});
    }
  };

  const removeRecommendation = (index: number) => {
    setRecommendedReading(prev => prev.filter((_, i) => i !== index));
  };

  // Setup table functionality when content loads
  useEffect(() => {
    if (editorRef.current && currentContent) {
      setTimeout(() => {
        setupTableControls();
      }, 100);
    }
  }, [currentContent]);

  return (
    <div className="flex-1 flex flex-col h-full bg-background">
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor */}
        <div className="flex-1 flex flex-col">
          {/* Toolbar */}
          <div className="bg-card border-b border-border p-4">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {/* Basic formatting */}
              {basicToolbarItems.map((item, index) => (
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
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Text size */}
              <Select value={selectedFontSize} onValueChange={setFontSize}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="12">12px</SelectItem>
                  <SelectItem value="14">14px</SelectItem>
                  <SelectItem value="16">16px</SelectItem>
                  <SelectItem value="18">18px</SelectItem>
                  <SelectItem value="20">20px</SelectItem>
                  <SelectItem value="24">24px</SelectItem>
                  <SelectItem value="32">32px</SelectItem>
                </SelectContent>
              </Select>
              
              {/* Text color */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                    <Palette className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                  <ColorPicker onColorSelect={setTextColor} />
                </PopoverContent>
              </Popover>
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Alignment */}
              {alignmentToolbarItems.map((item, index) => (
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
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Lists */}
              {listToolbarItems.map((item, index) => (
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
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Media */}
              {mediaToolbarItems.map((item, index) => (
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
              
              <Separator orientation="vertical" className="h-6" />
              
              {/* Advanced */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdvancedToolbar(!showAdvancedToolbar)}
                className="h-8 px-3"
              >
                <MoreHorizontal className="h-4 w-4 mr-2" />
                More
              </Button>
            </div>
            
            {/* Advanced toolbar */}
            {showAdvancedToolbar && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
                {advancedToolbarItems.map((item, index) => (
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
            )}
          </div>

          {/* Editor Content */}
          <div className="flex-1 flex flex-col">
            {/* Title */}
            <div className="p-6 pb-4">
              <EditableTitle
                value={currentTitle}
                onChange={setCurrentTitle}
                placeholder="Enter page title..."
              />
            </div>

            {/* Content Editor */}
            <div className="flex-1 px-6">
              <div 
                ref={editorRef}
                contentEditable={isEditing}
                className="min-h-96 p-4 border border-border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                style={{ 
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  fontSize: '16px',
                  lineHeight: '1.6',
                  color: 'hsl(var(--foreground))'
                }}
                onInput={updateContent}
                suppressContentEditableWarning={true}
                dangerouslySetInnerHTML={{ __html: currentContent }}
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="p-6 border-t border-border bg-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="public"
                    checked={isPublic}
                    onCheckedChange={setIsPublic}
                  />
                  <Label htmlFor="public" className="flex items-center gap-2">
                    {isPublic ? (
                      <>
                        <Globe className="h-4 w-4" />
                        Public
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        Private
                      </>
                    )}
                  </Label>
                </div>

                {isPublic && publicToken && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={copyPublicLink}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Public Link
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-2">
                {onPreview && (
                  <Button variant="outline" onClick={onPreview}>
                    <Eye className="h-4 w-4 mr-2" />
                    Preview
                  </Button>
                )}
                <Button onClick={handleSave}>
                  <Save className="h-4 w-4 mr-2" />
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* Tags Section */}
          <div className="px-6 pb-4">
            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium">Tags</Label>
                <div className="flex items-center gap-2 mt-2">
                  <Input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    placeholder="Add a tag..."
                    className="flex-1"
                    onKeyPress={(e) => e.key === 'Enter' && addTag()}
                  />
                  <Button onClick={addTag} size="sm">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="cursor-pointer" onClick={() => removeTag(tag)}>
                        {tag}
                        <span className="ml-1">×</span>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              {/* Recommended Reading */}
              <div>
                <Label className="text-sm font-medium">Recommended Reading</Label>
                <div className="space-y-2 mt-2">
                  {recommendedReading.map((item, index) => (
                    <Card key={index} className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-medium">{item.title}</h4>
                          <p className="text-sm text-muted-foreground mt-1">
                            {getCleanTextPreview(item.description)}
                          </p>
                          {item.url && (
                            <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary hover:underline">
                              {item.url}
                            </a>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeRecommendation(index)}
                          className="h-8 w-8 p-0 text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <Input
                      placeholder="Title"
                      value={newRecommendation.title}
                      onChange={(e) => setNewRecommendation(prev => ({ ...prev, title: e.target.value }))}
                    />
                    <Input
                      placeholder="URL"
                      value={newRecommendation.url}
                      onChange={(e) => setNewRecommendation(prev => ({ ...prev, url: e.target.value }))}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Description"
                      value={newRecommendation.description}
                      onChange={(e) => setNewRecommendation(prev => ({ ...prev, description: e.target.value }))}
                      className="flex-1"
                    />
                    <Button onClick={addRecommendation} size="sm">
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
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