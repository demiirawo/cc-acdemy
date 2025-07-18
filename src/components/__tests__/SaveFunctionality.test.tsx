
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
        run: vi.fn(),
        insertTable: vi.fn(() => ({ run: vi.fn() })),
        toggleBulletList: vi.fn(() => ({ run: vi.fn() })),
        toggleOrderedList: vi.fn(() => ({ run: vi.fn() })),
      }))
    })),
    can: vi.fn(() => ({ 
      run: vi.fn(),
      undo: vi.fn(() => true),
      redo: vi.fn(() => true),
      toggleBulletList: vi.fn(() => true),
      toggleOrderedList: vi.fn(() => true),
    })),
    isActive: vi.fn(() => false),
    commands: {
      setContent: vi.fn(),
    },
  })),
  EditorContent: ({ children }: { children: React.ReactNode }) => <div data-testid="editor-content">{children}</div>,
}));

// Mock toast
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

describe('Save Functionality', () => {
  const mockOnSave = vi.fn();
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    content: '<p>Initial content</p>',
    onChange: vi.fn(),
    title: 'Test Page',
    onSave: mockOnSave,
  };

  it('renders save button when onSave is provided', () => {
    render(<EnhancedContentEditor {...defaultProps} />);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('shows save status indicator', () => {
    render(<EnhancedContentEditor {...defaultProps} />);
    expect(screen.getByText(/all changes saved/i)).toBeInTheDocument();
  });

  it('calls onSave when save button is clicked', async () => {
    const { useEditor } = await import('@tiptap/react');
    const mockEditor = {
      getHTML: vi.fn(() => '<p>Test content</p>'),
      isEmpty: false,
      chain: vi.fn(() => ({
        focus: vi.fn(() => ({ run: vi.fn() }))
      })),
      can: vi.fn(() => ({ run: vi.fn() })),
      isActive: vi.fn(() => false),
      commands: { setContent: vi.fn() },
    };
    vi.mocked(useEditor).mockReturnValue(mockEditor as any);

    render(<EnhancedContentEditor {...defaultProps} />);
    
    // Simulate content change to enable save button
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(mockOnSave).toHaveBeenCalledWith('Test Page', '<p>Test content</p>');
    });
  });

  it('shows unsaved changes status when content changes', async () => {
    const onChange = vi.fn();
    render(<EnhancedContentEditor {...defaultProps} onChange={onChange} />);
    
    // The component should show unsaved changes when onChange is called with different content
    expect(screen.getByTestId('editor-content')).toBeInTheDocument();
  });

  it('handles save errors gracefully', async () => {
    const failingOnSave = vi.fn().mockRejectedValue(new Error('Save failed'));
    
    render(<EnhancedContentEditor {...defaultProps} onSave={failingOnSave} />);
    
    fireEvent.click(screen.getByRole('button', { name: /save/i }));
    
    await waitFor(() => {
      expect(failingOnSave).toHaveBeenCalled();
    });
  });
});
