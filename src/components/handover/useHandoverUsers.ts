import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentlyEmployed, type EmploymentWindow } from "@/lib/employment";

export interface HandoverUserOption {
  id: string;
  name: string;
  email: string;
  /** Still with us — the pickers only offer current staff. */
  employed: boolean;
}

// Shared hook: list of staff display names for the user picker, and for
// turning the name on a task back into somebody's email.
export function useHandoverUsers() {
  return useQuery({
    queryKey: ["handover-user-options", "with-employment"],
    queryFn: async (): Promise<HandoverUserOption[]> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, email")
        .order("display_name", { ascending: true });
      if (error) throw error;

      // Employment windows, so handover work isn't offered to people who have
      // gone. `profiles` also holds sign-in accounts that were never staff and
      // have no HR row at all — those come out as not employed, which is right.
      const { data: hr } = await supabase
        .from("hr_profiles")
        .select("user_id, start_date, employment_end_date");
      const windows = new Map<string, EmploymentWindow>(
        (hr || []).map((h: { user_id: string } & EmploymentWindow) => [h.user_id, h]),
      );

      return (data || [])
        .map((p) => ({
          id: p.user_id as string,
          name: (p.display_name || p.email || "").trim(),
          email: (p.email || "").trim(),
          // Flagged rather than dropped here: the picker offers current staff
          // only, but name→email lookup for change emails about a task a leaver
          // was already on still has to find them.
          employed: isCurrentlyEmployed(windows.get(p.user_id as string)),
        }))
        .filter((u) => u.name);
    },
    staleTime: 5 * 60 * 1000,
  });
}
