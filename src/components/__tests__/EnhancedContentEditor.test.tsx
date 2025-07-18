
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedContentEditor } from '../EnhancedContentEditor';
import { vi, describe, it, expect } from 'vitest';

// Mock TipTap modules
vi.mock('@tiptap/react', () => ({
  useEditor: vi.fn(() => ({
    getHTML: vi.fn(() => '<p>Test content</p>'),
    isEmpty: false,
    chain: vi.fn(() => ({
      focus: vi.fn(() => ({ run: vi.fn() }))
    })),
    can: vi.fn(() => ({ run: vi.fn() })),
    isActive: vi.fn(() => false),
  })),
  EditorContent: ({ children }: { children: React.ReactNode }) => <div data-testid="editor-content">{children}</div>,
}));

describe('EnhancedContentEditor', () => {
  const defaultProps = {
    content: '<p>Initial content</p>',
    onChange: vi.fn(),
  };

  it('renders without crashing', () => {
    render(<EnhancedContentEditor {...defaultProps} />);
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('displays placeholder when editor is empty', async () => {
    const { useEditor } = await import('@tiptap/react');
    vi.mocked(useEditor).mockReturnValue({
      getHTML: vi.fn(() => ''),
      isEmpty: true,
      chain: vi.fn(() => ({
        focus: vi.fn(() => ({ run: vi.fn() }))
      })),
      can: vi.fn(() => ({ run: vi.fn() })),
      isActive: vi.fn(() => false),
    } as any);

    render(<EnhancedContentEditor {...defaultProps} placeholder="Type something..." />);
    
    expect(screen.getByText('Type something...')).toBeInTheDocument();
  });

  it('calls onChange when content changes', async () => {
    const onChange = vi.fn();
    const mockEditor = {
      getHTML: vi.fn(() => '<p>New content</p>'),
      isEmpty: false,
      chain: vi.fn(() => ({
        focus: vi.fn(() => ({ run: vi.fn() }))
      })),
      can: vi.fn(() => ({ run: vi.fn() })),
      isActive: vi.fn(() => false),
    };

    const { useEditor } = await import('@tiptap/react');
    vi.mocked(useEditor).mockImplementation((config: any) => {
      // Simulate content update
      setTimeout(() => {
        config.onUpdate({ editor: mockEditor });
      }, 0);
      return mockEditor;
    });

    render(<EnhancedContentEditor {...defaultProps} onChange={onChange} />);
    
    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith('<p>New content</p>');
    });
  });

  it('renders loading state when editor is not ready', async () => {
    const { useEditor } = await import('@tiptap/react');
    vi.mocked(useEditor).mockReturnValue(null);

    render(<EnhancedContentEditor {...defaultProps} />);
    
    expect(screen.getByRole('generic')).toHaveClass('animate-pulse');
  });

  it('applies custom className', () => {
    const { container } = render(
      <EnhancedContentEditor {...defaultProps} className="custom-editor" />
    );
    
    expect(container.firstChild).toHaveClass('custom-editor');
  });
});
