import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { recordAdminAction } from "@/lib/audit";
import { getSessionAdmin } from "@/lib/session";

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
  // Missing store: serve the in-memory default. Never seed by writing —
  // serverless filesystems (Vercel) are read-only and this used to throw
  // EROFS on every GET.
  return DEFAULT_PROGRAMS;
}

function writeLocalPrograms(programs: unknown[]) {
  // Read-only fs (Vercel): degrade gracefully; persistence comes from
  // Supabase once configured there.
  try { writeFileSync(getProgramsPath(), JSON.stringify(programs, null, 2)); } catch { /* read-only fs */ }
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

    const programPayload = {
      code: code.trim(),
      name: name.trim(),
      department: department || null,
      description: description || null,
    };

    if (local) {
      const programs = readLocalPrograms();
      const newProgram: any = {
        id: `local-program-${Date.now()}`,
        ...programPayload,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      programs.push(newProgram);
      writeLocalPrograms(programs);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "program.create", "program", newProgram.id, `Created program ${newProgram.code}`);
      return NextResponse.json({ program: newProgram });
    }

    // Try Supabase first using admin client (bypasses RLS)
    let supabaseError: Error | null = null;
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { data, error } = await admin
          .from("programs")
          .insert({
            code: programPayload.code.toUpperCase(),
            name: programPayload.name,
            department: programPayload.department,
            description: programPayload.description,
          })
          .select()
          .single();
        if (error) throw error;
        return NextResponse.json({ program: data });
      }
    } catch (err) {
      if (err instanceof Error) supabaseError = err;
      else if (err && typeof err === "object" && "message" in err) supabaseError = new Error(String((err as any).message));
      else supabaseError = new Error(JSON.stringify(err));
    }

    // Supabase failed — fall back to local file
    const programs = readLocalPrograms();
    const newProgram: any = {
      id: `local-program-${Date.now()}`,
      ...programPayload,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    programs.push(newProgram);
    // Best-effort write: check if it persisted
    const checkPersisted = readLocalPrograms().some((p: any) => p.id === newProgram.id);
    if (!checkPersisted) {
      return NextResponse.json(
        { error: `Failed to create program: ${supabaseError?.message || "unknown error"}. Local storage is also not writable.` },
        { status: 507 }
      );
    }
    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "program.create", "program", newProgram.id, `Created program ${newProgram.code}`);
    return NextResponse.json({ program: newProgram, fallback: true });
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
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "program.update", "program", id, `Updated program ${program.code}`);
      return NextResponse.json({ program });
    }

    // Try Supabase first using admin client
    let supabaseError: Error | null = null;
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const updates: Record<string, unknown> = {};
        if (body.code) updates.code = String(body.code).trim().toUpperCase();
        if (body.name) updates.name = String(body.name).trim();
        if (body.department !== undefined) updates.department = body.department || null;
        if (body.description !== undefined) updates.description = body.description || null;
        if (Object.keys(updates).length > 0) {
          const { error } = await admin.from("programs").update(updates).eq("id", id);
          if (error) throw error;
        }
        const { data } = await admin.from("programs").select("*").eq("id", id).single();
        return NextResponse.json({ program: data });
      }
    } catch (err) {
      if (err instanceof Error) supabaseError = err;
      else if (err && typeof err === "object" && "message" in err) supabaseError = new Error(String((err as any).message));
      else supabaseError = new Error(JSON.stringify(err));
    }

    // Supabase failed — fall back to local file
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
    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "program.update", "program", id, `Updated program ${program.code}`);
    return NextResponse.json({ program, fallback: true });
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
      const programs = readLocalPrograms();
      const target = programs.find((p: any) => p.id === id);
      const remaining = programs.filter((p: any) => p.id !== id);
      writeLocalPrograms(remaining);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "program.delete", "program", id, `Deleted program ${target?.code || id}`);
      return NextResponse.json({ success: true });
    }

    // Try Supabase first using admin client
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        const { error } = await admin.from("programs").delete().eq("id", id);
        if (!error) return NextResponse.json({ success: true });
      }
    } catch {
      // Supabase failed — fall back to local file
    }

    // Fall back to local file
    const programs = readLocalPrograms();
    const target = programs.find((p: any) => p.id === id);
    const remaining = programs.filter((p: any) => p.id !== id);
    writeLocalPrograms(remaining);
    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "program.delete", "program", id, `Deleted program ${target?.code || id}`);
    return NextResponse.json({ success: true, fallback: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete program" },
      { status: 500 }
    );
  }
}
