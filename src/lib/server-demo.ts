/**
 * Server-safe demo data
 *
 * Mirrors the demo data from demo.ts but without localStorage dependency.
 * Used by API routes when running in demo mode.
 */

import { Quiz, Question, QuizAttempt, Course, Program } from "./types";

export const DEMO_USER = {
  id: "demo-user-001",
  email: "demo@ollin.app",
  full_name: "Alex Student",
  role: "student" as const,
};

export const DEMO_PROGRAMS: Program[] = [
  {
    id: "demo-program-001",
    code: "BSc CS",
    name: "BSc Computer Science",
    department: "Computer Science",
    description: "Four-year undergraduate program in computer science.",
    created_at: new Date(Date.now() - 86400000 * 90).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 90).toISOString(),
  },
  {
    id: "demo-program-002",
    code: "BSc BIO",
    name: "BSc Biology",
    department: "Biology",
    description: "Four-year undergraduate program in biology.",
    created_at: new Date(Date.now() - 86400000 * 85).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 85).toISOString(),
  },
  {
    id: "demo-program-003",
    code: "BA HIS",
    name: "BA History",
    department: "History",
    description: "Three-year undergraduate program in history.",
    created_at: new Date(Date.now() - 86400000 * 80).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 80).toISOString(),
  },
  {
    id: "demo-program-004",
    code: "BSc MATH",
    name: "BSc Mathematics",
    department: "Mathematics",
    description: "Four-year undergraduate program in mathematics.",
    created_at: new Date(Date.now() - 86400000 * 75).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 75).toISOString(),
  },
];

export const DEMO_COURSES: Course[] = [
  {
    id: "demo-course-001",
    code: "CSC 101",
    name: "Introduction to Computer Science",
    description: "Fundamentals of computing, algorithms, and programming concepts.",
    department: "Computer Science",
    program_id: "demo-program-001",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 60).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 60).toISOString(),
  },
  {
    id: "demo-course-002",
    code: "BIO 201",
    name: "Cell Biology",
    description: "Cell structure, organelles, division, and molecular processes.",
    department: "Biology",
    program_id: "demo-program-002",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 55).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 55).toISOString(),
  },
  {
    id: "demo-course-003",
    code: "HIS 301",
    name: "World History: Ancient Civilizations",
    description: "Mesopotamia, Egypt, Greece, and Rome.",
    department: "History",
    program_id: "demo-program-003",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 50).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 50).toISOString(),
  },
  {
    id: "demo-course-004",
    code: "MTH 102",
    name: "Calculus I",
    description: "Limits, derivatives, and integrals.",
    department: "Mathematics",
    program_id: "demo-program-004",
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
  {
    id: "demo-course-005",
    code: "GST 101",
    name: "Communication Skills",
    description: "English language, writing, and presentation skills for all students.",
    department: "General Studies",
    program_id: null,
    created_by: "admin-001",
    created_at: new Date(Date.now() - 86400000 * 45).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 45).toISOString(),
  },
];

export const DEMO_QUIZZES: Quiz[] = [
  {
    id: "demo-quiz-001",
    host_id: "demo-user-001",
    title: "Introduction to Biology",
    description: "Covers cell structure, organelles, and basic biological processes.",
    share_code: "BIO-12345",
    time_limit_minutes: 15,
    max_attempts: 1,
    show_answers_after: "after_completion",
    shuffle_questions: true,
    shuffle_options: true,
    passing_score: 60,
    starts_at: null,
    ends_at: null,
    status: "published",
    course_id: "demo-course-002",
    material_id: null,
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 2).toISOString(),
  },
  {
    id: "demo-quiz-002",
    host_id: "demo-user-001",
    title: "World History: Ancient Civilizations",
    description: "Mesopotamia, Egypt, Greece, and Rome.",
    share_code: "HIS-67890",
    time_limit_minutes: 20,
    max_attempts: 2,
    show_answers_after: "after_completion",
    shuffle_questions: false,
    shuffle_options: true,
    passing_score: 50,
    starts_at: null,
    ends_at: null,
    status: "completed",
    course_id: "demo-course-003",
    material_id: null,
    created_at: new Date(Date.now() - 86400000 * 10).toISOString(),
    updated_at: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: "demo-quiz-003",
    host_id: "demo-user-001",
    title: "Calculus Fundamentals",
    description: "Limits, derivatives, and integrals.",
    share_code: "CAL-11223",
    time_limit_minutes: null,
    max_attempts: 1,
    show_answers_after: "never",
    shuffle_questions: true,
    shuffle_options: false,
    passing_score: 70,
    starts_at: null,
    ends_at: null,
    status: "draft",
    course_id: "demo-course-004",
    material_id: null,
    created_at: new Date(Date.now() - 3600000).toISOString(),
    updated_at: new Date(Date.now() - 3600000).toISOString(),
  },
];

export const DEMO_QUESTIONS: Question[] = [
  {
    id: "demo-q-001",
    quiz_id: "demo-quiz-001",
    question_text: "What is the powerhouse of the cell?",
    question_type: "multiple_choice",
    options: ["Nucleus", "Mitochondria", "Ribosome", "Endoplasmic Reticulum"],
    correct_answer: "1",
    explanation: "Mitochondria are known as the powerhouse of the cell because they generate most of the cell's supply of ATP through cellular respiration.",
    topic: "Cell Biology",
    difficulty: "easy",
    marks: 1,
    order_index: 0,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-002",
    quiz_id: "demo-quiz-001",
    question_text: "Which organelle is responsible for protein synthesis?",
    question_type: "multiple_choice",
    options: ["Golgi Apparatus", "Lysosome", "Ribosome", "Vacuole"],
    correct_answer: "2",
    explanation: "Ribosomes are the sites of protein synthesis. They can be found floating freely in the cytoplasm or attached to the rough ER.",
    topic: "Cell Biology",
    difficulty: "easy",
    marks: 1,
    order_index: 1,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-003",
    quiz_id: "demo-quiz-001",
    question_text: "DNA replication occurs during which phase of the cell cycle?",
    question_type: "multiple_choice",
    options: ["G1 Phase", "S Phase", "G2 Phase", "M Phase"],
    correct_answer: "1",
    explanation: "DNA replication occurs during the S (Synthesis) phase of interphase, before the cell divides.",
    topic: "Cell Division",
    difficulty: "medium",
    marks: 1,
    order_index: 2,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-004",
    quiz_id: "demo-quiz-001",
    question_text: "Plant cells have cell walls while animal cells do not.",
    question_type: "true_false",
    options: ["True", "False"],
    correct_answer: "true",
    explanation: "This is correct. Plant cells have a rigid cell wall made of cellulose that provides structural support, while animal cells only have a cell membrane.",
    topic: "Cell Structure",
    difficulty: "easy",
    marks: 1,
    order_index: 3,
    created_at: new Date().toISOString(),
  },
  {
    id: "demo-q-005",
    quiz_id: "demo-quiz-001",
    question_text: "Which of the following is NOT a function of the cell membrane?",
    question_type: "multiple_choice",
    options: [
      "Selective permeability",
      "Cell signaling",
      "ATP production",
      "Protection",
    ],
    correct_answer: "2",
    explanation: "ATP production is a function of mitochondria, not the cell membrane. The cell membrane controls what enters and exits the cell, facilitates signaling, and provides protection.",
    topic: "Cell Structure",
    difficulty: "medium",
    marks: 1,
    order_index: 4,
    created_at: new Date().toISOString(),
  },
];

export const DEMO_ATTEMPTS: QuizAttempt[] = [
  {
    id: "demo-att-001",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Sarah Johnson",
    started_at: new Date(Date.now() - 86400000 * 8).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 8 + 720000).toISOString(),
    time_taken_seconds: 720,
    total_questions: 10,
    correct_answers: 8,
    score_percentage: 80,
    marks_earned: 8,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
  {
    id: "demo-att-002",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Marcus Lee",
    started_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 7 + 900000).toISOString(),
    time_taken_seconds: 900,
    total_questions: 10,
    correct_answers: 6,
    score_percentage: 60,
    marks_earned: 6,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
  },
  {
    id: "demo-att-003",
    quiz_id: "demo-quiz-002",
    participant_id: null,
    participant_name: "Emily Chen",
    started_at: new Date(Date.now() - 86400000 * 6).toISOString(),
    completed_at: new Date(Date.now() - 86400000 * 6 + 600000).toISOString(),
    time_taken_seconds: 600,
    total_questions: 10,
    correct_answers: 9,
    score_percentage: 90,
    marks_earned: 9,
    marks_total: 10,
    status: "completed",
    created_at: new Date(Date.now() - 86400000 * 6).toISOString(),
  },
  {
    id: "demo-att-004",
    quiz_id: "demo-quiz-001",
    participant_id: null,
    participant_name: "James Wilson",
    started_at: new Date(Date.now() - 86400000).toISOString(),
    completed_at: new Date(Date.now() - 86400000 + 480000).toISOString(),
    time_taken_seconds: 480,
    total_questions: 5,
    correct_answers: 4,
    score_percentage: 80,
    marks_earned: 4,
    marks_total: 5,
    status: "completed",
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
];

// Server-safe lookup functions
export function serverGetDemoQuizByCode(code: string): Quiz | undefined {
  return DEMO_QUIZZES.find((q) => q.share_code === code);
}

export function serverGetDemoQuizById(id: string): Quiz | undefined {
  return DEMO_QUIZZES.find((q) => q.id === id);
}

export function serverGetDemoQuizzes(): Quiz[] {
  return DEMO_QUIZZES;
}

export function serverGetDemoQuestions(quizId: string): Question[] {
  if (quizId === "demo-quiz-001") return DEMO_QUESTIONS;
  return [];
}

export function serverGetDemoAttempts(quizId: string): QuizAttempt[] {
  return DEMO_ATTEMPTS.filter((a) => a.quiz_id === quizId);
}

export function serverGetDemoCourses(): Course[] {
  return DEMO_COURSES;
}

export function serverGetDemoCourseById(id: string): Course | undefined {
  return DEMO_COURSES.find((c) => c.id === id);
}

export function serverGetDemoPrograms(): Program[] {
  return DEMO_PROGRAMS;
}

export function serverGetDemoProgramById(id: string): Program | undefined {
  return DEMO_PROGRAMS.find((p) => p.id === id);
}
