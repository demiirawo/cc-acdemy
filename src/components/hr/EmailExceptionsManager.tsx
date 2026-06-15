import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Mail, Trash2 } from "lucide-react";

interface EmailException {
  id: string;
  email: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

export function EmailExceptionsManager() {
  const { toast } = useToast();
  const [emailExceptions, setEmailExceptions] = useState<EmailException[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [newReason, setNewReason] = useState("");
  const [addEmailDialogOpen, setAddEmailDialogOpen] = useState(false);

  const fetchEmailExceptions = async () => {
    try {
      const { data, error } = await supabase
        .from("email_exceptions")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      setEmailExceptions(data || []);
    } catch (error) {
      console.error("Error fetching email exceptions:", error);
    }
  };

  useEffect(() => {
    fetchEmailExceptions();
    const channel = supabase
      .channel("email-exceptions-settings")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "email_exceptions" },
        () => fetchEmailExceptions()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const addEmailException = async () => {
    if (!newEmail.trim()) {
      toast({ title: "Error", description: "Email address is required", variant: "destructive" });
      return;
    }
    try {
      const { error } = await supabase.from("email_exceptions").insert({
        email: newEmail.toLowerCase().trim(),
        reason: newReason.trim() || null,
        created_by: (await supabase.auth.getUser()).data.user?.id,
      });
      if (error) throw error;
      toast({ title: "Success", description: "Email exception added successfully" });
      setNewEmail("");
      setNewReason("");
      setAddEmailDialogOpen(false);
    } catch (error) {
      console.error("Error adding email exception:", error);
      toast({ title: "Error", description: "Failed to add email exception", variant: "destructive" });
    }
  };

  const deleteEmailException = async (id: string) => {
    try {
      const { error } = await supabase.from("email_exceptions").delete().eq("id", id);
      if (error) throw error;
      toast({ title: "Success", description: "Email exception removed successfully" });
    } catch (error) {
      console.error("Error deleting email exception:", error);
      toast({ title: "Error", description: "Failed to remove email exception", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Email Exceptions</h3>
          <p className="text-sm text-muted-foreground">Allow specific email addresses to access the platform</p>
        </div>
        <Dialog open={addEmailDialogOpen} onOpenChange={setAddEmailDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Exception
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Email Exception</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="ee-email">Email Address</Label>
                <Input
                  id="ee-email"
                  type="email"
                  placeholder="user@example.com"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ee-reason">Reason (Optional)</Label>
                <Textarea
                  id="ee-reason"
                  placeholder="Explain why this email should have access..."
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setAddEmailDialogOpen(false)}>Cancel</Button>
                <Button onClick={addEmailException}>Add Exception</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4">
        {emailExceptions.map((exception) => (
          <Card key={exception.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                    <Mail className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{exception.email}</CardTitle>
                    {exception.reason && (
                      <p className="text-sm text-muted-foreground">{exception.reason}</p>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteEmailException(exception.id)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="text-sm text-muted-foreground">
                Added: {new Date(exception.created_at).toLocaleDateString()}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {emailExceptions.length === 0 && (
        <div className="text-center py-12">
          <Mail className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No email exceptions</h3>
          <p className="text-muted-foreground">No email exceptions have been added yet.</p>
        </div>
      )}
    </div>
  );
}
