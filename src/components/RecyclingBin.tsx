import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Trash2, RotateCcw, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatDistanceToNow } from "date-fns";

interface DeletedPage {
  id: string;
  title: string;
  deleted_at: string;
  created_at: string;
}

export const RecyclingBin = () => {
  const [deletedPages, setDeletedPages] = useState<DeletedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [permanentDeleteDialog, setPermanentDeleteDialog] = useState<string | null>(null);
  const { toast } = useToast();

  const fetchDeletedPages = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("pages")
        .select("id, title, deleted_at, created_at")
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setDeletedPages(data || []);
    } catch (error: any) {
      console.error("Error fetching deleted pages:", error);
      toast({
        title: "Error",
        description: "Failed to load deleted pages",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDeletedPages();
  }, []);

  const handleRestore = async (pageId: string) => {
    try {
      setActionLoading(pageId);
      const { data, error } = await supabase.rpc("restore_page", {
        p_page_id: pageId,
      });

      if (error) throw error;

      const result = data as { success: boolean; message?: string; error?: string };
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Page restored successfully",
        });
        fetchDeletedPages();
      } else {
        throw new Error(result.error || "Failed to restore page");
      }
    } catch (error: any) {
      console.error("Error restoring page:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to restore page",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermanentDelete = async (pageId: string) => {
    try {
      setActionLoading(pageId);
      const { data, error } = await supabase.rpc("permanently_delete_page", {
        p_page_id: pageId,
      });

      if (error) throw error;

      const result = data as { success: boolean; message?: string; error?: string };
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Page permanently deleted",
        });
        fetchDeletedPages();
      } else {
        throw new Error(result.error || "Failed to delete page");
      }
    } catch (error: any) {
      console.error("Error deleting page:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to delete page",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
      setPermanentDeleteDialog(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5" />
            Recycling Bin
          </CardTitle>
        </CardHeader>
        <CardContent>
          {deletedPages.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">
              No deleted pages. Your recycling bin is empty.
            </p>
          ) : (
            <div className="space-y-3">
              {deletedPages.map((page) => (
                <div
                  key={page.id}
                  className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1">
                    <h3 className="font-medium">{page.title}</h3>
                    <p className="text-sm text-muted-foreground">
                      Deleted {formatDistanceToNow(new Date(page.deleted_at))} ago
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(page.id)}
                      disabled={actionLoading === page.id}
                    >
                      {actionLoading === page.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Restore
                        </>
                      )}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setPermanentDeleteDialog(page.id)}
                      disabled={actionLoading === page.id}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Forever
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={!!permanentDeleteDialog}
        onOpenChange={() => setPermanentDeleteDialog(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Page?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the page
              and all its content.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => permanentDeleteDialog && handlePermanentDelete(permanentDeleteDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
