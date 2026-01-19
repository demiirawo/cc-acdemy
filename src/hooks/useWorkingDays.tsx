import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface ShiftPattern {
  id: string;
  client_name: string;
  start_time: string;
  end_time: string;
  days_of_week: number[];
  start_date: string;
  end_date: string | null;
  recurrence_interval: string;
}

interface ShiftException {
  pattern_id: string;
  exception_date: string;
}

// Helper function to check if a date falls on an active recurrence week
const isDateOnRecurrenceSchedule = (
  currentDate: Date, 
  patternStartDate: string, 
  recurrenceInterval: string
): boolean => {
  if (recurrenceInterval === 'weekly') return true;
  
  const patternStart = new Date(patternStartDate);
  const diffTime = currentDate.getTime() - patternStart.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const diffWeeks = Math.floor(diffDays / 7);
  
  if (recurrenceInterval === 'biweekly') {
    return diffWeeks % 2 === 0;
  }
  
  if (recurrenceInterval === 'monthly') {
    return diffWeeks % 4 === 0;
  }
  
  return true;
};

// Calculate the number of unique working days for a date range based on shift patterns
export const calculateWorkingDays = (
  startDate: string,
  endDate: string,
  shiftPatterns: ShiftPattern[],
  shiftExceptions: ShiftException[]
): number => {
  if (shiftPatterns.length === 0) return 0;
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const workingDates = new Set<string>();
  
  // Create a set of exception keys for quick lookup
  const exceptionSet = new Set(
    shiftExceptions.map(exc => `${exc.pattern_id}:${exc.exception_date}`)
  );
  
  let currentDate = new Date(start);
  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    const currentDateStr = currentDate.toISOString().split('T')[0];
    
    for (const pattern of shiftPatterns) {
      const patternDays = pattern.days_of_week as number[];
      
      if (!patternDays.includes(dayOfWeek)) continue;
      if (currentDateStr < pattern.start_date) continue;
      if (pattern.end_date && currentDateStr > pattern.end_date) continue;
      if (!isDateOnRecurrenceSchedule(currentDate, pattern.start_date, pattern.recurrence_interval)) continue;
      if (exceptionSet.has(`${pattern.id}:${currentDateStr}`)) continue;
      
      // If we reach here, this is a working day
      workingDates.add(currentDateStr);
      break; // Only need to count the day once
    }
    
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return workingDates.size;
};

// Hook to get working days for a specific user and date range
export const useWorkingDays = (
  userId: string | undefined,
  startDate: string | undefined,
  endDate: string | undefined,
  enabled: boolean = true
) => {
  // Fetch shift patterns for the user
  const { data: shiftPatterns = [] } = useQuery({
    queryKey: ["user-shift-patterns", userId],
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("id, client_name, start_time, end_time, days_of_week, start_date, end_date, recurrence_interval")
        .eq("user_id", userId);
      if (error) throw error;
      return data as ShiftPattern[];
    },
    enabled: enabled && !!userId,
  });
  
  // Fetch exceptions for the patterns
  const { data: shiftExceptions = [] } = useQuery({
    queryKey: ["shift-exceptions-for-patterns", shiftPatterns.map(p => p.id)],
    queryFn: async () => {
      if (shiftPatterns.length === 0) return [];
      const patternIds = shiftPatterns.map(p => p.id);
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("pattern_id, exception_date")
        .in("pattern_id", patternIds);
      if (error) throw error;
      return data as ShiftException[];
    },
    enabled: enabled && shiftPatterns.length > 0,
  });
  
  if (!userId || !startDate || !endDate || shiftPatterns.length === 0) {
    return null; // Return null to indicate we can't calculate
  }
  
  return calculateWorkingDays(startDate, endDate, shiftPatterns, shiftExceptions);
};

// Batch hook to get working days for multiple requests
export const useBatchWorkingDays = (
  requests: Array<{ id: string; user_id: string; start_date: string; end_date: string }> | undefined,
  enabled: boolean = true
) => {
  // Get unique user IDs
  const userIds = [...new Set(requests?.map(r => r.user_id) || [])];
  
  // Fetch all shift patterns for all relevant users
  const { data: allShiftPatterns = [] } = useQuery({
    queryKey: ["batch-shift-patterns", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("id, user_id, client_name, start_time, end_time, days_of_week, start_date, end_date, recurrence_interval")
        .in("user_id", userIds);
      if (error) throw error;
      return data as (ShiftPattern & { user_id: string })[];
    },
    enabled: enabled && userIds.length > 0,
  });
  
  // Fetch all exceptions for all patterns
  const patternIds = allShiftPatterns.map(p => p.id);
  const { data: allExceptions = [] } = useQuery({
    queryKey: ["batch-shift-exceptions", patternIds],
    queryFn: async () => {
      if (patternIds.length === 0) return [];
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("pattern_id, exception_date")
        .in("pattern_id", patternIds);
      if (error) throw error;
      return data as ShiftException[];
    },
    enabled: enabled && patternIds.length > 0,
  });
  
  // Build a map of request ID to working days
  const workingDaysMap = new Map<string, number | null>();
  
  if (requests && allShiftPatterns.length > 0) {
    requests.forEach(request => {
      const userPatterns = allShiftPatterns.filter(p => p.user_id === request.user_id);
      if (userPatterns.length === 0) {
        workingDaysMap.set(request.id, null);
        return;
      }
      
      const patternIdsForUser = userPatterns.map(p => p.id);
      const userExceptions = allExceptions.filter(e => patternIdsForUser.includes(e.pattern_id));
      
      const workingDays = calculateWorkingDays(
        request.start_date,
        request.end_date,
        userPatterns,
        userExceptions
      );
      
      workingDaysMap.set(request.id, workingDays);
    });
  }
  
  return workingDaysMap;
};
