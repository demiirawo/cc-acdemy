import { useState, useEffect } from "react";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format, parseISO, getDay, eachDayOfInterval, parse, subDays, addMonths } from "date-fns";
import { Trash2, Repeat, Calendar } from "lucide-react";
import type { Json } from "@/integrations/supabase/types";
import { useUserRole } from "@/hooks/useUserRole";
import { ukToday, seriesHasStarted, seriesChanges, changesOnlyPay, defaultApplyFrom, type SeriesFields } from "@/lib/shiftSeriesSplit";

/**
 * Imported for use here and re-exported so the editor's existing importers keep
 * working; the definition, the label and the styling live in
 * @/lib/placeholderShift because five views render shifts and they must agree
 * on what a placeholder looks like.
 *
 * The import is load-bearing: `export { X } from "..."` re-exports without
 * binding X locally, so the re-export alone left every use in this file
 * referring to nothing.
 */
import { PLACEHOLDER, PLACEHOLDER_LABEL, isPlaceholderShift } from "@/lib/placeholderShift";
export { PLACEHOLDER };

interface StaffMember {
  user_id: string;
  display_name: string;
  email: string;
}

interface Client {
  id: string;
  name: string;
}

interface RecurringPattern {
  id: string;
  user_id: string;
  client_name: string;
  days_of_week: number[];
  start_time: string;
  end_time: string;
  hourly_rate: number | null;
  currency: string;
  is_overtime: boolean;
  overtime_subtype: string | null;
  notes: string | null;
  start_date: string;
  end_date: string | null;
  recurrence_interval: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off';
  shift_type: string | null;
}

const SHIFT_TYPES = [
  "Call Monitoring",
  "Supervisions",
  "Floating Support",
  "General Admin",
  "Bench"
];

const DAYS_OF_WEEK = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export interface ShiftToEdit {
  // For pattern-based shifts
  patternId?: string;
  // For regular schedules
  scheduleId?: string;
  // Common info
  userId: string;
  clientName: string;
  date: Date;
  startTime: string;
  endTime: string;
  shiftType: string | null;
  notes: string | null;
  isOvertime: boolean;
  // Pattern-specific
  recurrenceInterval?: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off';
  daysOfWeek?: number[];
  startDate?: string;
  endDate?: string | null;
}

interface UnifiedShiftEditorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  shift: ShiftToEdit | null;
  staffMembers: StaffMember[];
  clients: Client[];
  onSuccess?: () => void;
}

export function UnifiedShiftEditor({
  open,
  onOpenChange,
  shift,
  staffMembers,
  clients,
  onSuccess
}: UnifiedShiftEditorProps) {
  const queryClient = useQueryClient();
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const { isAdmin } = useUserRole();
  // A series that has already started is changed from a date rather than
  // rewritten: the shifts before that date keep what they were worked as.
  // See @/lib/shiftSeriesSplit and edit_shift_series in the database.
  const today = ukToday();
  const [applyFrom, setApplyFrom] = useState("");
  const [applyFromTouched, setApplyFromTouched] = useState(false);
  const [correctPast, setCorrectPast] = useState(false);
  const [correctionReason, setCorrectionReason] = useState("");
  useEffect(() => {
    setApplyFrom("");
    setApplyFromTouched(false);
    setCorrectPast(false);
    setCorrectionReason("");
  }, [shift, open]);
  
  // Fetch the pattern if we have a patternId
  const { data: pattern } = useQuery({
    queryKey: ["recurring-pattern-single", shift?.patternId],
    queryFn: async () => {
      if (!shift?.patternId) return null;
      const { data, error } = await supabase
        .from("recurring_shift_patterns")
        .select("*")
        .eq("id", shift.patternId)
        .single();
      if (error) throw error;
      return data as RecurringPattern;
    },
    enabled: !!shift?.patternId && open
  });

  // Every row of the series, first row first. An edit from a date carries a
  // series on in a new row, so its first and last days, and whether it has
  // started, belong to the series rather than to the row this shift is on.
  const { data: lineage } = useQuery({
    queryKey: ["shift-series-lineage", shift?.patternId],
    queryFn: async () => {
      if (!shift?.patternId) return [];
      const { data, error } = await supabase.rpc("shift_series_lineage", { p_pattern_id: shift.patternId });
      if (error) throw error;
      return (data ?? []) as RecurringPattern[];
    },
    enabled: !!shift?.patternId && open
  });
  const seriesFirst = lineage && lineage.length > 0 ? lineage[0] : pattern ?? null;
  const seriesLast = lineage && lineage.length > 0 ? lineage[lineage.length - 1] : pattern ?? null;
  const multiRow = (lineage?.length ?? 0) > 1;

  // Fetch existing per-day overtime exception for the selected date
  const { data: dayException } = useQuery({
    queryKey: ["day-overtime-exception", shift?.patternId, shift?.date ? format(shift.date, "yyyy-MM-dd") : null],
    queryFn: async () => {
      if (!shift?.patternId) return null;
      const dateStr = format(shift.date, "yyyy-MM-dd");
      const { data, error } = await supabase
        .from("shift_pattern_exceptions")
        .select("id, exception_type, overtime_subtype")
        .eq("pattern_id", shift.patternId)
        .eq("exception_date", dateStr)
        .in("exception_type", ["overtime", "not_overtime"])
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!shift?.patternId && !!shift?.date && open
  });

  const [form, setForm] = useState({
    user_id: "",
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    selected_days: [] as number[],
    is_overtime: false,
    overtime_subtype: "" as string, // 'standard' | 'double_up' | ''
    notes: "",
    start_date: "",
    end_date: "",
    recurrence_interval: "weekly" as 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'one_off',
    shift_type: ""
  });

  // Update form when shift or pattern changes
  useEffect(() => {
    if (shift) {
      setForm({
        user_id: pattern?.user_id ?? shift.userId ?? PLACEHOLDER,
        client_name: pattern?.client_name || shift.clientName,
        start_time: pattern?.start_time || shift.startTime,
        end_time: pattern?.end_time || shift.endTime,
        selected_days: pattern?.days_of_week || shift.daysOfWeek || [],
        is_overtime: pattern?.is_overtime ?? shift.isOvertime,
        overtime_subtype: pattern?.overtime_subtype || "",
        notes: pattern?.notes || shift.notes || "",
        // The series' first and last days, which can be on other rows than this one.
        start_date: seriesFirst ? seriesFirst.start_date : (shift.startDate || format(shift.date, "yyyy-MM-dd")),
        end_date: seriesLast ? (seriesLast.end_date ?? "") : (shift.endDate || ""),
        recurrence_interval: pattern?.recurrence_interval || shift.recurrenceInterval || "weekly",
        shift_type: pattern?.shift_type || shift.shiftType || ""
      });
    }
  }, [shift, pattern, seriesFirst, seriesLast]);

  const getStaffName = (userId: string) => {
    if (isPlaceholderShift(userId)) return PLACEHOLDER_LABEL;
    const staff = staffMembers.find(s => s.user_id === userId);
    return staff?.display_name || staff?.email?.split('@')[0] || 'Unknown';
  };

  const toggleDay = (day: number) => {
    setForm(prev => ({
      ...prev,
      selected_days: prev.selected_days.includes(day)
        ? prev.selected_days.filter(d => d !== day)
        : [...prev.selected_days, day]
    }));
  };

  // What the edit changes, in the database's terms, and from when it applies.
  const openedDate = shift ? format(shift.date, "yyyy-MM-dd") : today;
  const seriesStart = seriesFirst?.start_date;
  const seriesEnd = seriesLast ? seriesLast.end_date : null;
  const seriesReady = !!pattern && !!lineage && lineage.length > 0;
  const started = seriesReady && !!seriesStart && seriesHasStarted(seriesStart, today);
  // A series that hasn't started and is still a single row is edited as it
  // stands, start date and all. Anything else goes through the database, which
  // keeps the shifts before the change as they were.
  const editAsItStands = seriesReady && !started && !multiRow;
  const formDays = (): number[] => {
    if (form.recurrence_interval === 'daily') return [0, 1, 2, 3, 4, 5, 6];
    if (form.recurrence_interval === 'one_off') {
      try {
        const startDate = parseISO(form.start_date);
        const endDate = form.end_date ? parseISO(form.end_date) : startDate;
        return [...new Set(eachDayOfInterval({ start: startDate, end: endDate }).map(day => getDay(day)))];
      } catch {
        return form.selected_days;
      }
    }
    return form.selected_days;
  };
  const seriesBefore: SeriesFields | null = pattern ? {
    user_id: pattern.user_id ?? null,
    client_name: pattern.client_name,
    days_of_week: pattern.days_of_week,
    start_time: pattern.start_time,
    end_time: pattern.end_time,
    is_overtime: pattern.is_overtime,
    overtime_subtype: pattern.is_overtime ? (pattern.overtime_subtype || 'standard') : null,
    notes: pattern.notes,
    recurrence_interval: pattern.recurrence_interval,
    shift_type: pattern.shift_type,
    end_date: seriesEnd,
  } : null;
  const seriesAfter: SeriesFields = {
    user_id: form.user_id === PLACEHOLDER ? null : (form.user_id || null),
    client_name: form.client_name,
    days_of_week: formDays(),
    start_time: form.start_time,
    end_time: form.end_time,
    is_overtime: form.is_overtime,
    overtime_subtype: form.is_overtime ? (form.overtime_subtype || 'standard') : null,
    notes: form.notes || null,
    recurrence_interval: form.recurrence_interval,
    shift_type: form.shift_type || null,
    end_date: form.end_date || null,
  };
  // Until the form has loaded the series there is nothing to compare.
  const formSynced = seriesReady && form.start_date === seriesStart;
  const changes = seriesBefore && formSynced ? seriesChanges(seriesBefore, seriesAfter) : {};
  const changedKeys = Object.keys(changes);
  const yesterday = format(subDays(parseISO(today), 1), "yyyy-MM-dd");
  // The notes and the end date belong to the series as a whole. Everything else
  // is a term the shifts are worked on, and changes from a date.
  const termsChanged = changedKeys.some(k => k !== 'notes' && k !== 'end_date');
  // An end date that moves to, or from, a day before today takes shifts that
  // happened off the rota, or puts them back: an admin's correction.
  const endReachesBack = started && "end_date" in changes && (
    (seriesAfter.end_date !== null && seriesAfter.end_date < yesterday) ||
    (seriesEnd !== null && seriesEnd < yesterday)
  );
  const endCorrection = !termsChanged && endReachesBack;
  const payOnly = changesOnlyPay(changes);
  const needsApplyFrom = !editAsItStands && termsChanged;
  const effectiveApplyFrom = applyFromTouched && applyFrom ? applyFrom : defaultApplyFrom({ payOnly, openedDate, seriesStart, today });

  // How far back an admin's correction can reach: not into a month already paid.
  const { data: lastPaidMonth } = useQuery({
    queryKey: ["last-paid-month", pattern?.user_id],
    queryFn: async () => {
      if (!pattern?.user_id) return null;
      const { data, error } = await supabase
        .from("staff_pay_records")
        .select("pay_period_start")
        .eq("user_id", pattern.user_id)
        .eq("record_type", "salary")
        .order("pay_period_start", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data?.pay_period_start ?? null;
    },
    enabled: open && isAdmin && (correctPast || endCorrection) && !!pattern?.user_id,
  });
  const earliestCorrection = lastPaidMonth
    ? format(addMonths(parseISO(lastPaidMonth), 1), "yyyy-MM-dd")
    : (seriesStart ?? today);

  // Save a series. One that hasn't started, and is a single row, is edited as it
  // stands; otherwise the change is made from a date, so the shifts before it are
  // left as they were.
  const updatePatternMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!shift?.patternId) throw new Error("No pattern ID");

      // The one-day pay choice is written on Save rather than the moment it is
      // picked, so Cancel leaves it as it was.
      if (dayOverrideChanged) await writeDayOverride(dayOvertimeValue);

      // Until the series has loaded there's no telling whether it has started.
      if (!pattern || !seriesReady) throw new Error("The series is still loading. Try again in a moment.");
      if (editAsItStands) {
        if (form.start_date < today) {
          throw new Error("A series can't be moved to start before today.");
        }
        const { error } = await supabase
          .from("recurring_shift_patterns")
          .update({
            // Allocating a placeholder is an ordinary edit: same form, same field.
            user_id: form.user_id === PLACEHOLDER ? null : form.user_id,
            client_name: form.client_name,
            days_of_week: formDays(),
            start_time: form.start_time,
            end_time: form.end_time,
            is_overtime: form.is_overtime,
            overtime_subtype: form.is_overtime ? (form.overtime_subtype || 'standard') : null,
            notes: form.notes || null,
            start_date: form.start_date,
            end_date: form.end_date || null,
            recurrence_interval: form.recurrence_interval,
            shift_type: form.shift_type || null
          })
          .eq("id", shift.patternId);
        if (error) throw error;
        return "Shift pattern updated";
      }

      if (changedKeys.length === 0) {
        return dayOverrideChanged ? "Day overtime updated" : "No changes to save";
      }

      if (!termsChanged) {
        // The notes, or the end date: made to the series as a whole. The
        // database works out which days a new end date adds or removes.
        if (endCorrection && !isAdmin) throw new Error("Only an admin can change shifts that have already happened.");
        if (endCorrection && !correctionReason.trim()) throw new Error("Say why shifts that have already happened are being corrected.");
        const { data, error } = await supabase.rpc("edit_shift_series", {
          p_pattern_id: shift.patternId,
          p_from: today,
          p_changes: changes as unknown as Json,
          p_reason: endCorrection ? correctionReason.trim() : undefined,
          p_correct_past: endCorrection,
        });
        if (error) throw error;
        if ((data as { mode?: string } | null)?.mode === "deleted") return "Shift pattern deleted";
        if (!("end_date" in changes)) return "Notes updated";
        return seriesAfter.end_date
          ? `Series now ends on ${format(parseISO(seriesAfter.end_date), "EEEE d MMMM")}`
          : "Series no longer has an end date";
      }

      if (correctPast && !correctionReason.trim()) {
        throw new Error("Say why shifts that have already happened are being corrected.");
      }
      if (!correctPast && effectiveApplyFrom < today) {
        throw new Error("Changes can apply from today onwards.");
      }
      if (seriesAfter.end_date !== null && seriesAfter.end_date < effectiveApplyFrom) {
        throw new Error(`This series ends on ${format(parseISO(seriesAfter.end_date), "EEEE d MMMM")}, before the changes would apply. Pick an earlier date, or change the end date on its own first.`);
      }
      const { data, error } = await supabase.rpc("edit_shift_series", {
        p_pattern_id: shift.patternId,
        p_from: effectiveApplyFrom,
        p_changes: changes as unknown as Json,
        p_reason: correctPast ? correctionReason.trim() : undefined,
        p_correct_past: correctPast,
      });
      if (error) throw error;
      const result = data as { mode?: string; effective_from?: string | null } | null;
      if (!result?.effective_from) return "Shift pattern updated";
      return `Changes apply from ${format(parseISO(result.effective_from), "EEEE d MMMM")}; earlier shifts are unchanged`;
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["recurring-pattern-single"] });
      queryClient.invalidateQueries({ queryKey: ["shift-series-lineage"] });
      queryClient.invalidateQueries({ queryKey: ["shift-pattern-exceptions"] });
      queryClient.invalidateQueries({ queryKey: ["day-overtime-exception"] });
      onOpenChange(false);
      onSuccess?.();
      toast.success(message);
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  // Update regular schedule mutation
  const updateScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.scheduleId) throw new Error("No schedule ID");
      const scheduleDate = format(shift.date, "yyyy-MM-dd");

      const { error } = await supabase
        .from("staff_schedules")
        .update({
          client_name: form.client_name,
          start_datetime: `${scheduleDate}T${form.start_time}:00`,
          end_datetime: `${scheduleDate}T${form.end_time}:00`,
          notes: form.notes || null,
          shift_type: form.shift_type || null
        })
        .eq("id", shift.scheduleId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-schedules"] });
      onOpenChange(false);
      onSuccess?.();
      toast.success("Schedule updated");
    },
    onError: (error) => {
      toast.error("Failed to update: " + error.message);
    }
  });

  // "Entire pattern": no shift from today on. A series that has started keeps
  // the shifts that happened; one that hasn't goes altogether. The database ends
  // the series as a whole, whichever of its rows this shift is on.
  const deletePatternMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!shift?.patternId) throw new Error("No pattern ID");
      const { data, error } = await supabase.rpc("end_shift_series", { p_pattern_id: shift.patternId, p_from: today });
      if (error) throw error;
      const mode = (data as { mode?: string } | null)?.mode;
      if (mode === "unchanged") throw new Error("This series has already ended.");
      return mode === "deleted" ? "Shift pattern deleted" : "Series ended from today; earlier shifts stay on the record";
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success(message);
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    }
  });

  // Delete single shift from pattern (create exception)
  const createExceptionMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.patternId) throw new Error("No pattern ID");
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("shift_pattern_exceptions").insert({
        pattern_id: shift.patternId,
        exception_date: format(shift.date, "yyyy-MM-dd"),
        exception_type: 'deleted',
        created_by: userData.user?.id
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["shift-pattern-exceptions"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success("Shift removed from schedule");
    },
    onError: (error) => {
      toast.error("Failed to remove shift: " + error.message);
    }
  });

  // "This & future": from the shift opened, or from today if that one has
  // passed. A shift that happened stays on the record, and the series ends as a
  // whole, whichever of its rows this shift is on.
  const deleteFutureShiftsMutation = useMutation({
    mutationFn: async (): Promise<string> => {
      if (!shift?.patternId) throw new Error("No pattern ID");
      const from = openedDate > today ? openedDate : today;
      const { data, error } = await supabase.rpc("end_shift_series", { p_pattern_id: shift.patternId, p_from: from });
      if (error) throw error;
      const mode = (data as { mode?: string } | null)?.mode;
      if (mode === "unchanged") throw new Error("This series already ends before then.");
      if (mode === "deleted") return "Shift pattern deleted";
      return from === openedDate
        ? "This and all future shifts deleted"
        : "Shifts from today onwards deleted; earlier shifts stay on the record";
    },
    onSuccess: (message) => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success(message);
    },
    onError: (error) => {
      toast.error("Failed to delete future shifts: " + error.message);
    }
  });

  // Per-day overtime status state (derived from exception or pattern default)
  const getDayOvertimeValue = () => {
    if (dayException) {
      if (dayException.exception_type === 'overtime') return dayException.overtime_subtype || 'standard';
      if (dayException.exception_type === 'not_overtime') return 'none';
    }
    return 'inherit'; // No override — use series default
  };

  const [dayOvertimeValue, setDayOvertimeValue] = useState('inherit');
  
  // Sync day overtime value when exception data loads
  useEffect(() => {
    setDayOvertimeValue(getDayOvertimeValue());
  }, [dayException]);

  // The one-day pay choice for the opened shift, written on Save.
  const dayOverrideChanged = !!shift?.patternId && dayOvertimeValue !== getDayOvertimeValue();
  const writeDayOverride = async (value: string) => {
    if (!shift?.patternId) throw new Error("No pattern ID");
    const { data: userData } = await supabase.auth.getUser();
    const dateStr = format(shift.date, "yyyy-MM-dd");

    if (value === 'inherit') {
      // Remove any existing exception
      if (dayException?.id) {
        const { error } = await supabase
          .from("shift_pattern_exceptions")
          .delete()
          .eq("id", dayException.id);
        if (error) throw error;
      }
      return;
    }

    const newType = value === 'none' ? 'not_overtime' : 'overtime';
    const subtype = value === 'none' ? null : value;

    if (dayException?.id) {
      const { error } = await supabase
        .from("shift_pattern_exceptions")
        .update({
          exception_type: newType,
          overtime_subtype: subtype
        })
        .eq("id", dayException.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("shift_pattern_exceptions")
        .insert({
          pattern_id: shift.patternId,
          exception_date: dateStr,
          exception_type: newType,
          overtime_subtype: subtype,
          created_by: userData.user?.id
        });
      if (error) throw error;
    }
  };

  // Delete regular schedule mutation
  const deleteScheduleMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.scheduleId) throw new Error("No schedule ID");
      const { error } = await supabase
        .from("staff_schedules")
        .delete()
        .eq("id", shift.scheduleId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staff-schedules"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-schedules"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success("Schedule deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete: " + error.message);
    }
  });

  const handleSave = () => {
    if (shift?.patternId) {
      updatePatternMutation.mutate();
    } else if (shift?.scheduleId) {
      updateScheduleMutation.mutate();
    }
  };

  const handleDeleteConfirm = (deleteType: 'single' | 'future' | 'all') => {
    if (shift?.patternId) {
      if (deleteType === 'all') {
        deletePatternMutation.mutate();
      } else if (deleteType === 'future') {
        deleteFutureShiftsMutation.mutate();
      } else {
        createExceptionMutation.mutate();
      }
    } else if (shift?.scheduleId) {
      deleteScheduleMutation.mutate();
    }
  };

  const isPattern = !!shift?.patternId;
  const isPending = updatePatternMutation.isPending || updateScheduleMutation.isPending;
  const isDeletePending = deletePatternMutation.isPending || createExceptionMutation.isPending || deleteScheduleMutation.isPending || deleteFutureShiftsMutation.isPending;
  
  // Determine if days selector should show
  const showDaysSelector = isPattern && 
    form.recurrence_interval !== 'daily' && 
    form.recurrence_interval !== 'one_off';

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {isPattern ? (
                <>
                  <Repeat className="h-4 w-4" />
                  Edit Shift Pattern
                </>
              ) : (
                <>
                  <Calendar className="h-4 w-4" />
                  Edit Shift
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {isPattern
                ? started
                  ? "This series has already started. Changes apply from the date you choose below, so the shifts before it keep what they were worked as."
                  : "Modify this shift pattern. Changes will affect all future occurrences."
                : "Modify the details of this shift."}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Staff Member */}
            <div>
              <Label>Staff Member</Label>
              <Select value={form.user_id} onValueChange={v => setForm(p => ({ ...p, user_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {/* A shift is a commitment to the client; who covers it can be
                      decided later. Leaving it as a placeholder puts it on the
                      rota now and keeps the gap visible until somebody is named. */}
                  <SelectItem value={PLACEHOLDER}>Placeholder &mdash; decide later</SelectItem>
                  {staffMembers.map(staff => (
                    <SelectItem key={staff.user_id} value={staff.user_id}>
                      {staff.display_name || staff.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Client */}
            <div>
              <Label>Client</Label>
              <Select value={form.client_name} onValueChange={v => setForm(p => ({ ...p, client_name: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {clients.map(client => (
                    <SelectItem key={client.id} value={client.name}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Recurrence Pattern - only for pattern-based shifts */}
            {isPattern && (
              <div>
                <Label>Recurrence Pattern</Label>
                <Select 
                  value={form.recurrence_interval} 
                  onValueChange={v => setForm(p => ({ ...p, recurrence_interval: v as any }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background z-50">
                    <SelectItem value="one_off">One-off / Fixed dates</SelectItem>
                    <SelectItem value="daily">Every day</SelectItem>
                    <SelectItem value="weekly">Every week</SelectItem>
                    <SelectItem value="biweekly">Every other week</SelectItem>
                    <SelectItem value="monthly">Every month (same week)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {form.recurrence_interval === 'one_off' && 'The shift will only occur within the start/end date range'}
                  {form.recurrence_interval === 'daily' && 'The shift will repeat every single day'}
                  {form.recurrence_interval === 'weekly' && 'The shift will repeat on selected days every week'}
                  {form.recurrence_interval === 'biweekly' && 'The shift will repeat on selected days every other week'}
                  {form.recurrence_interval === 'monthly' && 'The shift will repeat on selected days in the same week of each month'}
                </p>
              </div>
            )}

            {/* Select Days - for recurring patterns */}
            {showDaysSelector && (
              <div>
                <Label>Select Days</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {DAYS_OF_WEEK.map(day => (
                    <Button
                      key={day.value}
                      type="button"
                      variant={form.selected_days.includes(day.value) ? "default" : "outline"}
                      size="sm"
                      onClick={() => toggleDay(day.value)}
                    >
                      {day.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            {/* Times */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Time</Label>
                <Input
                  type="time"
                  value={form.start_time}
                  onChange={e => setForm(p => ({ ...p, start_time: e.target.value }))}
                />
              </div>
              <div>
                <Label>End Time</Label>
                <Input
                  type="time"
                  value={form.end_time}
                  onChange={e => setForm(p => ({ ...p, end_time: e.target.value }))}
                />
              </div>
            </div>

            {/* Date Range - for pattern-based shifts */}
            {isPattern && (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    disabled={seriesReady && !editAsItStands}
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  />
                  {seriesReady && !editAsItStands && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {started ? "Already started, so it stays put" : "The series changes part-way through, so its start stays put"}
                    </p>
                  )}
                </div>
                <div>
                  <Label>End Date (optional)</Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(p => ({ ...p, end_date: e.target.value }))}
                  />
                  <p className="text-xs text-muted-foreground mt-1">Leave empty for indefinite</p>
                </div>
              </div>
            )}

            {/* From when a change to a series that has started applies */}
            {isPattern && (needsApplyFrom || endCorrection) && (
              <div className="rounded-md border border-amber-300 bg-amber-50/60 dark:border-amber-800 dark:bg-amber-950/20 p-3 space-y-2">
                {needsApplyFrom ? (
                  <>
                    <Label>Changes apply from</Label>
                    <Input
                      type="date"
                      value={effectiveApplyFrom}
                      min={correctPast ? earliestCorrection : today}
                      onChange={e => { setApplyFrom(e.target.value); setApplyFromTouched(true); }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {payOnly && !applyFromTouched
                        ? "A change to how these shifts are paid starts on the 2nd, after payroll, like any other pay change."
                        : "Shifts before this date keep what they were worked as."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm">
                    {isAdmin
                      ? "This end date changes shifts that have already happened, so it's a correction."
                      : "This end date changes shifts that have already happened, so only an admin can make it. A series can be ended from today onwards."}
                  </p>
                )}
                {isAdmin && (
                  <div className="space-y-2 pt-1">
                    {needsApplyFrom && (
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="correct-past-shifts"
                          checked={correctPast}
                          onCheckedChange={v => setCorrectPast(v === true)}
                        />
                        <Label htmlFor="correct-past-shifts" className="font-normal">Correct shifts that have already happened</Label>
                      </div>
                    )}
                    {(correctPast || endCorrection) && (
                      <>
                        <Textarea
                          value={correctionReason}
                          onChange={e => setCorrectionReason(e.target.value)}
                          placeholder="Why were these shifts recorded wrongly? Kept with the change."
                          rows={2}
                        />
                        <p className="text-xs text-muted-foreground">
                          Can reach back to {format(parseISO(earliestCorrection), "d MMMM yyyy")}
                          {lastPaidMonth ? `, as ${format(parseISO(lastPaidMonth), "MMMM")} is already paid` : ""}.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Overtime Status */}
            <div>
              <Label>Overtime Status</Label>
              <Select 
                value={(() => {
                  // Build a combined value: scope_type
                  if (!isPattern) {
                    // Non-pattern shifts: just the type
                    return form.is_overtime ? (form.overtime_subtype || 'standard') : 'none';
                  }
                  // Pattern shifts: check if there's a per-day override
                  if (dayOvertimeValue !== 'inherit') {
                    // Per-day override active
                    return `day_${dayOvertimeValue}`;
                  }
                  // Series default
                  return form.is_overtime ? `series_${form.overtime_subtype || 'standard'}` : 'series_none';
                })()}
                onValueChange={v => {
                  if (!isPattern) {
                    // Simple: just set the type
                    if (v === 'none') {
                      setForm(p => ({ ...p, is_overtime: false, overtime_subtype: '' }));
                    } else {
                      setForm(p => ({ ...p, is_overtime: true, overtime_subtype: v }));
                    }
                    return;
                  }
                  // Pattern: parse scope and type. Both are written on Save.
                  if (v.startsWith('series_')) {
                    const type = v.replace('series_', '');
                    // A series-wide choice replaces the day's own override.
                    setDayOvertimeValue('inherit');
                    if (type === 'none') {
                      setForm(p => ({ ...p, is_overtime: false, overtime_subtype: '' }));
                    } else {
                      setForm(p => ({ ...p, is_overtime: true, overtime_subtype: type }));
                    }
                  } else if (v.startsWith('day_')) {
                    setDayOvertimeValue(v.replace('day_', ''));
                  }
                }}
                disabled={updatePatternMutation.isPending}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select overtime status" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {isPattern ? (
                    <>
                      <SelectItem value="series_none" className="font-medium">Entire Series — Not Overtime</SelectItem>
                      <SelectItem value="series_standard">Entire Series — Overtime (Outside Normal Hours)</SelectItem>
                      <SelectItem value="series_double_up">Entire Series — Overtime (Inside Normal Hours)</SelectItem>
                      {/* Series only. A single day cannot be made a bonus shift:
                          it would have no series to be pro-rated against. */}
                      <SelectItem value="series_bonus">Entire Series — Bonus shift</SelectItem>
                      <SelectItem value="day_none" className="font-medium border-t mt-1 pt-1">Just {shift ? format(shift.date, "dd MMM") : "This Day"} — Not Overtime</SelectItem>
                      <SelectItem value="day_standard">Just {shift ? format(shift.date, "dd MMM") : "This Day"} — Overtime (Outside Normal Hours)</SelectItem>
                      <SelectItem value="day_double_up">Just {shift ? format(shift.date, "dd MMM") : "This Day"} — Overtime (Inside Normal Hours)</SelectItem>
                    </>
                  ) : (
                    <>
                      <SelectItem value="none">Not Overtime</SelectItem>
                      <SelectItem value="standard">Overtime (Outside Normal Hours)</SelectItem>
                      <SelectItem value="double_up">Overtime (Inside Normal Hours)</SelectItem>
                    </>
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                {!isPattern && !form.is_overtime && 'Regular shift — no overtime premium'}
                {!isPattern && form.overtime_subtype === 'standard' && form.is_overtime && 'OT (Outside Normal Hours) — 1.5× daily rate (full additional pay)'}
                {!isPattern && form.overtime_subtype === 'double_up' && form.is_overtime && 'OT (Inside Normal Hours) — 0.5× daily rate premium (base already in salary)'}
                {isPattern && dayOvertimeValue !== 'inherit' && dayOvertimeValue === 'none' && `${format(shift!.date, "dd MMM")} overridden to Not Overtime`}
                {isPattern && dayOvertimeValue !== 'inherit' && dayOvertimeValue === 'standard' && `${format(shift!.date, "dd MMM")} overridden to OT (Outside)`}
                {isPattern && dayOvertimeValue !== 'inherit' && dayOvertimeValue === 'double_up' && `${format(shift!.date, "dd MMM")} overridden to OT (Inside)`}
                {isPattern && dayOvertimeValue === 'inherit' && !form.is_overtime && 'Series: Not Overtime'}
                {isPattern && dayOvertimeValue === 'inherit' && form.is_overtime && form.overtime_subtype === 'standard' && 'Series: OT (Outside Normal Hours) — 1.5× daily rate'}
                {isPattern && dayOvertimeValue === 'inherit' && form.is_overtime && form.overtime_subtype === 'double_up' && 'Series: OT (Inside Normal Hours) — 0.5× daily rate premium'}
                {isPattern && dayOvertimeValue === 'inherit' && form.is_overtime && form.overtime_subtype === 'bonus' && 'Series: Bonus shifts — never paid at the overtime rate; the admin\'s monthly shift bonus is paid in proportion to the bonus shifts worked. Every day on this series is a bonus shift.'}
              </p>
            </div>

            {/* Shift Type */}
            <div>
              <Label>Shift Type (optional)</Label>
              <Select 
                value={form.shift_type} 
                onValueChange={v => setForm(p => ({ ...p, shift_type: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select shift type" />
                </SelectTrigger>
                <SelectContent className="bg-background z-50">
                  {SHIFT_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Notes */}
            <div>
              <Label>Notes (optional)</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Add any notes..."
              />
            </div>
          </div>

          <DialogFooter className="flex flex-col sm:flex-row gap-2">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => setDeleteConfirmOpen(true)}
              className="sm:mr-auto"
            >
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSave}
              disabled={!form.user_id || !form.client_name || isPending
                || (!!shift?.patternId && !seriesReady)
                || (needsApplyFrom && correctPast && !correctionReason.trim())
                || (endCorrection && (!isAdmin || !correctionReason.trim()))}
            >
              {isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Shift</AlertDialogTitle>
            <AlertDialogDescription>
              {isPattern ? (
                started
                  ? "Shifts that have already happened stay on the record. Remove just this shift, this one and those after it, or end the series from today?"
                  : "Would you like to delete just this occurrence or the entire recurring pattern?"
              ) : (
                "Are you sure you want to delete this shift?"
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col gap-2">
            <AlertDialogCancel className="w-full sm:w-auto">Cancel</AlertDialogCancel>
            {isPattern ? (
              <div className="flex flex-col sm:flex-row gap-2 w-full">
                <AlertDialogAction 
                  onClick={() => handleDeleteConfirm('single')}
                  disabled={isDeletePending}
                  className="bg-orange-600 hover:bg-orange-700 flex-1"
                >
                  Just This Shift
                </AlertDialogAction>
                <AlertDialogAction 
                  onClick={() => handleDeleteConfirm('future')}
                  disabled={isDeletePending}
                  className="bg-amber-600 hover:bg-amber-700 flex-1"
                >
                  This & Future
                </AlertDialogAction>
                <AlertDialogAction 
                  onClick={() => handleDeleteConfirm('all')}
                  disabled={isDeletePending}
                  className="bg-destructive hover:bg-destructive/90 flex-1"
                >
                  {started ? "End Series" : "Entire Pattern"}
                </AlertDialogAction>
              </div>
            ) : (
              <AlertDialogAction 
                onClick={() => handleDeleteConfirm('single')}
                disabled={isDeletePending}
                className="bg-destructive hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </>
  );
}
