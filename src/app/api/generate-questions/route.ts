import { NextRequest, NextResponse } from "next/server";
import { analyzeAndGenerate, extractExistingQuestions } from "@/lib/ai/content-analyzer";
import { extractTextFromBase64, getRelevantText } from "@/lib/file-extract";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      material_text,
      file_data,
      file_type,
      file_name,
      question_count = 10,
      question_types = ["multiple_choice"],
      mode = "generate",
    } = body;

    // Check that we have either text or a file
    const hasText = material_text && material_text.trim().length >= 10;
    const hasFile = file_data && file_type;

    if (!hasText && !hasFile) {
      return NextResponse.json(
        { error: "Please provide learning material (text or file) for analysis." },
        { status: 400 }
      );
    }

    // Extract existing questions mode
    if (mode === "extract") {
      if (!hasText) {
        return NextResponse.json(
          { error: "Extract mode requires pasted text, not a file. Please paste your material instead." },
          { status: 400 }
        );
      }
      const extracted = extractExistingQuestions(material_text, Math.min(question_count, 50));
      return NextResponse.json({
        questions: extracted,
        analysis: {
          title: "Extracted Questions",
          subject: "Extracted Content",
          summary: `Found ${extracted.length} questions directly inside the document.`,
          conceptsFound: 0,
          factsFound: 0,
          definitionsFound: 0,
        },
      });
    }

    // If a file was uploaded, extract its text first
    let finalText = hasText ? material_text : "";
    let isImage = false;

    if (hasFile) {
      const isImageType = file_type.startsWith("image/");

      if (isImageType) {
        isImage = true;
      } else {
        const extracted = await extractTextFromBase64(file_data, file_type, file_name);

        if (extracted.error && !extracted.text) {
          return NextResponse.json(
            { error: extracted.error },
            { status: 400 }
          );
        }

        if (!extracted.text || extracted.text.trim().length < 20) {
          return NextResponse.json(
            { error: "Could not read enough content from this file. It may be empty, image-based, or password-protected. Try pasting the text instead." },
            { status: 400 }
          );
        }

        finalText = extracted.text;
      }
    }

    finalText = getRelevantText(finalText, 4000);

    // Call AI — server-side keys from env vars or config file
    const { analysis, questions } = await analyzeAndGenerate(
      finalText,
      Math.min(question_count, 50),
      question_types,
      {
        fileData: isImage ? file_data : undefined,
        fileType: isImage ? file_type : undefined,
        fileName: isImage ? file_name : undefined,
      }
    );

    const validatedQuestions = (questions as Record<string, unknown>[])
      .filter((q) => q.question && q.correctAnswer !== undefined)
      .map((q) => {
        const isTF = q.type === "true_false";
        let rawOptions = Array.isArray(q.options) ? q.options.map(String) : undefined;

        if (isTF && (!rawOptions || rawOptions.length !== 2)) {
          rawOptions = ["True", "False"];
        }

        return {
          type: question_types.includes(q.type as string) ? q.type : question_types[0],
          question: String(q.question || ""),
          options: rawOptions,
          correctAnswer: String(q.correctAnswer || "0"),
          explanation: String(q.explanation || "Based on the provided material."),
          topic: String(q.topic || analysis.subject || "General"),
          difficulty: ["easy", "medium", "hard"].includes(q.difficulty as string)
            ? q.difficulty
            : "medium",
        };
      });

    if (validatedQuestions.length === 0) {
      return NextResponse.json(
        { error: "Could not generate questions from this material. Please try different content." },
        { status: 422 }
      );
    }

    return NextResponse.json({
      questions: validatedQuestions,
      analysis: {
        title: analysis.title,
        subject: analysis.subject,
        summary: analysis.summary,
        conceptsFound: analysis.keyConcepts?.length || 0,
        factsFound: analysis.facts?.length || 0,
        definitionsFound: analysis.definitions?.length || 0,
      },
    });
  } catch (error) {
    console.error("Question generation error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while generating questions. Please try again.",
      },
      { status: 500 }
    );
  }
}
