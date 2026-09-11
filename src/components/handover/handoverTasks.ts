/** A client_handover_tasks row. */
export interface HandoverTask {
  id: string;
  client_name: string;
  /** The handover this checklist item belongs to; null on pre-rebuild tasks. */
  handover_id: string | null;
  template_id: string | null;
  category: string | null;
  task_name: string;
  task_description: string | null;
  link: string | null;
  handed_over_by: string | null;
  handed_over_to: string | null;
  progress: number;
  target_date: string | null;
  sort_order: number | null;
  created_at: string;
}

/** A task being typed into the grid, before it is saved. */
export type DraftRow = {
  key: string;
  category: string;
  task_name: string;
  task_description: string;
  link: string;
  handed_over_by: string;
  handed_over_to: string;
  progress: number;
  target_date: string;
  template_id: string | null;
};

export const newDraft = (category = ""): DraftRow => ({
  key: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  category,
  task_name: "",
  task_description: "",
  link: "",
  handed_over_by: "",
  handed_over_to: "",
  progress: 0,
  target_date: "",
  template_id: null,
});

export const UNCATEGORIZED = "Uncategorized";
