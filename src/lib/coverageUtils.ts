import { QueryClient } from "@tanstack/react-query";
import { format, parseISO } from "date-fns";

type CoverageMetadataShift = {
  id?: string;
  date?: string;
  start_time: string;
  end_time: string;
  client_name?: string;
};

type ShiftMatchTarget = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  clientName?: string;
};

const PATTERN_SHIFT_DATE_REGEX = /(\d{4}-\d{2}-\d{2})$/;

function formatCoverageDate(date: Date | string): string {
  if (date instanceof Date) {
    return format(date, "yyyy-MM-dd");
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  const parsedDate = parseISO(date);
  if (!Number.isNaN(parsedDate.getTime())) {
    return format(parsedDate, "yyyy-MM-dd");
  }

  return String(date).split("T")[0];
}

function getCoverageShiftDate(shift: CoverageMetadataShift): string | undefined {
  if (shift.id) {
    const idDateMatch = shift.id.match(PATTERN_SHIFT_DATE_REGEX);
    if (idDateMatch) {
      return idDateMatch[1];
    }
  }

  if (!shift.date) {
    return undefined;
  }

  return formatCoverageDate(shift.date);
}

function clientsMatch(expectedClient?: string, actualClient?: string): boolean {
  if (!expectedClient || !actualClient) {
    return true;
  }

  return expectedClient.trim().toLowerCase() === actualClient.trim().toLowerCase();
}

function doesCoverageShiftMatch(metadataShift: CoverageMetadataShift, shift: ShiftMatchTarget): boolean {
  if (metadataShift.id && shift.id && metadataShift.id === shift.id) {
    return true;
  }

  const metadataDate = getCoverageShiftDate(metadataShift);
  if (!metadataDate || metadataDate !== shift.date) {
    return false;
  }

  return (
    normalizeTime(metadataShift.start_time) === normalizeTime(shift.startTime) &&
    normalizeTime(metadataShift.end_time) === normalizeTime(shift.endTime) &&
    clientsMatch(metadataShift.client_name, shift.clientName)
  );
}

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
      date: formatCoverageDate(s.date),
      start_time: s.startTime,
      end_time: s.endTime,
      client_name: s.clientName,
      is_pattern: s.isPattern,
    })),
    covered_dates: [...new Set(selectedShifts.map(s => 
      formatCoverageDate(s.date)
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

/**
 * Normalizes a time string to HH:mm format.
 * Handles "07:00", "07:00:00", "7:00", etc.
 */
export function normalizeTime(time: string): string {
  const parts = time.split(':');
  if (parts.length >= 2) {
    const h = parts[0].padStart(2, '0');
    const m = parts[1].padStart(2, '0');
    return `${h}:${m}`;
  }
  return time;
}

/**
 * Checks whether a specific shift (identified by date, start/end time, and optionally client)
 * is covered by a given shift_swap request, using coverage_metadata for precise matching.
 * 
 * Returns true if the shift is covered by this request.
 */
export function isShiftCoveredByRequest(
  request: {
    coverage_metadata?: Record<string, unknown> | null;
    start_date: string;
    end_date: string;
  },
  shift: {
    id?: string;
    date: string;       // yyyy-MM-dd
    startTime: string;  // HH:mm or HH:mm:ss
    endTime: string;    // HH:mm or HH:mm:ss
    clientName?: string;
  }
): boolean {
  const shiftDate = shift.date;
  const shiftStart = normalizeTime(shift.startTime);
  const shiftEnd = normalizeTime(shift.endTime);

  if (request.coverage_metadata && typeof request.coverage_metadata === 'object') {
    const meta = request.coverage_metadata as {
      type?: string;
      shifts?: CoverageMetadataShift[];
      covered_dates?: string[];
    };

    if (meta.type === 'individual_shifts' && meta.shifts && Array.isArray(meta.shifts)) {
      return meta.shifts.some(s =>
        doesCoverageShiftMatch(s, {
          id: shift.id,
          date: shiftDate,
          startTime: shiftStart,
          endTime: shiftEnd,
          clientName: shift.clientName,
        })
      );
    }

    if (meta.type === 'holiday_days' && meta.covered_dates && Array.isArray(meta.covered_dates)) {
      return meta.covered_dates.includes(shiftDate);
    }
  }

  // Legacy fallback: if no metadata, the request covers all shifts in the date range
  return shiftDate >= request.start_date && shiftDate <= request.end_date;
}

/**
 * Filters an array of schedule-like objects to only those covered by a request's metadata.
 * Works with any object that has start_datetime, end_datetime, and client_name.
 */
export function filterSchedulesByCoverageMetadata<T extends { start_datetime: string; end_datetime: string; client_name: string }>(
  schedules: T[],
  coverageMetadata: Record<string, unknown> | null | undefined,
  day: Date
): T[] {
  if (!coverageMetadata || typeof coverageMetadata !== 'object') return schedules;
  
  const dateStr = format(day, "yyyy-MM-dd");

  const meta = coverageMetadata as {
    type?: string;
    shifts?: CoverageMetadataShift[];
    covered_dates?: string[];
  };
  
  if (meta.type === 'individual_shifts' && meta.shifts && Array.isArray(meta.shifts)) {
    return schedules.filter(schedule => {
      return meta.shifts!.some(shift =>
        doesCoverageShiftMatch(shift, {
          id: 'id' in schedule ? String((schedule as T & { id?: string }).id ?? '') || undefined : undefined,
          date: dateStr,
          startTime: format(parseISO(schedule.start_datetime), "HH:mm"),
          endTime: format(parseISO(schedule.end_datetime), "HH:mm"),
          clientName: schedule.client_name,
        })
      );
    });
  }
  
  if (meta.type === 'holiday_days' && meta.covered_dates && Array.isArray(meta.covered_dates)) {
    if (!meta.covered_dates.includes(dateStr)) return [];
  }
  
  return schedules;
}
