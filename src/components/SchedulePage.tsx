import { StaffScheduleManager } from "./hr/StaffScheduleManager";

export function SchedulePage() {
  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground">Schedule</h1>
          <p className="text-muted-foreground mt-1">
            View and manage staff schedules
          </p>
        </div>
        <StaffScheduleManager />
      </div>
    </div>
  );
}
