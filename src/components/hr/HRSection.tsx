import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUserRole } from "@/hooks/useUserRole";
import { StaffPayManager } from "./StaffPayManager";
import { MyHRProfile } from "./MyHRProfile";
import { OnboardingManager } from "./OnboardingManager";
import { StaffOnboardingForm } from "./StaffOnboardingForm";
import { MyContracts } from "./contracts/MyContracts";
import { DollarSign, User, GraduationCap, FileText, FileSignature } from "lucide-react";

interface HRSectionProps {
  initialUserId?: string | null;
  onProfileClosed?: () => void;
}

const TAB_ALIASES: Record<string, string> = {
  payroll: "pay",
  pay: "pay",
  // Staffing Settings was merged into Staff Profile — old links land there.
  profiles: "my-profile",
  staff: "my-profile",
  onboarding: "onboarding",
  "onboarding-form": "onboarding-form",
  "my-profile": "my-profile",
  me: "my-profile",
  contracts: "contracts",
  "my-contracts": "my-contracts",
};

export function HRSection({ initialUserId }: HRSectionProps = {}) {
  const { isAdmin } = useUserRole();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const initialTab =
    (tabParam && TAB_ALIASES[tabParam.toLowerCase()]) || "my-profile";

  const [activeTab, setActiveTab] = useState<string>(initialTab);

  // Deep links with a target user (e.g. schedule "View profile") land on the
  // Staff Profile tab, which preselects that user.
  useEffect(() => {
    if (initialUserId && isAdmin) {
      setActiveTab("my-profile");
    }
  }, [initialUserId, isAdmin]);

  // React to ?tab= param changes
  useEffect(() => {
    if (tabParam) {
      const mapped = TAB_ALIASES[tabParam.toLowerCase()];
      if (mapped) setActiveTab(mapped);
    }
  }, [tabParam]);

  const handleTabChange = (next: string) => {
    setActiveTab(next);
    const params = new URLSearchParams(searchParams);
    params.set("tab", next === "pay" ? "payroll" : next);
    setSearchParams(params, { replace: true });
  };

  const adminTabs = [
    { value: "pay", label: "Payroll", icon: DollarSign },
    { value: "my-profile", label: "Staff Profile", icon: User },
  ];
  const staffTabs = [
    { value: "my-profile", label: "Staff Profile", icon: User },
    { value: "my-contracts", label: "My Contracts", icon: FileSignature },
    { value: "onboarding-form", label: "Onboarding Form", icon: FileText },
    { value: "onboarding", label: "Onboarding Steps", icon: GraduationCap },
  ];
  const tabs = isAdmin ? adminTabs : staffTabs;
  const activeMeta = tabs.find(t => t.value === activeTab) ?? tabs[0];
  const ActiveIcon = activeMeta.icon;

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6">
      <div className={`${activeTab === 'pay' ? 'w-full' : 'max-w-7xl mx-auto'}`}>
        <div className="mb-4 md:mb-6">
          <h1 className="text-2xl md:text-3xl font-bold text-foreground">HR Management</h1>
          <p className="text-sm md:text-base text-muted-foreground mt-1">
            {isAdmin ? "Manage staff pay and profiles" : "View your HR profile and onboarding"}
          </p>
          {isAdmin && activeTab !== 'pay' && (
            <a
              href="/view/hr?tab=payroll"
              onClick={(e) => { e.preventDefault(); handleTabChange('pay'); }}
              className="inline-flex md:hidden mt-3 items-center gap-2 text-sm font-medium text-primary underline-offset-2 underline"
            >
              <DollarSign className="h-4 w-4" /> Jump to Payroll
            </a>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          {/* Mobile: dropdown selector */}
          <div className="md:hidden mb-4">
            <Select value={activeTab} onValueChange={handleTabChange}>
              <SelectTrigger className="w-full h-11">
                <div className="flex items-center gap-2">
                  <ActiveIcon className="h-4 w-4" />
                  <SelectValue />
                </div>
              </SelectTrigger>
              <SelectContent>
                {tabs.map(t => {
                  const Icon = t.icon;
                  return (
                    <SelectItem key={t.value} value={t.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        {t.label}
                      </div>
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: classic tab grid */}
          <TabsList
            className="hidden md:grid w-full mb-6"
            style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}
          >
            {tabs.map(t => {
              const Icon = t.icon;
              return (
                <TabsTrigger key={t.value} value={t.value} className="flex items-center gap-2">
                  <Icon className="h-4 w-4" />
                  {t.label}
                </TabsTrigger>
              );
            })}
          </TabsList>

          {isAdmin && (
            <TabsContent value="pay" className="mt-0">
              <StaffPayManager />
            </TabsContent>
          )}

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

          <TabsContent value="my-profile" className="mt-0">
            <MyHRProfile initialUserId={initialUserId} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
