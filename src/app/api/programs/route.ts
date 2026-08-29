import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DEFAULT_PROGRAMS = [
  { id: "demo-program-001", code: "BSc CS", name: "BSc Computer Science", department: "Computer Science", description: "Four-year undergraduate program in computer science.", created_at: new Date(Date.now() - 86400000 * 90).toISOString(), updated_at: new Date(Date.now() - 86400000 * 90).toISOString() },
  { id: "demo-program-002", code: "BSc BIO", name: "BSc Biology", department: "Biology", description: "Four-year undergraduate program in biology.", created_at: new Date(Date.now() - 86400000 * 85).toISOString(), updated_at: new Date(Date.now() - 86400000 * 85).toISOString() },
  { id: "demo-program-003", code: "BA HIS", name: "BA History", department: "History", description: "Three-year undergraduate program in history.", created_at: new Date(Date.now() - 86400000 * 80).toISOString(), updated_at: new Date(Date.now() - 86400000 * 80).toISOString() },
  { id: "demo-program-004", code: "BSc MATH", name: "BSc Mathematics", department: "Mathematics", description: "Four-year undergraduate program in mathematics.", created_at: new Date(Date.now() - 86400000 * 75).toISOString(), updated_at: new Date(Date.now() - 86400000 * 75).toISOString() },
];

function getProgramsPath() {
  return join(process.cwd(), ".ollin-programs.json");
}

function readDemoPrograms() {
  const path = getProgramsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  writeFileSync(path, JSON.stringify(DEFAULT_PROGRAMS, null, 2));
  return DEFAULT_PROGRAMS;
}

function writeDemoPrograms(programs: unknown[]) {
  writeFileSync(getProgramsPath(), JSON.stringify(programs, null, 2));
}

// GET — list all programs
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    if (demo) {
      return NextResponse.json({ programs: readDemoPrograms() });
    }
    const { getPrograms } = await import("@/lib/data");
    const programs = await getPrograms(false);
    return NextResponse.json({ programs });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch programs" },
      { status: 500 }
    );
  }
}

// POST — create a new program
export async function POST(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { code, name, department, description } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Program code is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Program name is required" }, { status: 400 });
    }

    if (demo) {
      const programs = readDemoPrograms();
      const newProgram = {
        id: `demo-program-${Date.now()}`,
        code: code.trim(),
        name: name.trim(),
        department: department || null,
        description: description || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      programs.push(newProgram);
      writeDemoPrograms(programs);
      return NextResponse.json({ program: newProgram });
    }

    const { createProgram } = await import("@/lib/data");
    const program = await createProgram({ code: code.trim(), name: name.trim(), department, description }, false);
    return NextResponse.json({ program });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create program" },
      { status: 500 }
    );
  }
}

// DELETE — remove a program
export async function DELETE(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (demo) {
      const programs = readDemoPrograms().filter((p: any) => p.id !== id);
      writeDemoPrograms(programs);
      return NextResponse.json({ success: true });
    }

    const { deleteProgram } = await import("@/lib/data");
    await deleteProgram(id, false);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete program" },
      { status: 500 }
    );
  }
}
