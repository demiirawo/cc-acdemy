
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { EnhancedContentEditor } from '../EnhancedContentEditor';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock TipTap modules
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => '<p>Test content</p>'),
    isEmpty: false,
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({
        toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
        toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
        run: vi.fn(),
      }))
    })),
    can: vi.fn(() => ({
      toggleBulletList: vi.fn(() => true),
      toggleOrderedList: vi.fn(() => true),
    })),
    isActive: vi.fn((type) => {
      if (type === 'bulletList') return true;
      if (type === 'orderedList') return false;
      return false;
    }),
    on: vi.fn(),
    off: vi.fn(),
  })),
  EditorContent: ({ children }: { children: React.ReactNode }) => <div data-testid="editor-content">{children}</div>,
}));

describe('Enhanced List Functionality', () => {
  const defaultProps = {
    content: '<p>Test content</p>',
    onChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders list buttons in toolbar', () => {
    render(<EnhancedContentEditor {...defaultProps} />);
    
    expect(screen.getByTitle('Bullet list')).toBeInTheDocument();
    expect(screen.getByTitle('Numbered list')).toBeInTheDocument();
  });

  it('shows active state for bullet list button', () => {
    render(<EnhancedContentEditor {...defaultProps} />);
    
    const bulletListButton = screen.getByTitle('Bullet list');
    expect(bulletListButton).toHaveClass('bg-primary');
  });

  it('toggles bullet list when button is clicked', async () => {
    const { useEditor } = await import('@tiptap/react');
    const mockEditor = vi.mocked(useEditor).mock.results[0]?.value;

    render(<EnhancedContentEditor {...defaultProps} />);
    
    const bulletListButton = screen.getByTitle('Bullet list');
    fireEvent.click(bulletListButton);

    expect(mockEditor?.chain).toHaveBeenCalled();
  });

  it('toggles ordered list when button is clicked', async () => {
    const { useEditor } = await import('@tiptap/react');
    const mockEditor = vi.mocked(useEditor).mock.results[0]?.value;

    render(<EnhancedContentEditor {...defaultProps} />);
    
    const orderedListButton = screen.getByTitle('Numbered list');
    fireEvent.click(orderedListButton);

    expect(mockEditor?.chain).toHaveBeenCalled();
  });
});
