
import React, { useRef, useEffect } from 'react';
import { ConfluenceEditor, ConfluenceEditorProps } from './editor/ConfluenceEditor';
import { cn } from "@/lib/utils";

interface EnhancedContentEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  className?: string;
  title?: string;
  onSave?: (title: string, content: string, recommendedReading?: any[]) => Promise<void>;
  onPreview?: () => void;
  isEditing?: boolean;
  pageId?: string;
}

// Sample macros for demonstration
const defaultMacros = [
  {
    id: 'info-panel',
    name: 'Info Panel',
    description: 'Insert an informational panel',
    category: 'Content',
    icon: '💡',
    insertHtml: '<div class="panel panel-info"><p>Your info content here</p></div>',
    tags: ['panel', 'info']
  },
  {
    id: 'warning-panel',
    name: 'Warning Panel',
    description: 'Insert a warning panel',
    category: 'Content',
    icon: '⚠️',
    insertHtml: '<div class="panel panel-warning"><p>Your warning content here</p></div>',
    tags: ['panel', 'warning']
  },
  {
    id: 'code-block',
    name: 'Code Block',
    description: 'Insert a syntax-highlighted code block',
    category: 'Code',
    icon: '💻',
    insertHtml: '<pre class="language-javascript"><code>// Your code here\nconsole.log("Hello, World!");</code></pre>',
    tags: ['code', 'syntax']
  },
  {
    id: 'two-column-layout',
    name: 'Two Column Layout',
    description: 'Create a two-column section',
    category: 'Layout',
    icon: '📝',
    insertHtml: '<div class="layout-two-column"><div class="column"><p>Left column content</p></div><div class="column"><p>Right column content</p></div></div>',
    tags: ['layout', 'columns']
  },
  {
    id: 'three-column-layout',
    name: 'Three Column Layout',
    description: 'Create a three-column section',
    category: 'Layout',
    icon: '📊',
    insertHtml: '<div class="layout-three-column"><div class="column"><p>Column 1</p></div><div class="column"><p>Column 2</p></div><div class="column"><p>Column 3</p></div></div>',
    tags: ['layout', 'columns']
  }
];

// Sample mentions for demonstration
const defaultMentions = [
  { id: '1', label: 'John Doe', avatar: '👤' },
  { id: '2', label: 'Jane Smith', avatar: '👩' },
  { id: '3', label: 'Bob Johnson', avatar: '👨' },
  { id: '4', label: 'Alice Brown', avatar: '👩‍💼' },
  { id: '5', label: 'Charlie Wilson', avatar: '👨‍💻' }
];

export const EnhancedContentEditor: React.FC<EnhancedContentEditorProps> = ({
  content,
  onChange,
  placeholder = "Start writing...",
  className,
  title,
  onSave,
  onPreview,
  isEditing,
  pageId
}) => {
  const editorRef = useRef<HTMLDivElement>(null);

  // Handle save functionality
  const handleSave = () => {
    if (onSave && title) {
      onSave(title, content);
    }
  };

  // Handle mention search
  const handleMentionSearch = async (query: string) => {
    // Filter mentions based on query
    return defaultMentions.filter(mention =>
      mention.label.toLowerCase().includes(query.toLowerCase())
    );
  };

  const confluenceProps: ConfluenceEditorProps = {
    content,
    onChange,
    onSave: handleSave,
    placeholder,
    editable: true,
    showToolbar: true,
    enableCollaboration: false,
    className: cn("confluence-editor-wrapper", className),
    mentions: defaultMentions,
    onMention: handleMentionSearch,
    macros: defaultMacros
  };

  return (
    <div ref={editorRef} className={cn("enhanced-content-editor", className)}>
      <ConfluenceEditor {...confluenceProps} />
    </div>
  );
};
