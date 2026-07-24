import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OnboardingStepsManager } from "./OnboardingStepsManager";
import { OnboardingOwnersManager } from "./OnboardingOwnersManager";
import { OnboardingMatrix } from "./OnboardingMatrix";
import { StaffDocumentationMatrix } from "./StaffDocumentationMatrix";
import { StaffOnboardingView } from "./StaffOnboardingView";
import { Settings, Grid3X3, Users, ClipboardList, FileCheck } from "lucide-react";

export function OnboardingManager() {
  const { canManageHR } = useUserRole();
  // Default to a tab that's valid in the management view. Role resolves async,
  // so basing this on canManageHR at mount could leave it on a non-existent tab
  // (blank content) once the role loads in.
  const [activeTab, setActiveTab] = useState("matrix");

  // Staff without HR-management rights see their personal onboarding view.
  if (!canManageHR) {
    return <StaffOnboardingView />;
  }

  // Admins & HR managers see the full management interface
  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matrix" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Onboarding Matrix
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-2">
            <FileCheck className="h-4 w-4" />
            Documents
          </TabsTrigger>
          <TabsTrigger value="steps" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Configure Steps
          </TabsTrigger>
          <TabsTrigger value="owners" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Owner Configuration
          </TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <OnboardingMatrix />
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <StaffDocumentationMatrix />
        </TabsContent>

        <TabsContent value="steps" className="mt-4">
          <OnboardingStepsManager />
        </TabsContent>

        <TabsContent value="owners" className="mt-4">
          <OnboardingOwnersManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
