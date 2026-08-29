import { NextRequest, NextResponse } from "next/server";
import { getQuizById } from "@/lib/data";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { id } = await params;
    const quiz = await getQuizById(id, demo);

    if (!quiz) {
      return NextResponse.json({ error: "Quiz not found" }, { status: 404 });
    }

    if (quiz.status === "published" || quiz.status === "active") {
      return NextResponse.json({ quiz, code: quiz.share_code });
    }

    // In demo mode, update local state
    if (demo && typeof window !== "undefined") {
      const quizzes = JSON.parse(
        localStorage.getItem("ollin_demo_quizzes") || "[]"
      );
      const idx = quizzes.findIndex((q: { id: string }) => q.id === id);
      if (idx >= 0) {
        quizzes[idx].status = "published";
        quizzes[idx].updated_at = new Date().toISOString();
        localStorage.setItem("ollin_demo_quizzes", JSON.stringify(quizzes));
      }
      return NextResponse.json({ quiz: quizzes[idx], code: quiz.share_code });
    }

    // Real Supabase update
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("quizzes")
      .update({ status: "published", updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ quiz: data, code: data.share_code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to publish quiz" },
      { status: 500 }
    );
  }
}
