import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { StaffPayManager } from "./StaffPayManager";
import { HRProfileManager } from "./HRProfileManager";
import { MyHRProfile } from "./MyHRProfile";
import { StaffScheduleManager } from "./StaffScheduleManager";
import { StaffRequestForm } from "./StaffRequestForm";
import { StaffRequestsManager } from "./StaffRequestsManager";
import { OnboardingManager } from "./OnboardingManager";
import { CalendarClock, DollarSign, Users, User, Send, ClipboardList, GraduationCap } from "lucide-react";

export function HRSection() {
  const { isAdmin } = useUserRole();
  const [activeTab, setActiveTab] = useState(isAdmin ? "profiles" : "my-requests");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">HR Management</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Manage staff schedules, requests, pay and profiles" : "View your schedule, submit requests and view your HR profile"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full mb-6`} style={{ gridTemplateColumns: isAdmin ? 'repeat(7, 1fr)' : 'repeat(4, 1fr)' }}>
            {isAdmin && (
              <>
                <TabsTrigger value="profiles" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Staff Profiles
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4" />
              Schedule
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="requests" className="flex items-center gap-2">
                  <ClipboardList className="h-4 w-4" />
                  Requests
                </TabsTrigger>
                <TabsTrigger value="pay" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pay Records
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="onboarding" className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4" />
              Onboarding
            </TabsTrigger>
            <TabsTrigger value="my-requests" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              My Requests
            </TabsTrigger>
            <TabsTrigger value="my-profile" className="flex items-center gap-2">
              <User className="h-4 w-4" />
              My HR Profile
            </TabsTrigger>
          </TabsList>

          {isAdmin && (
            <>
              <TabsContent value="profiles" className="mt-0">
                <HRProfileManager />
              </TabsContent>
            </>
          )}
          
          <TabsContent value="schedule" className="mt-0">
            <StaffScheduleManager />
          </TabsContent>
          
          {isAdmin && (
            <>
              <TabsContent value="requests" className="mt-0">
                <StaffRequestsManager />
              </TabsContent>
              <TabsContent value="pay" className="mt-0">
                <StaffPayManager />
              </TabsContent>
            </>
          )}
          
          <TabsContent value="onboarding" className="mt-0">
            <OnboardingManager />
          </TabsContent>
          
          <TabsContent value="my-requests" className="mt-0">
            <StaffRequestForm />
          </TabsContent>
          
          <TabsContent value="my-profile" className="mt-0">
            <MyHRProfile />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
