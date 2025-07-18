
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EnhancedContentEditor } from '../EnhancedContentEditor';
import { vi, describe, it, expect, beforeEach } from 'vitest';

// Integration test with more realistic editor simulation
describe('Editor Integration Tests', () => {
  const mockOnChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock window.prompt for media insertion tests
    global.prompt = vi.fn();
  });

  it('integrates toolbar with editor for basic formatting', async () => {
    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    // Wait for editor to load
    await waitFor(() => {
      expect(screen.getByTestId('editor-content')).toBeInTheDocument();
    });

    // Test that toolbar buttons are present
    expect(screen.getByTitle('Bold')).toBeInTheDocument();
    expect(screen.getByTitle('Italic')).toBeInTheDocument();
    expect(screen.getByTitle('Underline')).toBeInTheDocument();
  });

  it('handles image insertion workflow', async () => {
    vi.mocked(global.prompt).mockReturnValue('https://example.com/image.jpg');

    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Insert image')).toBeInTheDocument();
    });

    const imageButton = screen.getByTitle('Insert image');
    fireEvent.click(imageButton);

    expect(global.prompt).toHaveBeenCalledWith('Enter image URL:');
  });

  it('handles YouTube video insertion workflow', async () => {
    vi.mocked(global.prompt).mockReturnValue('https://youtube.com/watch?v=test');

    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Insert YouTube video')).toBeInTheDocument();
    });

    const videoButton = screen.getByTitle('Insert YouTube video');
    fireEvent.click(videoButton);

    expect(global.prompt).toHaveBeenCalledWith('Enter YouTube URL:');
  });

  it('handles table insertion and management', async () => {
    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Table')).toBeInTheDocument();
    });

    // Open table dropdown
    const tableButton = screen.getByTitle('Table');
    fireEvent.click(tableButton);

    // Click insert table
    const insertTableOption = screen.getByText('Insert table');
    expect(insertTableOption).toBeInTheDocument();
    fireEvent.click(insertTableOption);
  });

  it('handles link insertion and editing', async () => {
    vi.mocked(global.prompt).mockReturnValue('https://example.com');

    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Insert link')).toBeInTheDocument();
    });

    const linkButton = screen.getByTitle('Insert link');
    fireEvent.click(linkButton);

    expect(global.prompt).toHaveBeenCalledWith('URL', '');
  });

  it('handles undo/redo functionality', async () => {
    render(
      <EnhancedContentEditor 
        content="<p>Test content</p>" 
        onChange={mockOnChange}
      />
    );

    await waitFor(() => {
      expect(screen.getByTitle('Undo')).toBeInTheDocument();
      expect(screen.getByTitle('Redo')).toBeInTheDocument();
    });

    const undoButton = screen.getByTitle('Undo');
    const redoButton = screen.getByTitle('Redo');
    
    // These should be present and clickable
    expect(undoButton).toBeInTheDocument();
    expect(redoButton).toBeInTheDocument();
  });
});
