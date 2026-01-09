
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
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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

    // Check if email is allowed (either care-cuddle.co.uk domain or in exceptions list)
    const isCareCuddleDomain = email.endsWith('@care-cuddle.co.uk');
    
    if (!isCareCuddleDomain) {
      // Check if email is in the exceptions list
      try {
        const { data: exceptions, error } = await supabase
          .from('email_exceptions')
          .select('email')
          .eq('email', email.toLowerCase());
          
        if (error) {
          console.error('Error checking email exceptions:', error);
        }
        
        const isExceptionEmail = exceptions && exceptions.length > 0;
        
        if (!isExceptionEmail) {
          toast({
            title: "Access restricted",
            description: "Only care-cuddle.co.uk email addresses can access this platform.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      } catch (error) {
        console.error('Error checking email exceptions:', error);
        toast({
          title: "Access restricted",
          description: "Only care-cuddle.co.uk email addresses can access this platform.",
          variant: "destructive",
        });
        setIsLoading(false);
        return;
      }
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
        
        // Check for common error types and provide user-friendly messages
        const errorMessage = error.message?.toLowerCase() || '';
        const errorCode = error.code || '';
        
        if (
          errorMessage.includes('already registered') ||
          errorMessage.includes('user already exists') ||
          errorMessage.includes('already been registered') ||
          errorCode === 'user_already_exists' ||
          errorMessage.includes('duplicate') ||
          (error.status === 400 && errorMessage.includes('email'))
        ) {
          toast({
            title: "Email already registered",
            description: "This email address is already signed up. Please contact support@ccforms.co.uk for assistance.",
            variant: "destructive",
          });
        } else if (
          error.status === 500 || 
          error.status === 502 || 
          error.status === 503 ||
          errorMessage.includes('edge function') ||
          errorMessage.includes('non-2xx')
        ) {
          toast({
            title: "Sign up issue",
            description: "There was an issue with sign up. Please contact support@ccforms.co.uk for assistance.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Failed to send magic link",
            description: "There was an issue sending the magic link. Please contact support@ccforms.co.uk for assistance.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Magic link sent!",
          description: "Check your email and click the magic link to sign in. The link will expire in 1 hour.",
        });
        setEmail("");
      }
    } catch (error: any) {
      console.error('Unexpected magic link error:', error);
      
      // Provide friendly catch-all error message
      const errorMessage = error?.message?.toLowerCase() || '';
      
      if (
        errorMessage.includes('already registered') ||
        errorMessage.includes('user already exists') ||
        errorMessage.includes('already been registered')
      ) {
        toast({
          title: "Email already registered",
          description: "This email address is already signed up. Please contact support@ccforms.co.uk for assistance.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sign up issue",
          description: "There was an issue with sign up. Please contact support@ccforms.co.uk for assistance.",
          variant: "destructive",
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!username || !password) {
      toast({
        title: "Credentials required",
        description: "Please enter both username and password.",
        variant: "destructive",
      });
      setIsLoading(false);
      return;
    }

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: username,
        password: password,
      });

      if (error) {
        console.error('Admin login error:', error);
        toast({
          title: "Login failed",
          description: error.message || "Invalid credentials. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login successful",
          description: "Welcome back!",
        });
        setUsername("");
        setPassword("");
      }
    } catch (error: any) {
      console.error('Unexpected login error:', error);
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
          {!isAdminLogin ? (
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
              <Button 
                type="button" 
                variant="outline" 
                className="w-full" 
                onClick={() => setIsAdminLogin(true)}
                disabled={isLoading}
              >
                Admin Login
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                A secure link will be sent to your email. Click it to sign in instantly - no password required.
              </p>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin} className="space-y-4">
              <div className="space-y-2">
                <Input
                  type="email"
                  placeholder="Admin username/email"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
                <Input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Admin Login
              </Button>
              <Button 
                type="button" 
                variant="outline" 
                className="w-full" 
                onClick={() => setIsAdminLogin(false)}
                disabled={isLoading}
              >
                Back to Magic Link
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Enter your admin credentials to sign in directly.
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
