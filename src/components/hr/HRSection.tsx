import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { MyHRProfile } from "./MyHRProfile";
import { OnboardingManager } from "./OnboardingManager";
import { StaffOnboardingForm } from "./StaffOnboardingForm";
import { MyContracts } from "./contracts/MyContracts";
import { TrainingMatrix } from "./training/TrainingMatrix";
import { IncidentsSection } from "../incidents/IncidentsSection";
import { StaffMeetingsSection } from "../meetings/StaffMeetingsSection";
import { SupervisionsSection } from "../supervisions/SupervisionsSection";
import { RecruitmentSection } from "../recruitment/RecruitmentSection";
import { InspectionsSection } from "../inspections/InspectionsSection";

interface HRSectionProps {
  initialUserId?: string | null;
  onProfileClosed?: () => void;
}

const TAB_ALIASES: Record<string, string> = {
  // Payroll now lives on its own page — send old links there.
  payroll: "payroll-redirect",
  pay: "payroll-redirect",
  profiles: "my-profile",
  staff: "my-profile",
  onboarding: "onboarding",
  "onboarding-form": "onboarding-form",
  "my-profile": "my-profile",
  me: "my-profile",
  contracts: "contracts",
  "my-contracts": "my-contracts",
  training: "training",
  "staff-meetings": "staff-meetings",
  incidents: "incidents",
  supervisions: "supervisions",
  recruitment: "recruitment",
  inspections: "inspections",
};

const NoPermission = () => (
  <div className="p-8 text-center text-muted-foreground">You do not have permission to view this page.</div>
);

export function HRSection({ initialUserId }: HRSectionProps = {}) {
  const { isAdmin, canManageHR, canManageTraining } = useUserRole();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const mappedInitial = tabParam ? TAB_ALIASES[tabParam.toLowerCase()] : undefined;
  const initialTab = (mappedInitial && mappedInitial !== "payroll-redirect") ? mappedInitial : "my-profile";

  const [activeTab, setActiveTab] = useState<string>(initialTab);
  // The staff member shown on the Staff Profile tab (admins can switch; deep
  // links + "view profile" jumps from other tabs preselect one).
  const [profileUserId, setProfileUserId] = useState<string | null>(initialUserId ?? null);

  // Deep links with a target user (e.g. schedule "View profile") land on the
  // Staff Profile tab, which preselects that user.
  useEffect(() => {
    if (initialUserId && canManageHR) {
      setProfileUserId(initialUserId);
      setActiveTab("my-profile");
    }
  }, [initialUserId, canManageHR]);

  // React to ?tab= param changes; old payroll links now redirect to its own page.
  useEffect(() => {
    if (tabParam) {
      const mapped = TAB_ALIASES[tabParam.toLowerCase()];
      if (mapped === "payroll-redirect") { navigate("/view/payroll", { replace: true }); return; }
      if (mapped) setActiveTab(mapped);
    }
  }, [tabParam, navigate]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next);
    setSearchParams(params, { replace: true });
  };

  // Jump to a staff member's profile from within the Incidents / Supervisions tabs.
  const goToProfile = (userId: string) => {
    setProfileUserId(userId);
    handleTabChange("my-profile");
  };

  const adminTabs = [
    { value: "my-profile", label: "Staff Profile" },
    { value: "training", label: "Training" },
    { value: "staff-meetings", label: "Staff Meetings" },
    { value: "incidents", label: "Incidents" },
    { value: "supervisions", label: "Supervisions" },
    { value: "recruitment", label: "Recruitment" },
    { value: "inspections", label: "Inspections" },
  ];
  const staffTabs = [
    { value: "my-profile", label: "Staff Profile" },
    { value: "my-contracts", label: "My Contracts" },
    { value: "onboarding-form", label: "Onboarding Form" },
    { value: "onboarding", label: "Onboarding Steps" },
    // Staff keep their existing incident access, now under HR.
    { value: "incidents", label: "Incidents" },
    // HR staff who aren't full admins keep the matrix.
    ...(canManageTraining ? [{ value: "training", label: "Training" }] : []),
  ];
  const tabs = canManageHR ? adminTabs : staffTabs;

  // Section tabs bring their own full-width layout + padding.
  const sectionBreakout = "-mx-4 md:-mx-6 -mb-4 md:-mb-6 mt-2";

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">HR Management</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            {canManageHR ? "Staff profiles, training, meetings, incidents, supervisions & recruitment" : "View your HR profile and onboarding"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Mobile: dropdown selector */}
          <div className="md:hidden mb-4">
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tabs.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: classic tab grid */}
          <TabsList
            className="hidden md:grid w-full mb-6"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
          >
            {tabs.map(t => (
              <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="my-profile" className="mt-0">
            <MyHRProfile initialUserId={profileUserId} />
          </TabsContent>

          {!isAdmin && (
            <TabsContent value="my-contracts" className="mt-0">
              <MyContracts />
            </TabsContent>
          )}

          <TabsContent value="onboarding" className="mt-0">
            <OnboardingManager />
          </TabsContent>

          <TabsContent value="onboarding-form" className="mt-0">
            <StaffOnboardingForm />
          </TabsContent>

          {/* ── Nested section tabs (full-width, own layout) ───────────── */}
          <TabsContent value="training" className={sectionBreakout}>
            {canManageTraining ? (
              <div className="p-4 md:p-6 space-y-4">
                <div>
                  <h2 className="text-xl font-bold">Training</h2>
                  <p className="text-muted-foreground">Staff training matrix</p>
                </div>
                <TrainingMatrix />
              </div>
            ) : <NoPermission />}
          </TabsContent>

          <TabsContent value="incidents" className={sectionBreakout}>
            <IncidentsSection onViewProfile={goToProfile} />
          </TabsContent>

          <TabsContent value="staff-meetings" className={sectionBreakout}>
            {canManageHR ? <StaffMeetingsSection /> : <NoPermission />}
          </TabsContent>

          <TabsContent value="supervisions" className={sectionBreakout}>
            {canManageHR ? <SupervisionsSection onViewProfile={goToProfile} /> : <NoPermission />}
          </TabsContent>

          <TabsContent value="recruitment" className={sectionBreakout}>
            {canManageHR ? <RecruitmentSection /> : <NoPermission />}
          </TabsContent>

          <TabsContent value="inspections" className={sectionBreakout}>
            {canManageHR ? <InspectionsSection /> : <NoPermission />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
