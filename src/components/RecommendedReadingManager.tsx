import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, X, Link as LinkIcon, FileText, History, 
  AlertTriangle, Save, Undo2, Shield, Clock
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  useRecommendedReadingAudit, 
  RecommendedReadingItem, 
  AuditLogEntry, 
  ContentSnapshot 
} from "@/hooks/useRecommendedReadingAudit";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface RecommendedReadingManagerProps {
  pageId: string;
  items: RecommendedReadingItem[];
  onItemsChange: (items: RecommendedReadingItem[]) => void;
  autoSave?: boolean;
}

export function RecommendedReadingManager({ 
  pageId, 
  items, 
  onItemsChange, 
  autoSave = false 
}: RecommendedReadingManagerProps) {
  const [activeTab, setActiveTab] = useState<'link' | 'file'>('link');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [snapshots, setSnapshots] = useState<ContentSnapshot[]>([]);
  const [lastSavedItems, setLastSavedItems] = useState<RecommendedReadingItem[]>(items);
  
  const { toast } = useToast();
  const { 
    createSnapshot, 
    logChange, 
    getAuditLogs, 
    getSnapshots, 
    restoreFromSnapshot,
    isLoading 
  } = useRecommendedReadingAudit(pageId);

  // Track changes for unsaved indicator
  useEffect(() => {
    const hasChanges = JSON.stringify(items) !== JSON.stringify(lastSavedItems);
    setHasUnsavedChanges(hasChanges);
  }, [items, lastSavedItems]);

  // Load audit logs and snapshots
  const loadAuditData = useCallback(async () => {
    try {
      const [logs, snaps] = await Promise.all([
        getAuditLogs(),
        getSnapshots()
      ]);
      setAuditLogs(logs);
      setSnapshots(snaps);
    } catch (error) {
      console.error('Error loading audit data:', error);
    }
  }, [getAuditLogs, getSnapshots]);

  useEffect(() => {
    loadAuditData();
  }, [loadAuditData]);

  // Enhanced add item with audit logging
  const addItem = useCallback(async () => {
    const newItem: RecommendedReadingItem = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      type: activeTab === 'link' ? 'link' : 'file',
      category: 'General',
      ...(activeTab === 'link' ? { url: '' } : { fileUrl: '', fileName: '' })
    };
    
    const newItems = [...items, newItem];
    onItemsChange(newItems);
    
    // Log the addition
    await logChange('add', null, newItem, {
      item_count: newItems.length,
      item_type: newItem.type
    });
    
    if (autoSave) {
      await saveChanges(newItems);
    }
  }, [items, activeTab, onItemsChange, logChange, autoSave]);

  // Enhanced update item with audit logging
  const updateItem = useCallback(async (
    index: number, 
    field: keyof RecommendedReadingItem, 
    value: string
  ) => {
    const oldItem = { ...items[index] };
    const updatedItems = [...items];
    (updatedItems[index] as any)[field] = value;
    onItemsChange(updatedItems);
    
    // Log the update with specific field change
    await logChange('edit', oldItem, updatedItems[index], {
      field_changed: field,
      old_value: oldItem[field],
      new_value: value,
      item_index: index
    });
    
    if (autoSave) {
      await saveChanges(updatedItems);
    }
  }, [items, onItemsChange, logChange, autoSave]);

  // Enhanced remove item with confirmation and audit logging
  const removeItem = useCallback(async (index: number) => {
    const itemToRemove = items[index];
    const updatedItems = items.filter((_, i) => i !== index);
    
    onItemsChange(updatedItems);
    
    // Log the deletion
    await logChange('delete', itemToRemove, null, {
      item_count: updatedItems.length,
      deleted_title: itemToRemove.title
    });
    
    if (autoSave) {
      await saveChanges(updatedItems);
    }
    
    toast({
      title: "Item Removed",
      description: `"${itemToRemove.title || 'Untitled item'}" has been removed.`,
    });
  }, [items, onItemsChange, logChange, autoSave, toast]);

  // Save changes and create snapshot
  const saveChanges = useCallback(async (itemsToSave = items) => {
    try {
      // Create snapshot before saving if there are significant changes
      if (itemsToSave.length !== lastSavedItems.length || 
          itemsToSave.some((item, i) => 
            !lastSavedItems[i] || 
            item.title !== lastSavedItems[i]?.title ||
            item.description !== lastSavedItems[i]?.description
          )) {
        await createSnapshot('pre_save');
      }
      
      setLastSavedItems([...itemsToSave]);
      setHasUnsavedChanges(false);
      
      // Log bulk save operation
      await logChange('bulk_update', lastSavedItems, itemsToSave, {
        items_count: itemsToSave.length,
        save_type: autoSave ? 'auto' : 'manual'
      });
      
      toast({
        title: "Changes Saved",
        description: `${itemsToSave.length} recommended reading items saved.`,
      });
      
    } catch (error) {
      console.error('Error saving changes:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    }
  }, [items, lastSavedItems, createSnapshot, logChange, autoSave, toast]);

  // Undo changes
  const undoChanges = useCallback(() => {
    onItemsChange([...lastSavedItems]);
    setHasUnsavedChanges(false);
    toast({
      title: "Changes Reverted",
      description: "All unsaved changes have been reverted.",
    });
  }, [lastSavedItems, onItemsChange, toast]);

  // Handle bulk operations with confirmation
  const handleBulkDelete = useCallback(async () => {
    await logChange('bulk_delete', items, [], {
      deleted_count: items.length
    });
    onItemsChange([]);
    if (autoSave) {
      await saveChanges([]);
    }
  }, [items, logChange, onItemsChange, autoSave, saveChanges]);

  return (
    <div className="space-y-6">
      {/* Header with save status and actions */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <h3 className="text-lg font-semibold">Recommended Reading</h3>
          {hasUnsavedChanges && (
            <Badge variant="secondary" className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Unsaved Changes
            </Badge>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={undoChanges}
                className="flex items-center gap-2"
              >
                <Undo2 className="h-4 w-4" />
                Undo
              </Button>
              <Button
                size="sm"
                onClick={() => saveChanges()}
                className="flex items-center gap-2"
              >
                <Save className="h-4 w-4" />
                Save Changes
              </Button>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="editor" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="editor">Editor</TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <History className="h-4 w-4" />
            History
          </TabsTrigger>
          <TabsTrigger value="recovery" className="flex items-center gap-2">
            <Shield className="h-4 w-4" />
            Recovery
          </TabsTrigger>
        </TabsList>

        <TabsContent value="editor" className="space-y-4">
          <Card>
            <CardContent className="pt-6 space-y-4">
              {/* Tab buttons for adding new items */}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={activeTab === 'link' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('link')}
                  className="flex items-center gap-2"
                >
                  <LinkIcon className="h-4 w-4" />
                  Add Link
                </Button>
                <Button
                  type="button"
                  variant={activeTab === 'file' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('file')}
                  className="flex items-center gap-2"
                >
                  <FileText className="h-4 w-4" />
                  Add File
                </Button>
              </div>

              <Button
                type="button"
                onClick={addItem}
                className="w-full"
                size="sm"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add {activeTab === 'link' ? 'Link' : 'File'}
              </Button>

              {/* Existing items */}
              {items.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{items.length} Items</span>
                    {items.length > 1 && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="outline" size="sm" className="text-destructive">
                            Clear All
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Clear All Items</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will remove all {items.length} recommended reading items. This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleBulkDelete}>
                              Clear All
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>

                  {items.map((item, index) => (
                    <Card key={item.id || index} className="border-l-4 border-l-primary/20">
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">
                              {item.type === 'link' ? 'LINK' : 'FILE'}
                            </Badge>
                            <span className="text-sm text-muted-foreground">Item {index + 1}</span>
                          </div>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive/80"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remove Item</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Remove "{item.title || 'Untitled item'}"? This action cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removeItem(index)}>
                                  Remove
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>

                        <div className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <Label>Category</Label>
                              <Input
                                value={item.category || 'General'}
                                onChange={(e) => updateItem(index, 'category', e.target.value)}
                                placeholder="General"
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Title</Label>
                              <Input
                                value={item.title}
                                onChange={(e) => updateItem(index, 'title', e.target.value)}
                                placeholder="Enter title"
                              />
                            </div>

                            {item.type === 'link' && (
                              <div className="space-y-2">
                                <Label>Link</Label>
                                <Input
                                  type="url"
                                  value={item.url || ''}
                                  onChange={(e) => updateItem(index, 'url', e.target.value)}
                                  placeholder="https://example.com"
                                />
                              </div>
                            )}

                            {item.type === 'file' && (
                              <div className="space-y-2">
                                <Label>File</Label>
                                {item.fileName ? (
                                  <div className="flex items-center gap-2 p-2 bg-muted rounded">
                                    <FileText className="h-4 w-4" />
                                    <span className="text-sm">{item.fileName}</span>
                                  </div>
                                ) : (
                                  <Input
                                    type="file"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) {
                                        updateItem(index, 'fileName', file.name);
                                        updateItem(index, 'fileUrl', `mock://files/${file.name}`);
                                      }
                                    }}
                                  />
                                )}
                              </div>
                            )}
                          </div>

                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              value={item.description}
                              onChange={(e) => updateItem(index, 'description', e.target.value)}
                              placeholder="Enter description"
                              rows={3}
                            />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Change History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {auditLogs.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No changes recorded yet</p>
                ) : (
                  <div className="space-y-4">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="flex items-start gap-3 p-3 border rounded-lg">
                        <div className="flex-shrink-0 mt-1">
                          <div className="w-2 h-2 bg-primary rounded-full" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {log.operation_type.replace('_', ' ').toUpperCase()}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(log.created_at).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-sm">
                            {log.change_details && JSON.stringify(log.change_details)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recovery">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Content Recovery
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-96">
                {snapshots.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">No snapshots available</p>
                ) : (
                  <div className="space-y-4">
                    {snapshots.map((snapshot) => (
                      <Card key={snapshot.id} className="border-l-4 border-l-blue-500/20">
                        <CardContent className="pt-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm font-medium">
                                {new Date(snapshot.created_at).toLocaleString()}
                              </span>
                              <Badge variant="outline">{snapshot.snapshot_type}</Badge>
                            </div>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  Restore
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Restore Content</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    This will restore the content and recommended reading from {new Date(snapshot.created_at).toLocaleString()}. 
                                    Current changes will be backed up automatically.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction 
                                    onClick={() => restoreFromSnapshot(snapshot.id)}
                                    disabled={isLoading}
                                  >
                                    Restore
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            <strong>{snapshot.title}</strong>
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {snapshot.recommended_reading?.length || 0} recommended reading items
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
