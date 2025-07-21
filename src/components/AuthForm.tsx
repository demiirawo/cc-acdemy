
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

interface AuthFormProps {
  onAuthStateChange: () => void;
}

export function AuthForm({ onAuthStateChange }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");
  const { toast } = useToast();

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!email) {
      toast({
        title: "Email required",
        description: "Please enter your email address to receive a magic link.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    // Check if email domain is care-cuddle.co.uk for new users
    if (!email.endsWith('@care-cuddle.co.uk')) {
      toast({
        title: "Access restricted",
        description: "Only care-cuddle.co.uk email addresses can access this platform.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        }
      });

      if (error) {
        console.error('Magic link error:', error);
        toast({
          title: "Failed to send magic link",
          description: error.message || "Unable to send magic link. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Magic link sent!",
          description: "Check your email and click the magic link to sign in. The link will expire in 1 hour.",
        });
        setEmail("");
      }
    } catch (error: any) {
      console.error('Unexpected magic link error:', error);
      toast({
        title: "Error",
        description: error?.message || "An unexpected error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: '#5E18EB' }}>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-20 h-20 flex items-center justify-center mx-auto mb-4">
            <img src="/lovable-uploads/260e3091-eda4-4cc2-a0c5-5483261cafd3.png" alt="Care Cuddle" className="max-w-full max-h-full object-contain" />
          </div>
          <CardTitle className="text-2xl">Care Cuddle Academy</CardTitle>
          <CardDescription>
            Enter your email to receive a secure magic link for instant access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleMagicLink} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Enter your @care-cuddle.co.uk email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Send Magic Link
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              A secure link will be sent to your email. Click it to sign in instantly - no password required.
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
