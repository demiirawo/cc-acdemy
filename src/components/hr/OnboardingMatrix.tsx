import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Check, Clock } from "lucide-react";

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
  sort_order: number;
  step_type: string;
  target_page_id: string | null;
  owner_id: string | null;
  stage: string;
  owner?: OnboardingOwner | null;
}

type EmploymentStatus = 'onboarding_probation' | 'onboarding_passed' | 'active' | 'inactive_left' | 'inactive_fired';

interface HRProfile {
  user_id: string;
  employment_status: EmploymentStatus;
}

interface StaffMember {
  user_id: string;
  display_name: string;
}

interface Completion {
  step_id: string;
  user_id: string;
  completed_at: string;
}

interface PageAcknowledgement {
  page_id: string;
  user_id: string;
  acknowledged_at: string;
}

// Define the correct stage order (matching OnboardingStepsManager)
const STAGE_ORDER = [
  "Getting Started",
  "System & Tools",
  "Company Policies",
  "Training",
  "Final Checks"
];

// Only show staff in onboarding statuses
const ONBOARDING_STATUSES: EmploymentStatus[] = ['onboarding_probation', 'onboarding_passed'];

export function OnboardingMatrix() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [hrProfiles, setHRProfiles] = useState<HRProfile[]>([]);
  const [completions, setCompletions] = useState<Completion[]>([]);
  const [acknowledgements, setAcknowledgements] = useState<PageAcknowledgement[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch active onboarding steps
      const { data: stepsData, error: stepsError } = await supabase
        .from('onboarding_steps')
        .select(`
          id, title, sort_order, step_type, target_page_id, owner_id, stage,
          owner:onboarding_owners(id, name, role, email, phone)
        `)
        .order('sort_order', { ascending: true });

      if (stepsError) throw stepsError;

      // Fetch HR profiles to check employment status
      const { data: hrData, error: hrError } = await supabase
        .from('hr_profiles')
        .select('user_id, employment_status');

      if (hrError) throw hrError;
      setHRProfiles(hrData || []);

      // Get user IDs who are in onboarding statuses
      const onboardingUserIds = (hrData || [])
        .filter(hr => ONBOARDING_STATUSES.includes(hr.employment_status))
        .map(hr => hr.user_id);

      // Fetch staff members who are in onboarding
      const { data: staffData, error: staffError } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', onboardingUserIds.length > 0 ? onboardingUserIds : ['no-match'])
        .order('display_name');

      if (staffError) throw staffError;

      // Fetch all completions
      const { data: completionsData, error: completionsError } = await supabase
        .from('onboarding_completions')
        .select('step_id, user_id, completed_at');

      if (completionsError) throw completionsError;

      // Fetch page acknowledgements for internal page steps
      const internalPageIds = (stepsData || [])
        .filter(s => s.step_type === 'internal_page' && s.target_page_id)
        .map(s => s.target_page_id);

      let ackData: PageAcknowledgement[] = [];
      if (internalPageIds.length > 0) {
        const { data, error: ackError } = await supabase
          .from('page_acknowledgements')
          .select('page_id, user_id, acknowledged_at')
          .in('page_id', internalPageIds);

        if (ackError) throw ackError;
        ackData = data || [];
      }

      setSteps(stepsData || []);
      setStaff(staffData || []);
      setCompletions(completionsData || []);
      setAcknowledgements(ackData);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load onboarding matrix",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isStepCompleted = (stepId: string, userId: string, step: OnboardingStep): boolean => {
    // For internal page steps, check acknowledgements
    if (step.step_type === 'internal_page' && step.target_page_id) {
      return acknowledgements.some(
        ack => ack.page_id === step.target_page_id && ack.user_id === userId
      );
    }
    // For other steps, check completions
    return completions.some(
      c => c.step_id === stepId && c.user_id === userId
    );
  };

  const getCompletionStats = (userId: string): { completed: number; total: number } => {
    let completed = 0;
    steps.forEach(step => {
      if (isStepCompleted(step.id, userId, step)) {
        completed++;
      }
    });
    return { completed, total: steps.length };
  };

  // Group steps by stage
  const stepsByStage = steps.reduce((acc, step) => {
    const stageKey = step.stage || 'Getting Started';
    if (!acc[stageKey]) acc[stageKey] = [];
    acc[stageKey].push(step);
    return acc;
  }, {} as Record<string, OnboardingStep[]>);

  // Use predefined order, only including stages that have steps
  const orderedStages = STAGE_ORDER.filter(stage => stepsByStage[stage] && stepsByStage[stage].length > 0);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (steps.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No onboarding steps configured yet. Admins can add steps in the "Configure Steps" tab.
        </CardContent>
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No staff members currently in onboarding. Only staff with "Onboarding - On Probation" or "Onboarding - Passed Probation" status appear here.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Staff Onboarding Progress</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="w-full">
          <div className="min-w-max">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-background z-10 p-3 text-left font-medium border-b border-r min-w-[250px]">
                    Onboarding Step
                  </th>
                  {staff.map((member) => (
                    <th
                      key={member.user_id}
                      className="p-3 text-center font-medium border-b min-w-[100px]"
                      title={member.display_name || 'Unknown'}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-xs text-muted-foreground truncate max-w-[90px]">
                          {member.display_name || 'Unknown'}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orderedStages.map((stageName) => (
                  <>
                    {/* Stage header row */}
                    <tr key={`stage-${stageName}`} className="bg-muted/50">
                      <td 
                        colSpan={staff.length + 1} 
                        className="sticky left-0 p-2 font-semibold text-sm text-primary border-b"
                      >
                        {stageName}
                      </td>
                    </tr>
                    {/* Steps within this stage */}
                    {stepsByStage[stageName].map((step, stepIndex) => (
                      <tr key={step.id} className="hover:bg-muted/30">
                        <td className="sticky left-0 bg-background z-10 p-3 border-b border-r">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-muted-foreground w-6">
                              {stepIndex + 1}.
                            </span>
                            <span className="text-sm">{step.title}</span>
                          </div>
                        </td>
                        {staff.map((member) => {
                          const completed = isStepCompleted(step.id, member.user_id, step);
                          return (
                            <td key={member.user_id} className="p-3 text-center border-b">
                              {completed ? (
                                <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-green-100 dark:bg-green-900/30">
                                  <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                                </div>
                              ) : (
                                <div className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-muted">
                                  <Clock className="h-3 w-3 text-muted-foreground" />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                ))}
                {/* Progress summary row */}
                <tr className="bg-muted/30 font-medium">
                  <td className="sticky left-0 bg-background z-10 p-3 border-t-2 border-r font-semibold">
                    Total Progress
                  </td>
                  {staff.map((member) => {
                    const stats = getCompletionStats(member.user_id);
                    const progressPercent = steps.length > 0 
                      ? Math.round((stats.completed / stats.total) * 100) 
                      : 0;

                    return (
                      <td key={member.user_id} className="p-3 text-center border-t-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-12 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary rounded-full transition-all"
                              style={{ width: `${progressPercent}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {stats.completed}/{stats.total}
                          </span>
                        </div>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
