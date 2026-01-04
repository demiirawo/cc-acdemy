import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserRole } from "@/hooks/useUserRole";
import { StaffScheduleManager } from "./hr/StaffScheduleManager";
import { StaffRequestForm } from "./hr/StaffRequestForm";
import { StaffRequestsManager } from "./hr/StaffRequestsManager";
import { Calendar, Send, ClipboardList } from "lucide-react";

export function SchedulePage() {
  const { isAdmin } = useUserRole();
  const [activeTab, setActiveTab] = useState("schedule");

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            View and manage staff schedules and requests
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full mb-6`} style={{ gridTemplateColumns: isAdmin ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)' }}>
            <TabsTrigger value="schedule" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Schedule
            </TabsTrigger>
            {isAdmin && (
              <TabsTrigger value="requests" className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Requests
              </TabsTrigger>
            )}
            <TabsTrigger value="my-requests" className="flex items-center gap-2">
              <Send className="h-4 w-4" />
              My Requests
            </TabsTrigger>
          </TabsList>

          <TabsContent value="schedule" className="mt-0">
            <StaffScheduleManager />
          </TabsContent>

          {isAdmin && (
            <TabsContent value="requests" className="mt-0">
              <StaffRequestsManager />
            </TabsContent>
          )}

          <TabsContent value="my-requests" className="mt-0">
            <StaffRequestForm />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}