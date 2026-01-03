import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, Clock, ExternalLink, FileText, User, Mail, Phone, Briefcase, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface OnboardingOwner {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
}

interface OnboardingStep {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  step_type: string;
  target_page_id: string | null;
  external_url: string | null;
  owner_id: string | null;
  stage: string;
  owner?: OnboardingOwner | null;
}

interface Completion {
  step_id: string;
  completed_at: string;
}

interface PageAcknowledgement {
  page_id: string;
  acknowledged_at: string;
}

// Helper to render description with clickable links
function renderDescriptionWithLinks(description: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = description.split(urlRegex);
  
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          {part}
          <ExternalLink className="h-3 w-3" />
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function StaffOnboardingView() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<PageAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      fetchData();
    }
  }, [user]);

  const fetchData = async () => {
    if (!user) return;
    
    try {
      // Fetch all onboarding steps with owner details
      const { data: stepsData, error: stepsError } = await supabase
        .from('onboarding_steps')
        .select(`
          id, title, description, sort_order, step_type, target_page_id, external_url, owner_id, stage,
          owner:onboarding_owners(id, name, role, email, phone)
        `)
        .order('stage', { ascending: true })
        .order('sort_order', { ascending: true });

      if (stepsError) throw stepsError;

      // Fetch user's completions
      const { data: completionsData, error: completionsError } = await supabase
        .from('onboarding_completions')
        .select('step_id, completed_at')
        .eq('user_id', user.id);

      if (completionsError) throw completionsError;

      // Fetch page acknowledgements for internal page steps
      const internalPageIds = (stepsData || [])
        .filter(s => s.step_type === 'internal_page' && s.target_page_id)
        .map(s => s.target_page_id);

      let ackData: PageAcknowledgement[] = [];
      if (internalPageIds.length > 0) {
        const { data, error: ackError } = await supabase
          .from('page_acknowledgements')
          .select('page_id, acknowledged_at')
          .eq('user_id', user.id)
          .in('page_id', internalPageIds);

        if (ackError) throw ackError;
        ackData = data || [];
      }

      setSteps(stepsData || []);
      setCompletions(completionsData || []);
      setAcknowledgements(ackData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load onboarding steps",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isStepCompleted = (step: OnboardingStep): boolean => {
    // For internal page steps, check acknowledgements
    if (step.step_type === 'internal_page' && step.target_page_id) {
      return acknowledgements.some(ack => ack.page_id === step.target_page_id);
    }
    // For other steps (including acknowledgement type), check completions
    return completions.some(c => c.step_id === step.id);
  };

  // Group steps by stage
  const stepsByStage = steps.reduce((acc, step) => {
    const stageKey = step.stage || 'Getting Started';
    if (!acc[stageKey]) acc[stageKey] = [];
    acc[stageKey].push(step);
    return acc;
  }, {} as Record<string, OnboardingStep[]>);

  const stageOrder = Object.keys(stepsByStage);

  const handleCompleteStep = async (step: OnboardingStep) => {
    if (!user) return;

    // For internal page steps, navigate to the page
    if (step.step_type === 'internal_page' && step.target_page_id) {
      navigate(`/page/${step.target_page_id}`);
      return;
    }

    // For external link steps, open the link
    if (step.step_type === 'external_link' && step.external_url) {
      window.open(step.external_url, '_blank');
    }

    // Mark the step as complete
    setCompleting(step.id);
    try {
      const { error } = await supabase
        .from('onboarding_completions')
        .insert({
          step_id: step.id,
          user_id: user.id,
        });

      if (error) {
        // If it's a duplicate error, that's fine - step is already complete
        if (!error.message.includes('duplicate')) {
          throw error;
        }
      }

      toast({ title: "Step marked as complete" });
      fetchData();
    } catch (error) {
      console.error('Error completing step:', error);
      toast({
        title: "Error",
        description: "Failed to mark step as complete",
        variant: "destructive",
      });
    } finally {
      setCompleting(null);
    }
  };

  const completedCount = steps.filter(s => isStepCompleted(s)).length;
  const progressPercent = steps.length > 0 ? Math.round((completedCount / steps.length) * 100) : 0;

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading your onboarding progress...</div>;
  }

  if (steps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No onboarding steps have been configured yet.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Progress Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            Your Onboarding Progress
          </CardTitle>
          <CardDescription>
            Complete all steps below to finish your onboarding
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>{completedCount} of {steps.length} steps completed</span>
              <span className="font-medium">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-3" />
          </div>
        </CardContent>
      </Card>

      {/* Steps List grouped by Stage */}
      <Accordion type="multiple" defaultValue={stageOrder} className="space-y-4">
        {stageOrder.map((stageName, stageIndex) => {
          const stageSteps = stepsByStage[stageName];
          const stageCompletedCount = stageSteps.filter(s => isStepCompleted(s)).length;
          const stageComplete = stageCompletedCount === stageSteps.length;
          
          return (
            <AccordionItem key={stageName} value={stageName} className="border rounded-lg">
              <AccordionTrigger className="px-4 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    stageComplete 
                      ? 'bg-green-100 dark:bg-green-900/50 text-green-600 dark:text-green-400' 
                      : 'bg-primary/10 text-primary'
                  }`}>
                    {stageComplete ? <Check className="h-4 w-4" /> : stageIndex + 1}
                  </div>
                  <h2 className="text-xl font-semibold">{stageName}</h2>
                  <span className="text-sm text-muted-foreground">
                    ({stageCompletedCount}/{stageSteps.length} complete)
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 pb-4">
                {/* Stage Steps */}
                <div className="space-y-3 ml-4 border-l-2 border-border pl-6">
                  {stageSteps.map((step, index) => {
                    const completed = isStepCompleted(step);
                    
                    return (
                      <Card 
                        key={step.id} 
                        className={`transition-all ${completed ? 'border-green-200 dark:border-green-900 bg-green-50/50 dark:bg-green-950/20' : ''}`}
                      >
                        <CardContent className="p-6">
                          <div className="flex gap-4">
                            {/* Step number / status */}
                            <div className="flex-shrink-0">
                              {completed ? (
                                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                                  <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                                </div>
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                                  <span className="text-lg font-bold text-primary">{index + 1}</span>
                                </div>
                              )}
                            </div>

                            {/* Step content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                  <h3 className={`font-semibold text-lg ${completed ? 'text-green-700 dark:text-green-400' : ''}`}>
                                    {step.title}
                                  </h3>
                                  
                                  {step.description && (
                                    <div className="text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {renderDescriptionWithLinks(step.description)}
                                    </div>
                                  )}

                                  {/* Step type indicator */}
                                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                    {step.step_type === 'internal_page' && (
                                      <>
                                        <FileText className="h-4 w-4" />
                                        <span>Academy Page - requires acknowledgement</span>
                                      </>
                                    )}
                                    {step.step_type === 'external_link' && (
                                      <>
                                        <ExternalLink className="h-4 w-4" />
                                        <span>External Resource</span>
                                      </>
                                    )}
                                    {step.step_type === 'task' && (
                                      <>
                                        <Check className="h-4 w-4" />
                                        <span>Task to complete</span>
                                      </>
                                    )}
                                    {step.step_type === 'acknowledgement' && (
                                      <>
                                        <CheckCircle2 className="h-4 w-4" />
                                        <span>Please read and acknowledge</span>
                                      </>
                                    )}
                                  </div>

                                  {/* Owner details */}
                                  {step.owner && (
                                    <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                                      <div className="text-sm font-medium mb-2">Contact for this step:</div>
                                      <div className="flex flex-wrap gap-4 text-sm">
                                        <div className="flex items-center gap-2">
                                          <User className="h-4 w-4 text-muted-foreground" />
                                          <span className="font-medium">{step.owner.name}</span>
                                        </div>
                                        {step.owner.role && (
                                          <div className="flex items-center gap-2">
                                            <Briefcase className="h-4 w-4 text-muted-foreground" />
                                            <span>{step.owner.role}</span>
                                          </div>
                                        )}
                                        {step.owner.email && (
                                          <div className="flex items-center gap-2">
                                            <Mail className="h-4 w-4 text-muted-foreground" />
                                            <a 
                                              href={`mailto:${step.owner.email}`} 
                                              className="text-primary hover:underline"
                                            >
                                              {step.owner.email}
                                            </a>
                                          </div>
                                        )}
                                        {step.owner.phone && (
                                          <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <a 
                                              href={`tel:${step.owner.phone}`} 
                                              className="text-primary hover:underline"
                                            >
                                              {step.owner.phone}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                {/* Action button */}
                                <div className="flex-shrink-0">
                                  {completed ? (
                                    <div className="flex items-center gap-3">
                                      {/* Show "View Page" button for internal_page steps even when completed */}
                                      {step.step_type === 'internal_page' && step.target_page_id && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => navigate(`/page/${step.target_page_id}`)}
                                        >
                                          <FileText className="h-4 w-4 mr-2" />
                                          View Page
                                        </Button>
                                      )}
                                      <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                                        <CheckCircle2 className="h-5 w-5" />
                                        <span className="font-medium">Completed</span>
                                      </div>
                                    </div>
                                  ) : (
                                    <Button
                                      onClick={() => handleCompleteStep(step)}
                                      disabled={completing === step.id}
                                    >
                                      {completing === step.id ? (
                                        <Clock className="h-4 w-4 mr-2 animate-spin" />
                                      ) : step.step_type === 'internal_page' ? (
                                        <FileText className="h-4 w-4 mr-2" />
                                      ) : step.step_type === 'external_link' ? (
                                        <ExternalLink className="h-4 w-4 mr-2" />
                                      ) : (
                                        <Check className="h-4 w-4 mr-2" />
                                      )}
                                      {step.step_type === 'internal_page' 
                                        ? 'Go to Page' 
                                        : step.step_type === 'external_link'
                                          ? 'Open & Complete'
                                          : step.step_type === 'acknowledgement'
                                            ? 'I Acknowledge'
                                            : 'Mark Complete'}
                                    </Button>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Completion message */}
      {completedCount === steps.length && steps.length > 0 && (
        <Card className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950/30">
          <CardContent className="py-6 text-center">
            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto mb-3" />
            <h3 className="text-xl font-semibold text-green-700 dark:text-green-400">
              Congratulations!
            </h3>
            <p className="text-green-600 dark:text-green-500 mt-1">
              You have completed all onboarding steps.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
