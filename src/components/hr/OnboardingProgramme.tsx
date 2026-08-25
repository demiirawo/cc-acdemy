import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Check, ExternalLink, FileText, User, Mail, Phone, Briefcase, CheckCircle2, ClipboardList, GraduationCap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { groupByStage, orderStages, isUnknownStage } from "@/lib/onboardingStages";
import { renderDescriptionWithLinks } from "./StaffOnboardingView";

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
  stage: string;
  voice_note_url: string | null;
  owner?: OnboardingOwner | null;
}

const STEP_TYPE: Record<string, { label: string; icon: typeof FileText }> = {
  internal_page: { label: "Academy page — requires acknowledgement", icon: FileText },
  external_link: { label: "External resource", icon: ExternalLink },
  task: { label: "Task to complete", icon: Check },
  acknowledgement: { label: "Read and acknowledge", icon: CheckCircle2 },
  training: { label: "Training", icon: GraduationCap },
};

/**
 * The onboarding programme itself, with nobody attached to it.
 *
 * Every other route into this content hangs off a person: you pick a colleague,
 * open their checklist, and read the steps through their progress. That is the
 * wrong shape for running an induction — the person being taken through it may
 * not have an account yet, and whoever is running it shouldn't have to borrow
 * somebody else's record to see what comes next.
 *
 * So this is the programme as a document: every stage, every step, in order,
 * with the page or link behind each one openable. No ticks, no progress, no
 * subject.
 */
export function OnboardingProgramme() {
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("onboarding_steps")
        .select(`
          id, title, description, sort_order, step_type, target_page_id, external_url, stage, voice_note_url,
          owner:onboarding_owners(id, name, role, email, phone)
        `)
        .order("sort_order", { ascending: true });

      if (error) {
        toast({ title: "Couldn't load the programme", description: error.message, variant: "destructive" });
      } else {
        setSteps((data as OnboardingStep[]) || []);
      }
      setLoading(false);
    })();
  }, [toast]);

  const stepsByStage = groupByStage(steps);
  const stages = orderStages(stepsByStage);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading the onboarding programme…</div>;
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
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Onboarding Programme
          </CardTitle>
          <CardDescription>
            Every step a new joiner works through, in order — {steps.length} steps across {stages.length} stages.
            Open any page or link to walk someone through it. Nobody's progress is shown here; to tick
            steps off, use <span className="font-medium">By Person</span>.
          </CardDescription>
        </CardHeader>
      </Card>

      <Accordion type="multiple" defaultValue={stages} className="space-y-4">
        {stages.map((stageName, stageIndex) => {
          const stageSteps = stepsByStage[stageName];
          return (
            <AccordionItem key={stageName} value={stageName} className="border rounded-lg">
              <AccordionTrigger className="px-6 hover:no-underline">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-semibold">
                    {stageIndex + 1}
                  </div>
                  <h2 className="text-xl font-semibold">{stageName}</h2>
                  <span className="text-sm text-muted-foreground">
                    ({stageSteps.length} {stageSteps.length === 1 ? "step" : "steps"})
                  </span>
                  {isUnknownStage(stageName) && (
                    <Badge variant="outline" className="text-[10px] border-amber-300 text-amber-600">
                      Unrecognised stage
                    </Badge>
                  )}
                </div>
              </AccordionTrigger>

              <AccordionContent className="px-6 pb-6">
                <div className="space-y-3 ml-4 border-l-2 border-border pl-6">
                  {stageSteps.map((step, index) => {
                    const type = STEP_TYPE[step.step_type];
                    const TypeIcon = type?.icon ?? Check;
                    return (
                      <Card key={step.id}>
                        <CardContent className="p-6">
                          <div className="flex gap-4">
                            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                              <span className="text-lg font-bold text-primary">{index + 1}</span>
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-4 flex-wrap">
                                <div className="flex-1 min-w-0">
                                  <h3 className="font-semibold text-lg">{step.title}</h3>

                                  {step.description && (
                                    <div className="text-muted-foreground mt-1 whitespace-pre-wrap">
                                      {renderDescriptionWithLinks(step.description)}
                                    </div>
                                  )}

                                  {step.voice_note_url && (
                                    <div className="mt-3 p-2 bg-muted/50 rounded-lg">
                                      <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                                        <FileText className="h-3 w-3" /> Voice note
                                      </div>
                                      <audio src={step.voice_note_url} controls className="w-full h-10" />
                                    </div>
                                  )}

                                  <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                                    <TypeIcon className="h-4 w-4" />
                                    <span>{type?.label ?? step.step_type}</span>
                                  </div>

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
                                            <a href={`mailto:${step.owner.email}`} className="text-primary hover:underline">
                                              {step.owner.email}
                                            </a>
                                          </div>
                                        )}
                                        {step.owner.phone && (
                                          <div className="flex items-center gap-2">
                                            <Phone className="h-4 w-4 text-muted-foreground" />
                                            <a href={`tel:${step.owner.phone}`} className="text-primary hover:underline">
                                              {step.owner.phone}
                                            </a>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>

                                <div className="flex-shrink-0 flex items-center gap-2">
                                  {step.step_type === "internal_page" && step.target_page_id && (
                                    <Button variant="outline" size="sm" onClick={() => navigate(`/page/${step.target_page_id}`)}>
                                      <FileText className="h-4 w-4 mr-2" />
                                      View page
                                    </Button>
                                  )}
                                  {step.step_type === "external_link" && step.external_url && (
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => window.open(step.external_url!, "_blank", "noopener,noreferrer")}
                                    >
                                      <ExternalLink className="h-4 w-4 mr-2" />
                                      Open link
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
    </div>
  );
}
