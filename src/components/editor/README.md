# Confluence-Style Rich Text Editor

A comprehensive rich text editor built with TipTap that replicates Confluence Cloud's editing experience. This editor provides all the essential features for creating rich content including text formatting, tables, layouts, media embeds, macros, and collaboration features.

## Features

### ✅ Text Formatting
- **Headings**: H1-H6 with proper hierarchy
- **Text Styles**: Bold, italic, underline, strikethrough
- **Colors**: Text color and background highlighting
- **Alignment**: Left, center, right, and justify
- **Lists**: Bulleted, numbered, and task lists with nesting
- **Code**: Inline code and syntax-highlighted code blocks

### ✅ Media & Embeds
- **Images**: Drag-and-drop upload with responsive sizing
- **YouTube**: Direct video embedding with responsive player
- **Smart Links**: Enhanced link previews with metadata
- **File Attachments**: Support for various file types

### ✅ Tables (Confluence-grade)
- **Dynamic Creation**: Insert tables with custom dimensions
- **CRUD Operations**: Add/remove rows and columns
- **Cell Management**: Merge/split cells, resize columns
- **Styling**: Header rows, borders, background colors
- **Data Import**: Paste from Excel/Google Sheets with automatic table creation

### ✅ Layout & Panels
- **Multi-column Layouts**: 2, 3, or 4 column sections
- **Info Panels**: Color-coded panels (info, warning, error, success)
- **Responsive Design**: Automatically adapts to screen size

### ✅ Collaboration Features
- **@-Mentions**: Tag users with autocomplete
- **Comments**: Inline comments with threading support
- **Real-time Cursors**: See where others are editing (placeholder)
- **Version History**: Track changes and revisions (placeholder)

### ✅ Macros & Extensions
- **Built-in Macros**: Table of contents, info boxes, Jira integration
- **Macro Browser**: Searchable catalog of available macros
- **Custom Macros**: Easy integration of custom functionality
- **Slash Commands**: Quick insertion with `/` trigger

### ✅ Keyboard Shortcuts
- **Standard Shortcuts**: Ctrl/Cmd + B/I/U for formatting
- **Custom Shortcuts**: Ctrl/Cmd + Enter to save
- **Navigation**: Arrow keys for menu navigation
- **Accessibility**: Full keyboard navigation support

## Installation

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-table # ... other extensions
```

## Basic Usage

```tsx
import { ConfluenceEditor } from '@/components/editor/ConfluenceEditor';
import '@/components/editor/editor.css';

function MyPage() {
  const [content, setContent] = useState('');

  return (
    <ConfluenceEditor
      content={content}
      onChange={setContent}
      placeholder="Start typing..."
      onSave={() => console.log('Save triggered')}
    />
  );
}
```

## Advanced Configuration

### With Collaboration

```tsx
<ConfluenceEditor
  content={content}
  onChange={setContent}
  enableCollaboration={true}
  collaborationConfig={{
    document: ydoc, // Y.js document
    user: { name: 'John Doe', color: '#ff0000' }
  }}
  mentions={[
    { id: '1', label: 'John Doe', avatar: '/avatars/john.jpg' },
    { id: '2', label: 'Jane Smith', avatar: '/avatars/jane.jpg' }
  ]}
  onMention={async (query) => {
    // Fetch users matching query
    return await searchUsers(query);
  }}
/>
```

### Custom Macros

```tsx
const customMacros = [
  {
    id: 'custom-chart',
    name: 'Custom Chart',
    description: 'Insert a custom data visualization',
    category: 'Data',
    insertHtml: '<div class="custom-chart" data-type="bar">Chart placeholder</div>',
    tags: ['chart', 'data', 'visualization']
  }
];

<ConfluenceEditor
  macros={customMacros}
  // ... other props
/>
```

## Props API

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `content` | `string` | `''` | Initial HTML content |
| `onChange` | `(content: string) => void` | - | Called when content changes |
| `onSave` | `() => void` | - | Called when save shortcut is triggered |
| `placeholder` | `string` | `'Start typing...'` | Placeholder text when empty |
| `editable` | `boolean` | `true` | Whether editor is editable |
| `showToolbar` | `boolean` | `true` | Show/hide toolbar |
| `enableCollaboration` | `boolean` | `false` | Enable collaboration features |
| `collaborationConfig` | `object` | - | Collaboration settings |
| `mentions` | `array` | `[]` | Available users for mentions |
| `onMention` | `function` | - | Async function to search users |
| `macros` | `array` | `defaultMacros` | Available macros |
| `className` | `string` | `''` | Additional CSS classes |

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl/Cmd + B` | Toggle bold |
| `Ctrl/Cmd + I` | Toggle italic |
| `Ctrl/Cmd + U` | Toggle underline |
| `Ctrl/Cmd + Shift + S` | Toggle strikethrough |
| `Ctrl/Cmd + E` | Toggle code |
| `Ctrl/Cmd + Shift + E` | Toggle code block |
| `Ctrl/Cmd + Enter` | Save content |
| `Ctrl/Cmd + Z` | Undo |
| `Ctrl/Cmd + Shift + Z` | Redo |
| `/` | Open slash command menu |
| `@` | Trigger mention autocomplete |

## Styling & Theming

The editor uses Tailwind CSS with semantic color tokens. You can customize the appearance by overriding CSS variables:

```css
:root {
  --editor-background: hsl(0 0% 100%);
  --editor-foreground: hsl(222.2 84% 4.9%);
  --editor-border: hsl(214.3 31.8% 91.4%);
  --editor-muted: hsl(210 40% 98%);
  /* ... other variables */
}
```

## Architecture

The editor is built with a modular architecture:

```
src/components/editor/
├── ConfluenceEditor.tsx      # Main editor component
├── ConfluenceToolbar.tsx     # Formatting toolbar
├── MacroBrowser.tsx          # Macro selection dialog
├── MentionList.tsx           # User mention dropdown
├── extensions/               # Custom TipTap extensions
│   ├── LayoutExtension.ts    # Multi-column layouts
│   ├── PanelExtension.ts     # Info/warning panels
│   ├── SmartLinkExtension.ts # Enhanced links
│   └── CommentExtension.ts   # Inline comments
├── editor.css               # Styling
└── __tests__/               # Test files
```

## Extending the Editor

### Adding Custom Extensions

```tsx
import { Extension } from '@tiptap/core';

const CustomExtension = Extension.create({
  name: 'customExtension',
  // ... extension definition
});

// Add to editor extensions array
const editor = useEditor({
  extensions: [
    // ... existing extensions
    CustomExtension,
  ],
});
```

### Adding Custom Macros

```tsx
const myMacro = {
  id: 'my-macro',
  name: 'My Custom Macro',
  description: 'Does something custom',
  category: 'Custom',
  insertHtml: '<div class="my-macro">Custom content</div>',
  tags: ['custom']
};
```

## Testing

Run the test suite:

```bash
npm test
```

Tests cover:
- Editor initialization and basic functionality
- Toolbar interactions and formatting commands
- Macro browser functionality
- Table operations
- Keyboard shortcuts
- Content parsing and serialization

## Browser Support

- Chrome 90+
- Firefox 90+
- Safari 14+
- Edge 90+

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure accessibility compliance

## License

MIT License - see LICENSE file for details.
