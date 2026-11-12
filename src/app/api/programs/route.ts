import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { recordAdminAction } from "@/lib/audit";
import { getSessionAdmin } from "@/lib/session";
import { isEphemeralHost } from "@/lib/server-host";

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
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
    if (local) {
      return NextResponse.json({ programs: readLocalPrograms() });
    }
    const { getPrograms } = await import("@/lib/data");
    try {
      const programs = await getPrograms(false);
      // Merge in file-backed programs (created while Supabase was unreachable),
      // so a fallback save never looks like it was lost.
      try {
        // Dedupe by id and by code: the same program is seeded into both
        // stores, and listing it twice looks like a failed duplicate save.
        const knownIds = new Set(programs.map((p: any) => p.id));
        const knownCodes = new Set(
          programs.map((p: any) => String(p.code || "").toUpperCase())
        );
        // Ephemeral host: the file is per-instance, so it must not be merged.
        for (const localProgram of (isEphemeralHost() ? [] : readLocalPrograms()) as any[]) {
          const code = String(localProgram.code || "").toUpperCase();
          if (knownIds.has(localProgram.id) || (code && knownCodes.has(code))) continue;
          programs.push(localProgram);
          knownCodes.add(code);
        }
      } catch { /* file store optional */ }
      return NextResponse.json({ programs });
    } catch (err) {
      // Where the disk persists, the file store is a real fallback.
      if (!isEphemeralHost()) {
        return NextResponse.json({ programs: readLocalPrograms() });
      }
      // Serverless: there is no durable file, so serving it would show a short
      // per-instance list and look like the programs were deleted. Fail loudly
      // instead — the admin page shows the message and a Retry button.
      return NextResponse.json(
        {
          error: `Could not load programs from the database: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
        { status: 503 }
      );
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
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
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

    // On a serverless host the file fallback is not storage: the write lands in
    // a per-instance filesystem (or fails read-only) and is gone before the next
    // request — exactly how newly created programs disappeared after a refresh.
    // Report the real failure rather than a phantom success.
    if (isEphemeralHost()) {
      return NextResponse.json(
        {
          error: `Could not save the program: ${
            supabaseError?.message ||
            "the database is not configured on this deployment (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)"
          }`,
        },
        { status: 507 }
      );
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
    // Write before verifying: the read-back check below used to run without a
    // write, so it always failed and reported "not writable" while silently
    // discarding the program.
    writeLocalPrograms(programs);
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
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
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

    // Same rule as create: a per-instance file is not a place to store an edit.
    if (isEphemeralHost()) {
      return NextResponse.json(
        {
          error: `Could not update the program: ${
            supabaseError?.message || "the database is not configured on this deployment"
          }`,
        },
        { status: 507 }
      );
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
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // A program can come from either store: GET merges Supabase with the file
    // store, so the row the admin sees may live in only one of them. Deleting
    // from a single store left the other copy to reappear on the next load.
    let removedFromSupabase = false;
    let supabaseError: Error | null = null;
    if (!local) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data, error } = await admin
            .from("programs")
            .delete()
            .eq("id", id)
            .select("id");
          if (error) supabaseError = new Error(error.message);
          else removedFromSupabase = (data?.length || 0) > 0;
        }
      } catch (err) {
        supabaseError = err instanceof Error ? err : new Error(String(err));
      }
    }

    const programs = readLocalPrograms();
    const target = programs.find((p: any) => p.id === id);
    const remaining = programs.filter((p: any) => p.id !== id);
    const removedFromFile = remaining.length !== programs.length;
    if (removedFromFile) writeLocalPrograms(remaining);

    // 404 only when NEITHER store knew the id — the phone-the-rest-in case.
    if (!removedFromSupabase && !removedFromFile) {
      return NextResponse.json(
        {
          error: supabaseError
            ? `Program not found (${supabaseError.message})`
            : "Program not found",
        },
        { status: 404 }
      );
    }

    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "program.delete", "program", id, `Deleted program ${target?.code || id}`);
    return NextResponse.json({ success: true, fallback: removedFromFile && !removedFromSupabase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete program" },
      { status: 500 }
    );
  }
}
