import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface HandoverTemplate {
  id: string;
  name: string;
  description: string | null;
  link: string | null;
  category: string | null;
}

/** The task library: the standard handover tasks, in their categories. */
export function useHandoverTemplates() {
  return useQuery({
    queryKey: ["handover-task-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("handover_task_templates")
        .select("*")
        .order("sort_order", { ascending: true })
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as HandoverTemplate[];
    },
  });
}
