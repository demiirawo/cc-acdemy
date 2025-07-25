
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
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('Auth state change:', event, session?.user?.id);
        
        // Handle different auth events
        if (event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          setSession(session);
          setUser(session?.user ?? null);
        } else if (event === 'SIGNED_IN') {
          setSession(session);
          setUser(session?.user ?? null);
          
          // Check if this is from email confirmation or magic link
          const urlParams = new URLSearchParams(window.location.search);
          const urlHash = window.location.hash;
          
          if (urlParams.get('type') === 'signup' || urlHash.includes('type=signup')) {
            toast({
              title: "Email confirmed!",
              description: "Your account has been verified. Welcome to Care Cuddle Academy!",
            });
            
            // Clean up URL parameters
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } else if (urlParams.get('type') === 'magiclink' || urlHash.includes('type=magiclink')) {
            toast({
              title: "Welcome back!",
              description: "You've been signed in successfully with your magic link.",
            });
            
            // Clean up URL parameters
            const cleanUrl = window.location.origin + window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          }
        } else if (event === 'INITIAL_SESSION') {
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
        // Check for email confirmation in URL
        const urlParams = new URLSearchParams(window.location.search);
        const urlHash = window.location.hash;
        
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
