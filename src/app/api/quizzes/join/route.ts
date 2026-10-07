import { NextRequest, NextResponse } from "next/server";
import { getQuizByCode, getQuizQuestions, readServerQuizzes } from "@/lib/data";
import { serverGetLocalQuizByCode } from "@/lib/server-local";

// POST — join a quiz by share code
export async function POST(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json();
    const { code, participant_name } = body;

    if (!code || !code.trim()) {
      return NextResponse.json(
        { error: "Quiz code is required" },
        { status: 400 }
      );
    }

    const norm = code.trim().toUpperCase().replace(/[^A-Za-z0-9]/g, "");
    let quiz: any = null;

    // 1. Check Supabase via admin client (handles published quizzes in Supabase)
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        let sbQuiz = null;
        const { data, error } = await admin
          .from("quizzes")
          .select("*")
          .eq("share_code", norm)
          .single();
        if (!error && data) sbQuiz = data;
        if (!sbQuiz && norm) {
          // Normalized lookup
          const { data: all, error: allError } = await admin.from("quizzes").select("*");
          if (!allError && all) {
            sbQuiz = (all || []).find((q: any) =>
              (q.share_code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === norm
            ) || null;
          }
        }
        if (sbQuiz) quiz = sbQuiz;
      }
    } catch { /* Supabase optional */ }

    // 2. Check local file store
    if (!quiz) {
      try {
        const fileQuizzes = readServerQuizzes();
        quiz = fileQuizzes.find((q) =>
          (q.share_code || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase() === norm
        ) || null;
      } catch { /* file optional */ }
    }

    // 3. Check hardcoded built-in test quiz (TST-101 etc.)
    if (!quiz) {
      quiz = serverGetLocalQuizByCode(code.trim()) || null;
    }

    // 4. Last resort: legacy getQuizByCode (covers edge cases)
    if (!quiz) {
      try {
        quiz = await getQuizByCode(code, local);
      } catch { /* ignore */ }
    }

    if (!quiz) {
      return NextResponse.json(
        { error: "Quiz not found. Check the code and try again." },
        { status: 404 }
      );
    }

    if (quiz.status === "draft" || quiz.status === "archived") {
      return NextResponse.json(
        { error: "This quiz is not available yet." },
        { status: 403 }
      );
    }

    // Get questions: try Supabase first, then file/hardcoded
    let allQuestions: any[] = [];
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { data, error } = await admin
          .from("questions")
          .select("*")
          .eq("quiz_id", quiz.id)
          .order("order_index", { ascending: true });
        if (!error && data) allQuestions = data;
      }
    } catch { /* Supabase optional */ }
    if (allQuestions.length === 0) {
      try {
        allQuestions = (await import("@/lib/data")).readServerQuestions()
          .filter((q) => q.quiz_id === quiz.id);
      } catch { /* file optional */ }
    }
    if (allQuestions.length === 0) {
      const { serverGetLocalQuestions } = await import("@/lib/server-local");
      allQuestions = serverGetLocalQuestions(quiz.id);
    }

    const questions = allQuestions.map((q) => ({
      id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options: q.options,
      topic: q.topic,
      difficulty: q.difficulty,
      marks: q.marks,
      order_index: q.order_index,
    }));

    return NextResponse.json({
      quiz: {
        id: quiz.id,
        title: quiz.title,
        description: quiz.description,
        time_limit_minutes: quiz.time_limit_minutes,
        max_attempts: quiz.max_attempts,
        shuffle_questions: quiz.shuffle_questions,
        passing_score: quiz.passing_score,
        total_questions: questions.length,
      },
      questions,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to join quiz" },
      { status: 500 }
    );
  }
}
