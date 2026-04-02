import { QueryClient } from "@tanstack/react-query";

/**
 * Invalidates all query keys related to shift coverage across the app.
 * Call this after any create/update/delete of staff_requests (especially shift_swap).
 */
export function invalidateAllCoverageQueries(queryClient: QueryClient) {
  // Staff request queries used across different components
  queryClient.invalidateQueries({ queryKey: ["my-staff-requests"] });
  queryClient.invalidateQueries({ queryKey: ["all-staff-requests"] });
  queryClient.invalidateQueries({ queryKey: ["staff-requests"] });
  queryClient.invalidateQueries({ queryKey: ["staff-requests-for-schedule"] });
  queryClient.invalidateQueries({ queryKey: ["public-staff-requests"] });
  queryClient.invalidateQueries({ queryKey: ["covering-staff"] });
  
  // Schedule queries that render coverage
  queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
  queryClient.invalidateQueries({ queryKey: ["staff-holidays"] });
  queryClient.invalidateQueries({ queryKey: ["staff-holidays-for-cover-status"] });
  queryClient.invalidateQueries({ queryKey: ["linked-holidays-for-requests"] });
  
  // Public/live view queries
  queryClient.invalidateQueries({ queryKey: ["schedules-for-dashboard-live"] });
  queryClient.invalidateQueries({ queryKey: ["holidays-for-dashboard-live"] });
  queryClient.invalidateQueries({ queryKey: ["staff-requests-for-dashboard-live"] });
  
  // Public client schedule queries
  queryClient.invalidateQueries({ queryKey: ["public-staff-holidays"] });
  queryClient.invalidateQueries({ queryKey: ["public-staff-requests"] });
}

/**
 * Builds structured coverage_metadata from selected shifts for a shift_swap request.
 */
export function buildCoverageMetadata(
  selectedShifts: { id: string; date: Date; startTime: string; endTime: string; clientName: string; isPattern: boolean }[],
  coveredDays?: string[]
): Record<string, unknown> {
  if (coveredDays && coveredDays.length > 0) {
    return {
      type: 'holiday_days',
      covered_dates: coveredDays.sort(),
    };
  }
  
  return {
    type: 'individual_shifts',
    shifts: selectedShifts.map(s => ({
      id: s.id,
      date: s.date instanceof Date ? s.date.toISOString().split('T')[0] : String(s.date),
      start_time: s.startTime,
      end_time: s.endTime,
      client_name: s.clientName,
      is_pattern: s.isPattern,
    })),
    covered_dates: [...new Set(selectedShifts.map(s => 
      s.date instanceof Date ? s.date.toISOString().split('T')[0] : String(s.date)
    ))].sort(),
  };
}

/**
 * Extracts covered dates from coverage_metadata or falls back to parsing details text.
 */
export function getCoveredDatesFromRequest(request: {
  coverage_metadata?: Record<string, unknown> | null;
  details?: string | null;
  start_date: string;
  end_date: string;
}): string[] {
  // Try structured metadata first
  if (request.coverage_metadata && typeof request.coverage_metadata === 'object') {
    const meta = request.coverage_metadata as { covered_dates?: string[] };
    if (meta.covered_dates && Array.isArray(meta.covered_dates)) {
      return meta.covered_dates;
    }
  }
  
  // Fall back to parsing details text
  if (request.details) {
    const shiftsMatch = request.details.match(/Shifts:\s*(.+)/s);
    if (shiftsMatch) {
      const dateMatches = shiftsMatch[1].match(/(\d{2}) (\w{3}) (\d{4})/g);
      if (dateMatches && dateMatches.length > 0) {
        return [...new Set(dateMatches)];
      }
    }
    
    const coveredDaysMatch = request.details.match(/Covered days:\s*(.+)/);
    if (coveredDaysMatch) {
      const dateMatches = coveredDaysMatch[1].match(/(\d{2}) (\w{3}) (\d{4})/g);
      if (dateMatches && dateMatches.length > 0) {
        return [...new Set(dateMatches)];
      }
    }
  }
  
  // Final fallback: return empty (caller should use date range)
  return [];
}
