# Welcome to your Lovable project

## Project info 

**URL**: https://lovable.dev/projects/f4c61c1a-eda3-41b7-9302-4188c45ebea0

## Rich Text Editor

This project includes a comprehensive TipTap-based rich text editor with full Confluence-grade functionality.

### Editor Components

#### EnhancedContentEditor
The main editor component located at `src/components/EnhancedContentEditor.tsx`.

**Features:**
- Full rich text editing with TipTap
- Comprehensive toolbar with all formatting options
- Table support with full management capabilities
- Media embedding (images, YouTube videos)
- Link management
- Task lists and regular lists
- Code blocks and inline code
- Text alignment and styling
- Undo/redo functionality
- Color and highlight support

**Usage:**
```tsx
import { EnhancedContentEditor } from '@/components/EnhancedContentEditor';

function MyComponent() {
  const [content, setContent] = useState('<p>Initial content</p>');

  return (
    <EnhancedContentEditor
      content={content}
      onChange={setContent}
      placeholder="Start writing..."
      className="my-editor"
    />
  );
}
```

**Props:**
- `content: string` - HTML content of the editor
- `onChange: (content: string) => void` - Callback when content changes
- `placeholder?: string` - Placeholder text when editor is empty
- `className?: string` - Additional CSS classes
- `title?: string` - Document title
- `onSave?: Function` - Save callback
- `onPreview?: Function` - Preview callback
- `isEditing?: boolean` - Whether editor is in edit mode
- `pageId?: string` - Unique page identifier

#### EditorToolbar
The toolbar component at `src/components/EditorToolbar.tsx` provides all formatting controls.

**Command Structure:**
All toolbar buttons use the TipTap command chain pattern:
```tsx
const toggleBold = useCallback(() => {
  editor.chain().focus().toggleBold().run();
}, [editor]);
```

**Button States:**
Buttons automatically show active states and disable when commands cannot be executed:
```tsx
<Button
  variant={editor.isActive('bold') ? 'default' : 'ghost'}
  disabled={!editor.can().toggleBold()}
  onClick={toggleBold}
>
  <Bold className="h-4 w-4" />
</Button>
```

### Available Extensions

The editor includes these TipTap extensions:
- **StarterKit** - Basic editing functionality
- **Underline** - Underline text formatting
- **TextAlign** - Text alignment (left, center, right, justify)
- **TextStyle & Color** - Text color and styling
- **Highlight** - Text highlighting with colors
- **Link** - Link creation and management
- **Table** - Full table support with row/column management
- **TaskList & TaskItem** - Checkbox lists
- **Image** - Image embedding
- **Youtube** - YouTube video embedding

### Keyboard Shortcuts

The editor supports standard keyboard shortcuts:
- `Ctrl/Cmd + B` - Bold
- `Ctrl/Cmd + I` - Italic
- `Ctrl/Cmd + U` - Underline
- `Ctrl/Cmd + Z` - Undo
- `Ctrl/Cmd + Shift + Z` - Redo
- `Ctrl/Cmd + K` - Insert link
- And many more standard shortcuts

### Testing

The editor includes comprehensive tests:

**Unit Tests:**
- `src/components/__tests__/EditorToolbar.test.tsx` - Toolbar button functionality
- `src/components/__tests__/EnhancedContentEditor.test.tsx` - Editor component behavior

**Integration Tests:**
- `src/components/__tests__/EditorIntegration.test.tsx` - Full editor workflow testing

**Running Tests:**
```bash
npm run test
```

### Extending the Editor

To add new extensions or customize behavior:

1. **Adding Extensions:**
```tsx
import { YourExtension } from '@tiptap/extension-your-extension';

const editor = useEditor({
  extensions: [
    // ... existing extensions
    YourExtension.configure({
      // configuration options
    }),
  ],
  // ... rest of config
});
```

2. **Custom Toolbar Buttons:**
```tsx
const customCommand = useCallback(() => {
  editor.chain().focus().yourCustomCommand().run();
}, [editor]);

<Button
  variant={editor.isActive('yourFormat') ? 'default' : 'ghost'}
  disabled={!editor.can().yourCustomCommand()}
  onClick={customCommand}
>
  <YourIcon className="h-4 w-4" />
</Button>
```

3. **Custom Styling:**
The editor uses Tailwind CSS classes and can be styled via the `className` prop or by targeting these classes:
- `.enhanced-content-editor` - Main editor container
- `.ProseMirror` - Editor content area
- `[data-testid="editor-content"]` - Content wrapper

### Dependencies

Key dependencies for the editor:
- `@tiptap/react` - Core TipTap React integration
- `@tiptap/starter-kit` - Essential editor functionality
- `@tiptap/extension-*` - Various formatting extensions
- `lucide-react` - Icons for toolbar buttons

### Troubleshooting

**Common Issues:**

1. **Toolbar buttons not working:**
   - Ensure the editor instance is properly passed to the toolbar
   - Check that extensions are correctly configured
   - Verify that commands are called with `.chain().focus().command().run()`

2. **Extensions not loading:**
   - Make sure all required extensions are imported
   - Check for conflicting extensions (e.g., duplicate Underline)
   - Verify extension configuration matches TipTap documentation

3. **Styling issues:**
   - Use Tailwind classes for consistent styling
   - Check that CSS classes are properly applied
   - Ensure prose classes are configured for content styling

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/f4c61c1a-eda3-41b7-9302-4188c45ebea0) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS
- TipTap (Rich Text Editor)

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/f4c61c1a-eda3-41b7-9302-4188c45ebea0) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/tips-tricks/custom-domain#step-by-step-guide)
