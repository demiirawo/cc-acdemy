import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, BookOpen } from "lucide-react";
import { format } from "date-fns";

interface PageAcknowledgementProps {
  pageId: string;
  pageTitle: string;
}

export function PageAcknowledgement({ pageId, pageTitle }: PageAcknowledgementProps) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [acknowledgedAt, setAcknowledgedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    if (user && pageId) {
      checkAcknowledgement();
    }
  }, [user, pageId]);

  const checkAcknowledgement = async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase
        .from('page_acknowledgements')
        .select('acknowledged_at')
        .eq('page_id', pageId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setAcknowledged(true);
        setAcknowledgedAt(data.acknowledged_at);
      }
    } catch (error) {
      console.error('Error checking acknowledgement:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async () => {
    if (!user) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('page_acknowledgements')
        .insert({
          page_id: pageId,
          user_id: user.id,
        });

      if (error) throw error;

      setAcknowledged(true);
      setAcknowledgedAt(new Date().toISOString());
      
      toast({
        title: "Page Acknowledged",
        description: "You have confirmed that you have read and understood this page.",
      });
    } catch (error: any) {
      console.error('Error acknowledging page:', error);
      // Handle duplicate key error gracefully
      if (error.code === '23505') {
        setAcknowledged(true);
        toast({
          title: "Already Acknowledged",
          description: "You have already acknowledged this page.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to acknowledge page. Please try again.",
          variant: "destructive",
        });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  return (
    <Card className="mt-8 border-primary/20 bg-primary/5">
      <CardContent className="py-6">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${acknowledged ? 'bg-green-100 dark:bg-green-900/30' : 'bg-primary/10'}`}>
              {acknowledged ? (
                <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
              ) : (
                <BookOpen className="h-6 w-6 text-primary" />
              )}
            </div>
            <div>
              <h3 className="font-semibold text-foreground">
                {acknowledged ? 'Page Acknowledged' : 'Acknowledge This Page'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {acknowledged 
                  ? `You acknowledged this page on ${format(new Date(acknowledgedAt!), 'dd MMM yyyy \'at\' HH:mm')}`
                  : 'Please confirm you have read and understood the content of this page'
                }
              </p>
            </div>
          </div>
          
          {!acknowledged && (
            <Button 
              onClick={handleAcknowledge} 
              disabled={submitting}
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="h-4 w-4" />
              {submitting ? 'Acknowledging...' : 'I have read and understood this page'}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
