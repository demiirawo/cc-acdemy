
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Mail, CheckCircle, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface Profile {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  role: string | null;
  created_at: string;
  email_confirmed_at: string | null;
}

interface UserManagementActionsProps {
  profile: Profile;
  onUpdate: () => void;
}

export function UserManagementActions({ profile, onUpdate }: UserManagementActionsProps) {
  const [isResendingEmail, setIsResendingEmail] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleResendConfirmation = async () => {
    if (!profile.email) {
      toast({
        title: "Error",
        description: "No email address found for this user",
        variant: "destructive"
      });
      return;
    }

    setIsResendingEmail(true);

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: profile.email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        }
      });

      if (error) {
        if (error.message.includes('rate limit') || error.message.includes('429')) {
          toast({
            title: "Rate limited",
            description: "Please wait before sending another confirmation email to this user.",
            variant: "destructive"
          });
        } else {
          toast({
            title: "Failed to resend",
            description: error.message,
            variant: "destructive"
          });
        }
      } else {
        toast({
          title: "Confirmation email sent",
          description: `Sent confirmation email to ${profile.email}`,
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to resend confirmation email",
        variant: "destructive"
      });
    } finally {
      setIsResendingEmail(false);
    }
  };

  const handleManualConfirm = async () => {
    try {
      // Note: This would require admin privileges to update auth.users table
      // For now, we'll show a message about contacting Supabase support
      toast({
        title: "Manual confirmation",
        description: "To manually confirm users, please contact Supabase support or use the admin panel.",
        variant: "default"
      });
      setConfirmDialogOpen(false);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to confirm user manually",
        variant: "destructive"
      });
    }
  };

  const isUnconfirmed = !profile.email_confirmed_at;

  if (!isUnconfirmed) {
    return null;
  }

  return (
    <div className="flex gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleResendConfirmation}
        disabled={isResendingEmail}
        className="text-blue-600 hover:text-blue-700"
      >
        <Mail className="h-4 w-4 mr-1" />
        {isResendingEmail ? "Sending..." : "Resend Email"}
      </Button>

      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="text-green-600 hover:text-green-700"
          >
            <CheckCircle className="h-4 w-4 mr-1" />
            Confirm User
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Manual User Confirmation
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Are you sure you want to manually confirm this user account?
            </p>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
              <p className="text-sm text-amber-800">
                <strong>User:</strong> {profile.display_name || 'No name'} ({profile.email})
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setConfirmDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleManualConfirm}
                className="bg-green-600 hover:bg-green-700"
              >
                Confirm User
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
