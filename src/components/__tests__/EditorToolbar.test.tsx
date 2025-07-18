import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Editor } from '@tiptap/react';
import { EditorToolbar } from '../EditorToolbar';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the editor instance
const mockEditor = {
  chain: vi.fn(() => ({
    focus: vi.fn(() => ({
      toggleBold: vi.fn(() => ({ run: vi.fn() })),
      toggleItalic: vi.fn(() => ({ run: vi.fn() })),
      toggleUnderline: vi.fn(() => ({ run: vi.fn() })),
      toggleStrike: vi.fn(() => ({ run: vi.fn() })),
      toggleHeading: vi.fn(() => ({ run: vi.fn() })),
      setParagraph: vi.fn(() => ({ run: vi.fn() })),
      setTextAlign: vi.fn(() => ({ run: vi.fn() })),
      toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
      toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      toggleTaskList: vi.fn(() => ({ run: vi.fn() })),
      toggleCode: vi.fn(() => ({ run: vi.fn() })),
      toggleCodeBlock: vi.fn(() => ({ run: vi.fn() })),
      toggleBlockquote: vi.fn(() => ({ run: vi.fn() })),
      insertTable: vi.fn(() => ({ run: vi.fn() })),
      setImage: vi.fn(() => ({ run: vi.fn() })),
      setYoutubeVideo: vi.fn(() => ({ run: vi.fn() })),
      setLink: vi.fn(() => ({ run: vi.fn() })),
      unsetLink: vi.fn(() => ({ run: vi.fn() })),
      extendMarkRange: vi.fn(() => ({
        setLink: vi.fn(() => ({ run: vi.fn() })),
        unsetLink: vi.fn(() => ({ run: vi.fn() }))
      })),
      setColor: vi.fn(() => ({ run: vi.fn() })),
      setHighlight: vi.fn(() => ({ run: vi.fn() })),
      undo: vi.fn(() => ({ run: vi.fn() })),
      redo: vi.fn(() => ({ run: vi.fn() })),
    }))
  })),
  can: vi.fn(() => ({
    toggleBold: vi.fn(() => true),
    toggleItalic: vi.fn(() => true),
    toggleUnderline: vi.fn(() => true),
    toggleStrike: vi.fn(() => true),
    setTextAlign: vi.fn(() => true),
    toggleBulletList: vi.fn(() => true),
    toggleOrderedList: vi.fn(() => true),
    toggleTaskList: vi.fn(() => true),
    toggleCode: vi.fn(() => true),
    toggleCodeBlock: vi.fn(() => true),
    toggleBlockquote: vi.fn(() => true),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
    addRowBefore: vi.fn(() => true),
    addRowAfter: vi.fn(() => true),
    deleteRow: vi.fn(() => true),
    addColumnBefore: vi.fn(() => true),
    addColumnAfter: vi.fn(() => true),
    deleteColumn: vi.fn(() => true),
    deleteTable: vi.fn(() => true),
  })),
  isActive: vi.fn((format) => {
    const activeFormats = ['bold', 'italic'];
    return activeFormats.includes(format);
  }),
  getAttributes: vi.fn(() => ({ href: '' })),
  isEmpty: false,
} as unknown as Editor;

describe('EditorToolbar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    render(<EditorToolbar editor={mockEditor} />);
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
  });

  it('does not render when editor is null', () => {
    const { container } = render(<EditorToolbar editor={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('calls toggleBold when bold button is clicked', () => {
    render(<EditorToolbar editor={mockEditor} />);
    const boldButton = screen.getByTitle('Bold');
    
    fireEvent.click(boldButton);
    
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it('calls toggleItalic when italic button is clicked', () => {
    render(<EditorToolbar editor={mockEditor} />);
    const italicButton = screen.getByTitle('Italic');
    
    fireEvent.click(italicButton);
    
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it('calls undo when undo button is clicked', () => {
    render(<EditorToolbar editor={mockEditor} />);
    const undoButton = screen.getByTitle('Undo');
    
    fireEvent.click(undoButton);
    
    expect(mockEditor.chain).toHaveBeenCalled();
  });

  it('shows active state for bold button when text is bold', () => {
    render(<EditorToolbar editor={mockEditor} />);
    const boldButton = screen.getByTitle('Bold');
    
    // Should have default variant (active state) since mockEditor.isActive returns true for 'bold'
    expect(boldButton).toHaveClass('bg-primary');
  });

  it('handles table insertion', () => {
    render(<EditorToolbar editor={mockEditor} />);
    const tableButton = screen.getByTitle('Table');
    
    fireEvent.click(tableButton);
    
    const insertTableOption = screen.getByText('Insert table');
    fireEvent.click(insertTableOption);
    
    expect(mockEditor.chain).toHaveBeenCalled();
  });
});
