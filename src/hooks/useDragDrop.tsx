
import { useState, useCallback, useRef } from 'react';
import { useToast } from "@/hooks/use-toast";

interface DragDropItem {
  id: string;
  type: 'page' | 'space';
  title: string;
  parent_page_id?: string | null;
  space_id?: string | null;
  version?: number;
}

interface DragDropResult {
  success: boolean;
  newParentId?: string | null;
  targetIndex?: number;
}

export const useDragDrop = (
  onItemMove: (itemId: string, newParentId: string | null, targetIndex: number) => Promise<DragDropResult>
) => {
  const [draggedItem, setDraggedItem] = useState<DragDropItem | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; position: 'above' | 'below' | 'inside' } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartTime = useRef<number>(0);
  const { toast } = useToast();

  const handleDragStart = useCallback((item: DragDropItem, event: React.DragEvent) => {
    console.log('Drag start:', item);
    dragStartTime.current = Date.now();
    setDraggedItem(item);
    setIsDragging(true);
    
    // Set drag data
    event.dataTransfer.setData('application/json', JSON.stringify(item));
    event.dataTransfer.effectAllowed = 'move';
    
    // Add visual feedback
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '0.5';
    }
  }, []);

  const handleDragEnd = useCallback((event: React.DragEvent) => {
    console.log('Drag end');
    setDraggedItem(null);
    setDropTarget(null);
    setIsDragging(false);
    
    // Reset visual feedback
    if (event.currentTarget instanceof HTMLElement) {
      event.currentTarget.style.opacity = '1';
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent, targetItem: DragDropItem) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    
    if (!draggedItem || draggedItem.id === targetItem.id) return;
    
    // Determine drop position based on mouse position
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = event.clientY - rect.top;
    const height = rect.height;
    
    let position: 'above' | 'below' | 'inside' = 'below';
    
    if (y < height * 0.25) {
      position = 'above';
    } else if (y > height * 0.75) {
      position = 'below';
    } else {
      position = 'inside';
    }
    
    // Prevent dropping item inside itself or its children
    if (position === 'inside' && targetItem.type === 'page') {
      // Check if target is a child of dragged item (simplified check)
      if (targetItem.parent_page_id === draggedItem.id) {
        return;
      }
    }
    
    setDropTarget({ id: targetItem.id, position });
  }, [draggedItem]);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    // Only clear drop target if leaving the entire item area
    const relatedTarget = event.relatedTarget as HTMLElement;
    const currentTarget = event.currentTarget as HTMLElement;
    
    if (!currentTarget.contains(relatedTarget)) {
      setDropTarget(null);
    }
  }, []);

  const handleDrop = useCallback(async (event: React.DragEvent, targetItem: DragDropItem) => {
    event.preventDefault();
    
    if (!draggedItem || !dropTarget) return;
    
    // Prevent very quick drag/drops (likely accidental)
    const dragDuration = Date.now() - dragStartTime.current;
    if (dragDuration < 150) {
      console.log('Drag too quick, ignoring');
      return;
    }
    
    try {
      let newParentId: string | null = null;
      let targetIndex = 0;
      
      if (dropTarget.position === 'inside') {
        // Move inside the target item
        newParentId = targetItem.id;
      } else {
        // Move above or below the target item
        newParentId = targetItem.parent_page_id || null;
        // targetIndex would be calculated based on position relative to target
      }
      
      console.log('Dropping item:', {
        draggedItem: draggedItem.id,
        targetItem: targetItem.id,
        position: dropTarget.position,
        newParentId
      });
      
      // Completely disable drag and drop reordering to prevent conflicts
      // All reordering should be done via the up/down arrow buttons
      toast({
        title: "Drag and drop disabled",
        description: "Use the up/down arrow buttons on hover to reorder pages.",
        variant: "default"
      });
      
      return;
    } catch (error) {
      console.error('Error moving item:', error);
      toast({
        title: "Error",
        description: "An error occurred while moving the page.",
        variant: "destructive"
      });
    } finally {
      setDraggedItem(null);
      setDropTarget(null);
      setIsDragging(false);
    }
  }, [draggedItem, dropTarget, onItemMove, toast]);

  const getDropIndicatorClass = useCallback((itemId: string) => {
    if (!dropTarget || dropTarget.id !== itemId) return '';
    
    switch (dropTarget.position) {
      case 'above':
        return 'border-t-2 border-primary';
      case 'below':
        return 'border-b-2 border-primary';
      case 'inside':
        return 'bg-primary/10 border border-primary';
      default:
        return '';
    }
  }, [dropTarget]);

  return {
    draggedItem,
    dropTarget,
    isDragging,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    getDropIndicatorClass
  };
};
