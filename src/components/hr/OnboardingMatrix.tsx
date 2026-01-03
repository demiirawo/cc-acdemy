import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Check, X, Clock } from "lucide-react";

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
  owner?: OnboardingOwner | null;
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

export function OnboardingMatrix() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
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
          id, title, sort_order, step_type, target_page_id, owner_id,
          owner:onboarding_owners(id, name, role, email, phone)
        `)
        .order('sort_order', { ascending: true });

      if (stepsError) throw stepsError;

      // Fetch all staff members (profiles)
      const { data: staffData, error: staffError } = await supabase
        .from('profiles')
        .select('user_id, display_name')
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
                  <th className="sticky left-0 bg-background z-10 p-3 text-left font-medium border-b border-r min-w-[200px]">
                    Staff Member
                  </th>
                  {steps.map((step, index) => (
                    <th
                      key={step.id}
                      className="p-3 text-center font-medium border-b min-w-[120px]"
                      title={step.title}
                    >
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-lg font-bold text-primary">{index + 1}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[100px]">
                          {step.title}
                        </span>
                      </div>
                    </th>
                  ))}
                  <th className="p-3 text-center font-medium border-b border-l min-w-[100px]">
                    Progress
                  </th>
                </tr>
              </thead>
              <tbody>
                {staff.map((member) => {
                  const stats = getCompletionStats(member.user_id);
                  const progressPercent = steps.length > 0 
                    ? Math.round((stats.completed / stats.total) * 100) 
                    : 0;

                  return (
                    <tr key={member.user_id} className="hover:bg-muted/50">
                      <td className="sticky left-0 bg-background z-10 p-3 border-b border-r font-medium">
                        {member.display_name || 'Unknown'}
                      </td>
                      {steps.map((step) => {
                        const completed = isStepCompleted(step.id, member.user_id, step);
                        return (
                          <td key={step.id} className="p-3 text-center border-b">
                            {completed ? (
                              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30">
                                <Check className="h-5 w-5 text-green-600 dark:text-green-400" />
                              </div>
                            ) : (
                              <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-muted">
                                <Clock className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-3 text-center border-b border-l">
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
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
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
