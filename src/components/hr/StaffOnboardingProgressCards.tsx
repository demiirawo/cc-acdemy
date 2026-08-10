import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Search, CheckCircle2, Users } from "lucide-react";
import { allTrainingUpToDate } from "@/lib/trainingStatus";
import { StaffOnboardingView } from "./StaffOnboardingView";

interface Person {
  user_id: string;
  display_name: string | null;
  employment_status: string | null;
  start_date: string | null;
}

interface Step {
  id: string;
  step_type: string;
  target_page_id: string | null;
  stage: string;
}

// Mirrors the stages the personal view renders, so the count on a card matches
// the count inside it. A step filed under an unrecognised stage is hidden there
// and must not inflate the total here.
const STAGE_ORDER = [
  "Getting Started",
  "System & Tools",
  "Company Policies",
  "Training",
  "Final Checks",
];

/** Statuses that mean someone is still working through onboarding. */
const IN_ONBOARDING = ["onboarding_probation", "onboarding_passed"];

function initials(name: string | null): string {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/);
  return (parts[0][0] + (parts[1]?.[0] ?? "")).toUpperCase();
}

/**
 * One expandable card per person, opening into the same checklist they see on
 * their own profile. The matrix answers "who is behind"; this answers "on what,
 * exactly" without a manager having to read across a wide grid.
 */
export function StaffOnboardingProgressCards() {
  const [people, setPeople] = useState<Person[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [completions, setCompletions] = useState<{ step_id: string; user_id: string }[]>([]);
  const [acks, setAcks] = useState<{ page_id: string; user_id: string }[]>([]);
  const [trainingItems, setTrainingItems] = useState<{ id: string; refresh_frequency_months: number | null }[]>([]);
  const [trainingRecords, setTrainingRecords] = useState<{ training_item_id: string; user_id: string; completed_date: string }[]>([]);
  const [search, setSearch] = useState("");
  const [showEveryone, setShowEveryone] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const [{ data: stepsData }, { data: hrData }, { data: profilesData }] = await Promise.all([
          supabase
            .from("onboarding_steps")
            .select("id, step_type, target_page_id, stage")
            .order("sort_order", { ascending: true }),
          supabase.from("hr_profiles").select("user_id, employment_status, start_date"),
          supabase.from("profiles").select("user_id, display_name").order("display_name"),
        ]);

        const statusByUser = new Map(
          (hrData ?? []).map((h) => [h.user_id, h])
        );
        // Anyone with an HR record, ordered so people still onboarding come
        // first — a finished colleague is still worth being able to look up.
        const merged: Person[] = (profilesData ?? [])
          .filter((p) => statusByUser.has(p.user_id))
          .map((p) => ({
            user_id: p.user_id,
            display_name: p.display_name,
            employment_status: statusByUser.get(p.user_id)?.employment_status ?? null,
            start_date: statusByUser.get(p.user_id)?.start_date ?? null,
          }));

        const internalPageIds = (stepsData ?? [])
          .filter((s) => s.step_type === "internal_page" && s.target_page_id)
          .map((s) => s.target_page_id as string);

        const [{ data: compData }, ackRes, { data: tItems }, { data: tRecords }] = await Promise.all([
          supabase.from("onboarding_completions").select("step_id, user_id"),
          internalPageIds.length
            ? supabase.from("page_acknowledgements").select("page_id, user_id").in("page_id", internalPageIds)
            : Promise.resolve({ data: [] as { page_id: string; user_id: string }[] }),
          supabase.from("training_items").select("id, refresh_frequency_months").eq("is_active", true),
          supabase.from("training_records").select("training_item_id, user_id, completed_date"),
        ]);

        setSteps(stepsData ?? []);
        setPeople(merged);
        setCompletions(compData ?? []);
        setAcks((ackRes.data ?? []) as { page_id: string; user_id: string }[]);
        setTrainingItems(tItems ?? []);
        setTrainingRecords(tRecords ?? []);
      } catch (err) {
        console.error("Error loading onboarding progress:", err);
        toast({
          title: "Error",
          description: "Failed to load onboarding progress",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const countableSteps = useMemo(
    () => steps.filter((s) => STAGE_ORDER.includes(s.stage || "Getting Started")),
    [steps]
  );

  const progressFor = (userId: string) => {
    if (countableSteps.length === 0) return { done: 0, total: 0, percent: 0 };
    const done = countableSteps.filter((step) => {
      // An explicit completion row always wins — including admin bulk-marks.
      if (completions.some((c) => c.step_id === step.id && c.user_id === userId)) return true;
      if (step.step_type === "training") {
        const dateByItem = new Map(
          trainingRecords.filter((r) => r.user_id === userId).map((r) => [r.training_item_id, r.completed_date])
        );
        return allTrainingUpToDate(trainingItems, dateByItem);
      }
      if (step.step_type === "internal_page" && step.target_page_id) {
        return acks.some((a) => a.page_id === step.target_page_id && a.user_id === userId);
      }
      return false;
    }).length;
    return { done, total: countableSteps.length, percent: Math.round((done / countableSteps.length) * 100) };
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => (showEveryone ? true : IN_ONBOARDING.includes(p.employment_status ?? "")))
      .filter((p) => !q || (p.display_name ?? "").toLowerCase().includes(q))
      .sort((a, b) => {
        const aOn = IN_ONBOARDING.includes(a.employment_status ?? "") ? 0 : 1;
        const bOn = IN_ONBOARDING.includes(b.employment_status ?? "") ? 0 : 1;
        if (aOn !== bOn) return aOn - bOn;
        return (a.display_name ?? "").localeCompare(b.display_name ?? "");
      });
  }, [people, search, showEveryone]);

  if (loading) {
    return <div className="text-center py-8 text-muted-foreground">Loading onboarding progress...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search staff by name"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowEveryone((v) => !v)}
          className="text-sm text-muted-foreground hover:text-foreground underline underline-offset-4 whitespace-nowrap"
        >
          {showEveryone ? "Show only people onboarding" : "Show all staff"}
        </button>
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
            {search
              ? "No one matches that name."
              : showEveryone
                ? "No staff records found."
                : "Nobody is currently going through onboarding."}
          </CardContent>
        </Card>
      ) : (
        <Accordion type="multiple" className="space-y-3">
          {visible.map((person) => {
            const { done, total, percent } = progressFor(person.user_id);
            const complete = total > 0 && done === total;
            const stillOnboarding = IN_ONBOARDING.includes(person.employment_status ?? "");

            return (
              <AccordionItem
                key={person.user_id}
                value={person.user_id}
                className="border rounded-lg bg-card"
              >
                <AccordionTrigger className="px-4 hover:no-underline">
                  <div className="flex items-center gap-4 flex-1 min-w-0 pr-4">
                    <Avatar className="h-10 w-10 flex-shrink-0">
                      <AvatarFallback>{initials(person.display_name)}</AvatarFallback>
                    </Avatar>

                    <div className="flex-1 min-w-0 text-left">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">
                          {person.display_name || "Unnamed"}
                        </span>
                        {!stillOnboarding && (
                          <Badge variant="outline" className="font-normal text-xs">
                            Not onboarding
                          </Badge>
                        )}
                        {complete && (
                          <Badge
                            variant="outline"
                            className="font-normal text-xs bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
                          >
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Complete
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1.5">
                        <Progress value={percent} className="h-2 flex-1 max-w-[240px]" />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {done} of {total} steps
                        </span>
                      </div>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="px-4 pb-4 pt-2 border-t">
                  {/* The person's own checklist, rendered read-only. Mounted only
                      once opened, so 30 staff don't each fire their own queries. */}
                  <StaffOnboardingView
                    userId={person.user_id}
                    personName={person.display_name ?? undefined}
                  />
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}
    </div>
  );
}
