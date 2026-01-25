import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LiveTimelineView } from "./hr/LiveTimelineView";
import { format, parseISO, startOfWeek, endOfWeek, startOfDay, endOfDay, isWithinInterval, getDay, differenceInWeeks, isBefore, isAfter } from "date-fns";
import { Clock } from "lucide-react";

interface Schedule {
  id: string;
  user_id: string;
  client_name: string;
  start_datetime: string;
  end_datetime: string;
  shift_type?: string | null;
}

interface StaffMember {
  user_id: string;
  display_name: string | null;
  email: string | null;
}

interface Holiday {
  id: string;
  user_id: string;
  start_date: string;
  end_date: string;
  status: string;
  absence_type?: string;
}

interface StaffRequest {
  id: string;
  user_id: string;
  request_type: string;
  swap_with_user_id: string | null;
  start_date: string;
  end_date: string;
  status: string;
  linked_holiday_id: string | null;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  start_date: string;
  end_date: string | null;
  recurrence_interval: string;
  shift_type: string | null;
}

interface PatternException {
  id: string;
  pattern_id: string;
  exception_date: string;
  exception_type: string;
}

export function DashboardLiveViewWrapper() {
  const today = new Date();
  const currentWeekStart = startOfWeek(today, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeekStart, { weekStartsOn: 1 });

  // Fetch clients
  const { data: clients = [] } = useQuery({
    queryKey: ["clients-for-dashboard-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data;
    }
  });

  // Fetch staff members
  const { data: staffMembers = [] } = useQuery({
    queryKey: ["staff-for-dashboard-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name");
      if (error) throw error;
      return data as StaffMember[];
    }
  });

  // Fetch schedules
  const { data: schedules = [] } = useQuery({
    queryKey: ["schedules-for-dashboard-live", currentWeekStart.toISOString()],
    queryFn: async () => {
      const startStr = format(currentWeekStart, "yyyy-MM-dd");
      const endStr = format(weekEnd, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("staff_schedules")
        .select("*")
        .gte("start_datetime", `${startStr}T00:00:00`)
        .lte("start_datetime", `${endStr}T23:59:59`);
      if (error) throw error;
      return data as Schedule[];
    }
  });

  // Fetch holidays
  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays-for-dashboard-live", currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_holidays")
        .select("id, user_id, start_date, end_date, status, absence_type")
        .or(`start_date.lte.${format(weekEnd, "yyyy-MM-dd")},end_date.gte.${format(currentWeekStart, "yyyy-MM-dd")}`)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return data as Holiday[];
    }
  });

  // Fetch staff requests
  const { data: staffRequests = [] } = useQuery({
    queryKey: ["staff-requests-for-dashboard-live", currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_requests")
        .select("*")
        .or(`start_date.lte.${format(weekEnd, "yyyy-MM-dd")},end_date.gte.${format(currentWeekStart, "yyyy-MM-dd")}`)
        .in("status", ["approved", "pending"]);
      if (error) throw error;
      return data as StaffRequest[];
    }
  });

  // Fetch recurring patterns
  const { data: recurringPatterns = [] } = useQuery({
    queryKey: ["patterns-for-dashboard-live"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as RecurringPattern[];
    }
  });

  // Fetch pattern exceptions
  const { data: patternExceptions = [] } = useQuery({
    queryKey: ["pattern-exceptions-for-dashboard-live", currentWeekStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("*")
        .gte("exception_date", format(currentWeekStart, "yyyy-MM-dd"))
        .lte("exception_date", format(weekEnd, "yyyy-MM-dd"));
      if (error) throw error;
      return data as PatternException[];
    }
  });

  // Generate week days
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [currentWeekStart]);

  // Generate virtual schedules from recurring patterns
  const virtualSchedulesFromPatterns = useMemo(() => {
    const virtualSchedules: Schedule[] = [];
    const exceptionsByPattern = new Map<string, Set<string>>();

    patternExceptions.forEach(exc => {
      if (!exceptionsByPattern.has(exc.pattern_id)) {
        exceptionsByPattern.set(exc.pattern_id, new Set());
      }
      exceptionsByPattern.get(exc.pattern_id)!.add(exc.exception_date);
    });

    for (const pattern of recurringPatterns) {
      const patternStart = parseISO(pattern.start_date);
      const patternEnd = pattern.end_date ? parseISO(pattern.end_date) : null;
      const exceptions = exceptionsByPattern.get(pattern.id) || new Set();

      for (const day of weekDays) {
        const dayOfWeek = getDay(day);
        const dateStr = format(day, "yyyy-MM-dd");

        // Skip if day is before pattern start or after pattern end
        if (isBefore(day, patternStart)) continue;
        if (patternEnd && isAfter(day, patternEnd)) continue;

        // Skip if there's an exception for this date
        if (exceptions.has(dateStr)) continue;

        // Check if pattern applies to this day of week
        if (!pattern.days_of_week.includes(dayOfWeek)) continue;

        // Check recurrence interval
        if (pattern.recurrence_interval === 'biweekly') {
          const weeksDiff = differenceInWeeks(
            startOfWeek(day, { weekStartsOn: 1 }),
            startOfWeek(patternStart, { weekStartsOn: 1 })
          );
          if (weeksDiff % 2 !== 0) continue;
        } else if (pattern.recurrence_interval === 'monthly') {
          const patternStartDayOfMonth = patternStart.getDate();
          if (day.getDate() !== patternStartDayOfMonth) continue;
        }

        virtualSchedules.push({
          id: `pattern-${pattern.id}-${dateStr}`,
          user_id: pattern.user_id,
          client_name: pattern.client_name,
          start_datetime: `${dateStr}T${pattern.start_time}`,
          end_datetime: `${dateStr}T${pattern.end_time}`,
          shift_type: pattern.shift_type,
        });
      }
    }

    return virtualSchedules;
  }, [recurringPatterns, patternExceptions, weekDays]);

  // Combine all schedules
  const allSchedules = useMemo(() => {
    const realScheduleKeys = new Set(
      schedules.map(s => `${s.user_id}-${format(parseISO(s.start_datetime), "yyyy-MM-dd-HH:mm")}`)
    );

    const uniqueVirtual = virtualSchedulesFromPatterns.filter(vs => {
      const key = `${vs.user_id}-${format(parseISO(vs.start_datetime), "yyyy-MM-dd-HH:mm")}`;
      return !realScheduleKeys.has(key);
    });

    return [...schedules, ...uniqueVirtual];
  }, [schedules, virtualSchedulesFromPatterns]);

  // Helper functions
  const getStaffName = (userId: string): string => {
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email || "Unknown";
  };

  const isStaffOnHoliday = (userId: string, date: Date): boolean => {
    return holidays.some(h => {
      if (h.user_id !== userId) return false;
      if (!["approved", "pending"].includes(h.status)) return false;
      const start = startOfDay(parseISO(h.start_date));
      const end = endOfDay(parseISO(h.end_date));
      return isWithinInterval(date, { start, end });
    });
  };

  const filteredClients = clients.map(c => c.name);

  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Clock className="h-5 w-5 text-primary" />
          Live View - Today's Schedule
        </CardTitle>
      </CardHeader>
      <CardContent>
        <LiveTimelineView
          viewMode="client"
          filteredStaff={staffMembers}
          filteredClients={filteredClients}
          allSchedules={allSchedules}
          isStaffOnHoliday={isStaffOnHoliday}
          getStaffName={getStaffName}
          holidays={holidays}
          staffRequests={staffRequests}
          recurringPatterns={recurringPatterns}
        />
      </CardContent>
    </Card>
  );
}
