// =============================================
// Database Types (auto-generate with: npx supabase gen types typescript --local > src/lib/types.ts)
// =============================================

export interface Program {
  id: string;
  code: string;
  name: string;
  department: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: "student" | "admin";
  program_id: string | null;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Course {
  id: string;
  code: string;
  name: string;
  description: string | null;
  department: string | null;
  program_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Material {
  id: string;
  owner_id: string;
  title: string;
  file_url: string | null;
  file_type: string | null;
  extracted_text: string | null;
  char_count: number;
  created_at: string;
}

export interface Quiz {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  share_code: string;
  time_limit_minutes: number | null;
  max_attempts: number;
  show_answers_after: "after_each" | "after_completion" | "never";
  shuffle_questions: boolean;
  shuffle_options: boolean;
  passing_score: number;
  starts_at: string | null;
  ends_at: string | null;
  status: "draft" | "published" | "active" | "completed" | "archived";
  course_id: string | null;
  material_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  quiz_id: string;
  question_text: string;
  question_type: "multiple_choice" | "true_false" | "short_answer" | "fill_blank";
  options: string[] | null;
  correct_answer: string;
  explanation: string | null;
  topic: string | null;
  difficulty: "easy" | "medium" | "hard";
  marks: number;
  order_index: number;
  created_at: string;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  participant_id: string | null;
  participant_name: string | null;
  started_at: string;
  completed_at: string | null;
  time_taken_seconds: number | null;
  total_questions: number;
  correct_answers: number;
  score_percentage: number;
  marks_earned: number;
  marks_total: number;
  status: "in_progress" | "completed" | "timed_out" | "abandoned";
  created_at: string;
}

export interface AttemptAnswer {
  id: string;
  attempt_id: string;
  question_id: string;
  selected_answer: string | null;
  is_correct: boolean | null;
  marks_awarded: number;
  answered_at: string;
}

// =============================================
// API / AI Types
// =============================================

export interface GeneratedQuestion {
  type: "multiple_choice" | "true_false" | "short_answer" | "fill_blank";
  question: string;
  options?: string[];
  correctAnswer: string;
  explanation: string;
  topic?: string;
  difficulty?: "easy" | "medium" | "hard";
  marks?: number;
}

export interface QuizCreationInput {
  title: string;
  description?: string;
  course_id?: string;
  material_id?: string;
  material_text?: string;
  question_count: number;
  question_types: ("multiple_choice" | "true_false" | "short_answer" | "fill_blank")[];
  time_limit_minutes?: number;
  max_attempts: number;
  show_answers_after: "after_each" | "after_completion" | "never";
  shuffle_questions: boolean;
  shuffle_options: boolean;
  passing_score: number;
  starts_at?: string;
  ends_at?: string;
}

// =============================================
// Quiz Stats for Host Dashboard
// =============================================

export interface QuizStats {
  quiz: Quiz;
  total_attempts: number;
  completed_attempts: number;
  average_score: number;
  average_time_seconds: number;
  highest_score: number;
  lowest_score: number;
  question_stats: {
    question_id: string;
    question_text: string;
    correct_percentage: number;
    total_answers: number;
  }[];
}
