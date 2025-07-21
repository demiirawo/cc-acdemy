import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export function ResetPasswordPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for password reset tokens in URL hash or search params
    const urlHash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    
    // Supabase password reset links use hash parameters
    const hashParams = new URLSearchParams(urlHash.substring(1));
    
    // Check both hash and search params for tokens
    const accessToken = hashParams.get('access_token') || searchParams.get('access_token');
    const refreshToken = hashParams.get('refresh_token') || searchParams.get('refresh_token');
    const type = hashParams.get('type') || searchParams.get('type');
    
    console.log('Reset page - type:', type, 'has tokens:', !!accessToken, !!refreshToken);
    
    if (type !== 'recovery' || !accessToken || !refreshToken) {
      toast({
        title: "Invalid reset link",
        description: "This password reset link is invalid or has expired.",
        variant: "destructive",
      });
      navigate('/');
      return;
    }

    // Set the session with the tokens from the URL
    supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  }, [navigate, toast]);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password !== confirmPassword) {
      toast({
        title: "Passwords don't match",
        description: "Please make sure both passwords are identical.",
        variant: "destructive",
      });
      return;
    }

    if (password.length < 6) {
      toast({
        title: "Password too short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: password
      });

      if (error) {
        console.error('Password reset error:', error);
        toast({
          title: "Reset failed",
          description: error.message || "Unable to reset password. Please try again.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Password updated!",
          description: "Your password has been successfully updated. You are now signed in.",
        });
        
        // After successful password update, the user should be properly authenticated
        // The auth state will update automatically, so just navigate to home
        navigate('/');
      }
    } catch (error: any) {
      console.error('Unexpected password reset error:', error);
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
          <CardTitle className="text-2xl">Reset Your Password</CardTitle>
          <CardDescription>
            Enter your new password below
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2 relative">
              <Input
                type={showPassword ? "text" : "password"}
                placeholder="New Password (min. 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <div className="space-y-2 relative">
              <Input
                type={showConfirmPassword ? "text" : "password"}
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                minLength={6}
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-8 w-8 p-0"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <Button type="submit" className="w-full bg-gradient-primary" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Update Password
            </Button>
            <Button 
              type="button" 
              variant="ghost" 
              className="w-full" 
              onClick={() => navigate('/')}
            >
              Back to Sign In
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}