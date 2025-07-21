
import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('Auth state change:', event, session?.user?.id);
        console.log('Current URL:', window.location.href);
        console.log('URL hash:', window.location.hash);
        console.log('URL search:', window.location.search);
        
        // Check if this is a recovery session - don't auto-login for password reset
        const urlHash = window.location.hash;
        const urlParams = new URLSearchParams(window.location.search);
        const isRecoveryFlow = urlHash.includes('type=recovery') || urlParams.get('type') === 'recovery';
        
        console.log('Is recovery flow?', isRecoveryFlow);
        
        // Handle different auth events
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
        } else if (event === 'SIGNED_IN') {
          console.log('SIGNED_IN event - recovery flow check:', isRecoveryFlow);
          console.log('Is recovery mode?', isRecoveryMode);
          
          // Always set session and user, but don't navigate if in recovery mode
          setSession(session);
          setUser(session?.user ?? null);
          
          // If we're in recovery mode, don't show success message or navigate
          if (isRecoveryFlow || isRecoveryMode) {
            console.log('Recovery session detected - session established but staying on reset page');
            return;
          }
          
          // Check if this is from email confirmation
          if (urlParams.get('type') === 'signup' || urlHash.includes('type=signup')) {
            toast({
              title: "Email confirmed!",
              description: "Your account has been verified. Welcome to Care Cuddle Academy!",
            });
            
            // Clean up URL parameters
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        } else if (event === 'INITIAL_SESSION') {
          console.log('INITIAL_SESSION event - recovery flow check:', isRecoveryFlow);
          console.log('Is recovery mode?', isRecoveryMode);
          
          setSession(session);
          setUser(session?.user ?? null);
        }
        
        if (mounted) {
          setLoading(false);
        }
      }
    );

    // THEN check for existing session and handle URL parameters
    const initializeAuth = async () => {
      try {
        // Check for password reset in URL hash
        const urlHash = window.location.hash;
        const urlParams = new URLSearchParams(window.location.search);
        
        if (urlHash.includes('type=recovery') || urlParams.get('type') === 'recovery') {
          console.log('Password reset detected in URL - setting recovery mode');
          console.log('Hash:', urlHash);
          console.log('Search params:', urlParams.toString());
          
          setIsRecoveryMode(true);
          
          if (mounted) {
            setLoading(false);
          }
          
          // If we're not already on the reset page, redirect there
          if (!window.location.pathname.includes('/reset-password')) {
            console.log('Redirecting to reset password page');
            window.location.href = `/reset-password${urlHash}${window.location.search}`;
          }
          return;
        }
        
        // Check for email confirmation in URL
        if (urlParams.get('type') === 'signup' || urlHash.includes('type=signup')) {
          console.log('Email confirmation detected in URL');
          
          // Let Supabase handle the session from URL parameters
          const { data, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('Error confirming email:', error);
            toast({
              title: "Confirmation failed",
              description: "There was an issue confirming your email. Please try again.",
              variant: "destructive",
            });
          }
          
          if (mounted) {
            setSession(data.session);
            setUser(data.session?.user ?? null);
            setLoading(false);
          }
          
          return;
        }
        
        // Normal session check
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) {
          console.error('Error getting session:', error);
        }
        
        if (mounted) {
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } catch (error) {
        console.error('Error initializing auth:', error);
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [toast]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Error signing out:', error);
    }
  };

  const value = {
    user,
    session,
    loading,
    signOut,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
