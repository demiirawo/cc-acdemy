import { useState, useEffect, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import { Loader2, GraduationCap } from "lucide-react";
import { addMonths, format, parseISO, differenceInCalendarDays } from "date-fns";
import { cn } from "@/lib/utils";
import { TRAINING_CATEGORIES, type TrainingItem } from "./TrainingItemsManager";

type EmploymentStatus = "onboarding_probation" | "onboarding_passed" | "active" | "inactive_left" | "inactive_fired";
// Staff we show on the matrix — everyone except those who have left/been let go.
const VISIBLE_STATUSES: EmploymentStatus[] = ["onboarding_probation", "onboarding_passed", "active"];

interface StaffMember {
  user_id: string;
  display_name: string;
}

interface TrainingRecord {
  id: string;
  training_item_id: string;
  user_id: string;
  completed_date: string;
  notes: string | null;
}

type CellStatus = "none" | "valid" | "due_soon" | "expired" | "complete";

interface CellInfo {
  status: CellStatus;
  record: TrainingRecord | null;
  expiresOn: Date | null;
}

const DUE_SOON_DAYS = 30;

function computeCell(item: TrainingItem, record: TrainingRecord | null): CellInfo {
  if (!record) return { status: "none", record: null, expiresOn: null };
  if (item.refresh_frequency_months == null) {
    return { status: "complete", record, expiresOn: null };
  }
  const completed = parseISO(record.completed_date);
  const expiresOn = addMonths(completed, item.refresh_frequency_months);
  const daysLeft = differenceInCalendarDays(expiresOn, new Date());
  if (daysLeft < 0) return { status: "expired", record, expiresOn };
  if (daysLeft <= DUE_SOON_DAYS) return { status: "due_soon", record, expiresOn };
  return { status: "valid", record, expiresOn };
}

// Tailwind classes per status for the date "pill" in a cell.
const STATUS_CLASSES: Record<CellStatus, string> = {
  complete: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300",
  valid: "bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-300",
  due_soon: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300",
  expired: "bg-red-100 text-red-800 border-red-300 dark:bg-red-900/30 dark:text-red-300",
  none: "bg-transparent text-muted-foreground border-dashed border-border",
};

// "Up to date" = has a record that hasn't expired.
function isUpToDate(status: CellStatus): boolean {
  return status === "complete" || status === "valid" || status === "due_soon";
}

function pctColor(pct: number): string {
  if (pct >= 80) return "text-green-600";
  if (pct >= 50) return "text-amber-600";
  return "text-red-600";
}

export function TrainingMatrix() {
  const { user } = useAuth();
  const { canManageTraining } = useUserRole();
  const { toast } = useToast();
  const [items, setItems] = useState<TrainingItem[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [records, setRecords] = useState<TrainingRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Inline cell editing: key is `${itemId}::${userId}`.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const { data: itemsData } = await supabase
        .from("training_items")
        .select("id, name, description, refresh_frequency_months, sort_order, is_active, category")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });

      const { data: hrData } = await supabase
        .from("hr_profiles")
        .select("user_id, employment_status");
      const visibleIds = (hrData ?? [])
        .filter(hr => VISIBLE_STATUSES.includes(hr.employment_status as EmploymentStatus))
        .map(hr => hr.user_id);

      const { data: staffData } = await supabase
        .from("profiles")
        .select("user_id, display_name")
        .in("user_id", visibleIds.length > 0 ? visibleIds : ["no-match"])
        .order("display_name");

      const { data: recordsData } = await supabase
        .from("training_records")
        .select("id, training_item_id, user_id, completed_date, notes");

      setItems((itemsData ?? []) as TrainingItem[]);
      setStaff((staffData ?? []) as StaffMember[]);
      setRecords((recordsData ?? []) as TrainingRecord[]);
    } catch (e: any) {
      toast({ title: "Could not load training matrix", description: e.message ?? String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const recordFor = (itemId: string, userId: string): TrainingRecord | null =>
    records.find(r => r.training_item_id === itemId && r.user_id === userId) ?? null;

  const startEdit = (itemId: string, userId: string) => {
    if (!canManageTraining) return;
    setEditKey(`${itemId}::${userId}`);
    setEditValue(recordFor(itemId, userId)?.completed_date ?? "");
  };

  // Save (or clear) a cell's completion date directly.
  const saveCell = async (itemId: string, userId: string, val: string) => {
    const existing = recordFor(itemId, userId);
    if ((existing?.completed_date ?? "") === val) return; // no change

    try {
      if (val) {
        const { error } = await supabase
          .from("training_records")
          .upsert(
            {
              training_item_id: itemId,
              user_id: userId,
              completed_date: val,
              notes: existing?.notes ?? null,
              created_by: user?.id ?? null,
            },
            { onConflict: "training_item_id,user_id" }
          );
        if (error) throw error;
      } else if (existing) {
        const { error } = await supabase.from("training_records").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        return;
      }
      load();
    } catch (e: any) {
      toast({ title: "Could not save", description: e.message ?? String(e), variant: "destructive" });
    }
  };

  const memberPct = (userId: string): number => {
    if (items.length === 0) return 0;
    let up = 0;
    items.forEach(it => {
      const info = computeCell(it, recordFor(it.id, userId));
      if (isUpToDate(info.status)) up++;
    });
    return Math.round((up / items.length) * 100);
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <GraduationCap className="h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No training items configured</p>
          <p className="text-sm text-muted-foreground">
            Add training items in Settings → Configuration → Training to populate the matrix.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (staff.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No active staff to show. Staff appear here once they have an HR profile.
        </CardContent>
      </Card>
    );
  }

  // Group items by category (part).
  const UNCATEGORISED = "Other";
  const grouped = items.reduce((acc, item) => {
    const key = item.category || UNCATEGORISED;
    (acc[key] ||= []).push(item);
    return acc;
  }, {} as Record<string, TrainingItem[]>);
  const extraCats = Object.keys(grouped)
    .filter(c => !(TRAINING_CATEGORIES as readonly string[]).includes(c) && c !== UNCATEGORISED)
    .sort();
  const orderedGroups = [...TRAINING_CATEGORIES, ...extraCats, UNCATEGORISED]
    .filter(c => grouped[c]?.length)
    .map(c => ({ category: c, items: grouped[c] }));

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-green-100 border border-green-300" /> On track (&gt; 1 month)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-amber-100 border border-amber-300" /> Due soon (&lt; 1 month)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded bg-red-100 border border-red-300" /> Overdue</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded border border-dashed border-border" /> Not recorded</span>
        {canManageTraining && <span className="ml-auto italic">Click a cell to enter the completion date</span>}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Staff Training Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <ScrollArea className="w-full">
            <div className="min-w-max">
              <table className="border-collapse">
                <thead>
                  <tr>
                    <th className="sticky left-0 bg-card z-30 p-3 text-left font-medium border-b border-r align-bottom min-w-[240px]">
                      Training
                    </th>
                    {staff.map(member => (
                      <th
                        key={member.user_id}
                        className="border-b p-0 align-bottom"
                        style={{ minWidth: 48 }}
                        title={member.display_name || "Unknown"}
                      >
                        <div className="h-[120px] flex items-end justify-center pb-2.5 overflow-visible">
                          <span className="whitespace-nowrap text-xs text-foreground rotate-[-45deg] origin-bottom-left translate-x-[10px]">
                            {member.display_name || "Unknown"}
                          </span>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {/* Percentage completion summary row */}
                  <tr className="bg-muted border-b-2">
                    <td className="sticky left-0 bg-muted z-20 px-3 py-2 border-r font-semibold text-sm">
                      % Up to date
                    </td>
                    {staff.map(member => {
                      const pct = memberPct(member.user_id);
                      return (
                        <td key={member.user_id} className="px-1 py-2 text-center">
                          <span className={cn("text-xs font-bold", pctColor(pct))}>{pct}%</span>
                        </td>
                      );
                    })}
                  </tr>
                  {orderedGroups.map(group => (
                    <Fragment key={group.category}>
                      {/* Part / category header row — label stays static on horizontal scroll */}
                      <tr className="bg-muted/50">
                        <td className="sticky left-0 z-20 bg-muted/50 p-2 font-semibold text-sm text-primary border-b border-r">
                          {group.category}
                        </td>
                        {staff.map(member => (
                          <td key={member.user_id} className="bg-muted/50 border-b" />
                        ))}
                      </tr>
                      {group.items.map(item => (
                        <tr key={item.id} className="hover:bg-muted/30">
                          <td className="sticky left-0 bg-card z-20 px-3 py-1 border-b border-r">
                            <div className="text-sm font-medium leading-tight">{item.name}</div>
                          </td>
                          {staff.map(member => {
                            const key = `${item.id}::${member.user_id}`;
                            const isEditing = editKey === key;
                            const info = computeCell(item, recordFor(item.id, member.user_id));
                            return (
                              <td key={member.user_id} className="px-1 py-0.5 text-center border-b align-middle">
                                {isEditing ? (
                                  <input
                                    type="date"
                                    autoFocus
                                    value={editValue}
                                    max={format(new Date(), "yyyy-MM-dd")}
                                    onChange={(e) => {
                                      const v = e.target.value;
                                      setEditValue(v);
                                      saveCell(item.id, member.user_id, v);
                                    }}
                                    onBlur={() => setEditKey(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.currentTarget.blur();
                                      if (e.key === "Escape") setEditKey(null);
                                    }}
                                    className="w-[120px] text-xs border rounded px-1 py-0.5 bg-background"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => startEdit(item.id, member.user_id)}
                                    disabled={!canManageTraining}
                                    title={
                                      info.record
                                        ? `Completed ${format(parseISO(info.record.completed_date), "d MMM yyyy")}` +
                                          (info.expiresOn ? ` · expires ${format(info.expiresOn, "d MMM yyyy")}` : " · no expiry")
                                        : "Not recorded"
                                    }
                                    className={cn(
                                      "w-full min-w-[68px] rounded border px-1.5 py-0.5 text-xs font-medium transition-colors",
                                      STATUS_CLASSES[info.status],
                                      canManageTraining ? "cursor-pointer hover:brightness-95" : "cursor-default"
                                    )}
                                  >
                                    {info.record
                                      ? format(parseISO(info.record.completed_date), "d MMM yy")
                                      : "—"}
                                  </button>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
