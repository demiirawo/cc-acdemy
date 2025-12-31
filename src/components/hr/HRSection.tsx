import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { StaffHolidaysManager } from "./StaffHolidaysManager";
import { StaffPayManager } from "./StaffPayManager";
import { HRProfileManager } from "./HRProfileManager";
import { MyHRProfile } from "./MyHRProfile";
import { StaffScheduleManager } from "./StaffScheduleManager";
import { Calendar, DollarSign, Users, User, CalendarClock } from "lucide-react";

export function HRSection() {
  const { isAdmin } = useUserRole();
  const [activeTab, setActiveTab] = useState(isAdmin ? "profiles" : "my-profile");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">HR Management</h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Manage staff holidays, pay, schedules and profiles" : "View your HR profile and records"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full ${isAdmin ? 'grid-cols-5' : 'grid-cols-1'} mb-6`}>
            {isAdmin && (
              <>
                <TabsTrigger value="profiles" className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Staff Profiles
                </TabsTrigger>
                <TabsTrigger value="schedule" className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4" />
                  Schedule
                </TabsTrigger>
                <TabsTrigger value="holidays" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4" />
                  Holidays/Absence
                </TabsTrigger>
                <TabsTrigger value="pay" className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pay Records
                </TabsTrigger>
              </>
            )}
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
              <TabsContent value="schedule" className="mt-0">
                <StaffScheduleManager />
              </TabsContent>
              <TabsContent value="holidays" className="mt-0">
                <StaffHolidaysManager />
              </TabsContent>
              <TabsContent value="pay" className="mt-0">
                <StaffPayManager />
              </TabsContent>
            </>
          )}
          
          <TabsContent value="my-profile" className="mt-0">
            <MyHRProfile />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
