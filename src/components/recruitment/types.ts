export type QuestionType = "multiple_choice" | "multi_select" | "true_false";
export type TestStatus = "draft" | "live" | "closed";
export type AttemptStatus = "in_progress" | "submitted" | "abandoned";

export interface RecruitmentTest {
  id: string;
  title: string;
  slug: string;
  description: string | null;
  role: string | null;
  pass_threshold: number;
  seconds_per_question: number;
  status: TestStatus;
  shuffle_questions: boolean;
  created_at: string;
}

export interface RecruitmentQuestion {
  id: string;
  test_id: string;
  position: number;
  question_text: string;
  question_type: QuestionType;
  options: string[];
  correct_answers: number[];
  weight: number;
}

export interface RecruitmentAttempt {
  id: string;
  test_id: string;
  candidate_name: string;
  email: string;
  phone: string | null;
  cv_path: string | null;
  started_at: string;
  submitted_at: string | null;
  total_score: number;
  max_score: number;
  integrity_score: number;
  status: AttemptStatus;
}

// Penalty weights per event type (subtracted from 100)
export const INTEGRITY_PENALTIES: Record<string, number> = {
  tab_blur: 5,
  mouse_leave: 5,
  fullscreen_exit: 10,
  copy_attempt: 2,
  paste_attempt: 2,
  contextmenu: 2,
};

export function calcIntegrityScore(events: { event_type: string }[]): number {
  let score = 100;
  for (const e of events) {
    score -= INTEGRITY_PENALTIES[e.event_type] ?? 0;
  }
  return Math.max(0, score);
}
