import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// Programs start empty — everything here is created by the admin.
const DEFAULT_PROGRAMS: unknown[] = [];

function getProgramsPath() {
  return join(process.cwd(), ".ollin-programs.json");
}

function readLocalPrograms() {
  const path = getProgramsPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  writeFileSync(path, JSON.stringify(DEFAULT_PROGRAMS, null, 2));
  return DEFAULT_PROGRAMS;
}

function writeLocalPrograms(programs: unknown[]) {
  writeFileSync(getProgramsPath(), JSON.stringify(programs, null, 2));
}

// GET — list all programs
export async function GET(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    if (local) {
      return NextResponse.json({ programs: readLocalPrograms() });
    }
    const { getPrograms } = await import("@/lib/data");
    try {
      const programs = await getPrograms(false);
      return NextResponse.json({ programs });
    } catch (err) {
      // NO_BACKEND (Supabase unconfigured or unavailable) → file-backed storage
      if (err instanceof Error && err.message === "NO_BACKEND") {
        return NextResponse.json({ programs: readLocalPrograms() });
      }
      throw err;
    }
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
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json();
    const { code, name, department, description } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Program code is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Program name is required" }, { status: 400 });
    }

    if (local) {
      const programs = readLocalPrograms();
      const newProgram = {
        id: `local-program-${Date.now()}`,
        code: code.trim(),
        name: name.trim(),
        department: department || null,
        description: description || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      programs.push(newProgram);
      writeLocalPrograms(programs);
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

// PATCH — update a program
// Local: update the matching record in the local file.
// Real: update the record in Supabase (keep course code fields in sync).
export async function PATCH(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json();
    const id = body.id;
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (local) {
      const programs = readLocalPrograms();
      const idx = programs.findIndex((p: any) => p.id === id);
      if (idx < 0) return NextResponse.json({ error: "Program not found" }, { status: 404 });
      const program = programs[idx];
      if (body.code) program.code = String(body.code).trim();
      if (body.name) program.name = String(body.name).trim();
      if (body.department !== undefined) program.department = body.department || null;
      if (body.description !== undefined) program.description = body.description || null;
      program.updated_at = new Date().toISOString();
      writeLocalPrograms(programs);
      return NextResponse.json({ program });
    }

    const { updateProgram } = await import("@/lib/data");
    const program = await updateProgram(
      {
        id,
        code: body.code?.trim(),
        name: body.name?.trim(),
        department: body.department,
        description: body.description,
      },
      false
    );
    return NextResponse.json({ program });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update program" },
      { status: 500 }
    );
  }
}

// DELETE — remove a program
export async function DELETE(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (local) {
      const programs = readLocalPrograms().filter((p: any) => p.id !== id);
      writeLocalPrograms(programs);
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
