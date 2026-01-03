import { useState } from "react";
import { useUserRole } from "@/hooks/useUserRole";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OnboardingStepsManager } from "./OnboardingStepsManager";
import { OnboardingOwnersManager } from "./OnboardingOwnersManager";
import { OnboardingMatrix } from "./OnboardingMatrix";
import { Settings, Grid3X3, Users } from "lucide-react";

export function OnboardingManager() {
  const { isAdmin } = useUserRole();
  const [activeTab, setActiveTab] = useState("matrix");

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="matrix" className="flex items-center gap-2">
            <Grid3X3 className="h-4 w-4" />
            Onboarding Matrix
          </TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="steps" className="flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Configure Steps
              </TabsTrigger>
              <TabsTrigger value="owners" className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                Owner Configuration
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <OnboardingMatrix />
        </TabsContent>

        {isAdmin && (
          <>
            <TabsContent value="steps" className="mt-4">
              <OnboardingStepsManager />
            </TabsContent>
            <TabsContent value="owners" className="mt-4">
              <OnboardingOwnersManager />
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}
