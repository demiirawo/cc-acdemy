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
import { format, parseISO, getDay, eachDayOfInterval, parse, subDays } from "date-fns";
import { Trash2, Repeat, Calendar } from "lucide-react";

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

  const [form, setForm] = useState({
    user_id: "",
    client_name: "",
    start_time: "09:00",
    end_time: "17:00",
    selected_days: [] as number[],
    is_overtime: false,
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
        user_id: pattern?.user_id || shift.userId,
        client_name: pattern?.client_name || shift.clientName,
        start_time: pattern?.start_time || shift.startTime,
        end_time: pattern?.end_time || shift.endTime,
        selected_days: pattern?.days_of_week || shift.daysOfWeek || [],
        is_overtime: pattern?.is_overtime ?? shift.isOvertime,
        notes: pattern?.notes || shift.notes || "",
        start_date: pattern?.start_date || shift.startDate || format(shift.date, "yyyy-MM-dd"),
        end_date: pattern?.end_date || shift.endDate || "",
        recurrence_interval: pattern?.recurrence_interval || shift.recurrenceInterval || "weekly",
        shift_type: pattern?.shift_type || shift.shiftType || ""
      });
    }
  }, [shift, pattern]);

  const getStaffName = (userId: string) => {
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

  // Update pattern mutation
  const updatePatternMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.patternId) throw new Error("No pattern ID");

      // Calculate days_of_week based on recurrence interval
      let daysOfWeek: number[];
      if (form.recurrence_interval === 'daily') {
        daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
      } else if (form.recurrence_interval === 'one_off') {
        const startDate = parseISO(form.start_date);
        const endDate = form.end_date ? parseISO(form.end_date) : startDate;
        const daysInRange = eachDayOfInterval({ start: startDate, end: endDate });
        daysOfWeek = [...new Set(daysInRange.map(day => getDay(day)))];
      } else {
        daysOfWeek = form.selected_days;
      }

      const { error } = await supabase
        .from("recurring_shift_patterns")
        .update({
          user_id: form.user_id,
          client_name: form.client_name,
          days_of_week: daysOfWeek,
          start_time: form.start_time,
          end_time: form.end_time,
          is_overtime: form.is_overtime,
          notes: form.notes || null,
          start_date: form.start_date,
          end_date: form.end_date || null,
          recurrence_interval: form.recurrence_interval,
          shift_type: form.shift_type || null
        })
        .eq("id", shift.patternId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      onOpenChange(false);
      onSuccess?.();
      toast.success("Shift pattern updated");
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

  // Delete pattern mutation
  const deletePatternMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.patternId) throw new Error("No pattern ID");
      const { error } = await supabase
        .from("recurring_shift_patterns")
        .delete()
        .eq("id", shift.patternId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success("Shift pattern deleted");
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

  // Delete this and all future shifts (set end_date to day before selected shift)
  const deleteFutureShiftsMutation = useMutation({
    mutationFn: async () => {
      if (!shift?.patternId) throw new Error("No pattern ID");
      const dayBefore = subDays(shift.date, 1);
      const newEndDate = format(dayBefore, "yyyy-MM-dd");
      
      const { error } = await supabase
        .from("recurring_shift_patterns")
        .update({ end_date: newEndDate })
        .eq("id", shift.patternId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recurring-shift-patterns"] });
      queryClient.invalidateQueries({ queryKey: ["public-client-patterns"] });
      setDeleteConfirmOpen(false);
      onOpenChange(false);
      onSuccess?.();
      toast.success("This and all future shifts deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete future shifts: " + error.message);
    }
  });

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
                ? "Modify this shift pattern. Changes will affect all future occurrences."
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
                    onChange={e => setForm(p => ({ ...p, start_date: e.target.value }))}
                  />
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

            {/* Overtime checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="is_overtime"
                checked={form.is_overtime}
                onCheckedChange={(checked) => setForm(p => ({ ...p, is_overtime: checked === true }))}
              />
              <Label htmlFor="is_overtime" className="text-sm font-normal cursor-pointer">
                Mark as overtime
              </Label>
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
              disabled={!form.user_id || !form.client_name || isPending}
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
                "Would you like to delete just this occurrence or the entire recurring pattern?"
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
                  Entire Pattern
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
