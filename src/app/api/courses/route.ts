import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { recordAdminAction } from "@/lib/audit";
import { getSessionAdmin } from "@/lib/session";
import { isEphemeralHost } from "@/lib/server-host";

// Courses start empty — everything here is created by the admin.
const DEFAULT_COURSES: unknown[] = [];

function getCoursesPath() {
  return join(process.cwd(), ".ollin-courses.json");
}

function readLocalCourses() {
  const path = getCoursesPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  // Missing store: serve the in-memory default. Never seed by writing —
  // serverless filesystems (Vercel) are read-only and this used to throw
  // EROFS on every GET.
  return DEFAULT_COURSES;
}

function writeLocalCourses(courses: unknown[]) {
  // Read-only fs (Vercel): degrade gracefully; persistence comes from
  // Supabase once configured there.
  try { writeFileSync(getCoursesPath(), JSON.stringify(courses, null, 2)); } catch { /* read-only fs */ }
}

// GET — list all courses
export async function GET(request: NextRequest) {
  try {
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
    const programId = request.nextUrl.searchParams.get("program_id") || undefined;

    if (local) {
      const all = readLocalCourses();
      const courses = !programId ? all : all.filter((c: any) => c.program_id === programId || !c.program_id);
      return NextResponse.json({ courses });
    }

    const { getCourses } = await import("@/lib/data");
    try {
      const courses = await getCourses(false, programId);
      // Merge in file-backed courses (created while Supabase was unreachable).
      // Without this, a course saved by the fallback path is persisted but
      // never listed again — it looks like the save was lost.
      try {
        // Dedupe by id and by code: the same course is seeded into both
        // stores, and listing it twice looks like a failed duplicate save.
        const knownIds = new Set(courses.map((c: any) => c.id));
        const knownCodes = new Set(
          courses.map((c: any) => String(c.code || "").toUpperCase())
        );
        // Ephemeral host: the file is per-instance, so it must not be merged.
        for (const localCourse of (isEphemeralHost() ? [] : readLocalCourses()) as any[]) {
          const code = String(localCourse.code || "").toUpperCase();
          if (knownIds.has(localCourse.id) || (code && knownCodes.has(code))) continue;
          courses.push(localCourse);
          knownCodes.add(code);
        }
      } catch { /* file store optional */ }
      return NextResponse.json({ courses });
    } catch (err) {
      // Where the disk persists, the file store is a real fallback.
      if (!isEphemeralHost()) {
        const all = readLocalCourses();
        const courses = !programId ? all : all.filter((c: any) => c.program_id === programId || !c.program_id);
        return NextResponse.json({ courses });
      }
      // Serverless: no durable file exists, so an empty per-instance list would
      // read as "the courses were deleted". Fail loudly instead.
      return NextResponse.json(
        {
          error: `Could not load courses from the database: ${
            err instanceof Error ? err.message : "unknown error"
          }`,
        },
        { status: 503 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch courses" },
      { status: 500 }
    );
  }
}

// POST — create a new course
export async function POST(request: NextRequest) {
  try {
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
    const body = await request.json();
    const { code, name, description, department, program_id, year } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Course code is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    const coursePayload = {
      code: code.trim(),
      name: name.trim(),
      description: description || null,
      department: department || null,
      program_id: program_id || null,
      year: year || null,
    };

    if (local) {
      const courses = readLocalCourses();
      const newCourse: any = {
        id: `local-course-${Date.now()}`,
        ...coursePayload,
        created_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      courses.push(newCourse);
      writeLocalCourses(courses);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "course.create", "course", newCourse.id, `Created course ${newCourse.code}`);
      return NextResponse.json({ course: newCourse });
    }

    // Try Supabase first using admin client (bypasses RLS)
    let supabaseError: Error | null = null;
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const admin = await createAdminClient();
      if (admin) {
        // program_id is a uuid column: a locally-created program id (the file
        // store uses "local-program-…") would fail the whole insert. Keep the
        // course and drop the unresolvable link instead of losing the row.
        const isUuid = (v: unknown) =>
          typeof v === "string" &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
        const { data, error } = await admin
          .from("courses")
          .insert({
            code: coursePayload.code.toUpperCase(),
            name: coursePayload.name,
            description: coursePayload.description,
            department: coursePayload.department,
            program_id: isUuid(coursePayload.program_id) ? coursePayload.program_id : null,
            year: coursePayload.year,
          })
          .select()
          .single();
        if (error) throw error;
        const course = data as any;
        course.created_by = null;
        course.created_at = course.created_at || new Date().toISOString();
        course.updated_at = course.updated_at || new Date().toISOString();
        return NextResponse.json({ course });
      }
    } catch (err) {
      if (err instanceof Error) supabaseError = err;
      else if (err && typeof err === "object" && "message" in err) supabaseError = new Error(String((err as any).message));
      else supabaseError = new Error(JSON.stringify(err));
    }

    // On a serverless host the file fallback is not storage: the write lands in
    // a per-instance filesystem (or fails read-only) and is gone before the next
    // request — exactly how newly created courses disappeared after a refresh.
    // Report the real failure rather than a phantom success.
    if (isEphemeralHost()) {
      return NextResponse.json(
        {
          error: `Could not save the course: ${
            supabaseError?.message ||
            "the database is not configured on this deployment (set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)"
          }`,
        },
        { status: 507 }
      );
    }

    // Supabase failed — fall back to local file
    const courses = readLocalCourses();
    const newCourse: any = {
      id: `local-course-${Date.now()}`,
      ...coursePayload,
      created_by: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    courses.push(newCourse);
    // Local file write is best-effort; on read-only fs it silently fails.
    // Write it, then check by reading back — the check used to run without a
    // write, so this path could never succeed and every Supabase hiccup
    // dropped the course with a misleading "not writable" error.
    writeLocalCourses(courses);
    const checkPersisted = readLocalCourses().some((c: any) => c.id === newCourse.id);
    if (!checkPersisted) {
      return NextResponse.json(
        { error: `Failed to create course: ${supabaseError?.message || "unknown error"}. Local storage is also not writable.` },
        { status: 507 }
      );
    }
    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "course.create", "course", newCourse.id, `Created course ${newCourse.code}`);
    return NextResponse.json({ course: newCourse, fallback: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create course" },
      { status: 500 }
    );
  }
}

// PATCH — update a course (code, name, program, year, etc.)
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
      const courses = readLocalCourses();
      const idx = courses.findIndex((c: any) => c.id === id);
      if (idx < 0) return NextResponse.json({ error: "Course not found" }, { status: 404 });
      const course = courses[idx];
      if (body.code) course.code = String(body.code).trim();
      if (body.name) course.name = String(body.name).trim();
      if (body.description !== undefined) course.description = body.description || null;
      if (body.department !== undefined) course.department = body.department || null;
      if (body.program_id !== undefined) course.program_id = body.program_id || null;
      if (body.year !== undefined) course.year = body.year || null;
      course.updated_at = new Date().toISOString();
      writeLocalCourses(courses);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "course.update", "course", id, `Updated course ${course.code}`);
      return NextResponse.json({ course });
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
        if (body.description !== undefined) updates.description = body.description || null;
        if (body.department !== undefined) updates.department = body.department || null;
        if (body.program_id !== undefined) updates.program_id = body.program_id || null;
        if (body.year !== undefined) updates.year = body.year || null;
        if (Object.keys(updates).length > 0) {
          const { error } = await admin.from("courses").update(updates).eq("id", id);
          if (error) throw error;
        }
        const { data } = await admin.from("courses").select("*").eq("id", id).single();
        return NextResponse.json({ course: data });
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
          error: `Could not update the course: ${
            supabaseError?.message || "the database is not configured on this deployment"
          }`,
        },
        { status: 507 }
      );
    }

    // Supabase failed — fall back to local file
    const courses = readLocalCourses();
    const idx = courses.findIndex((c: any) => c.id === id);
    if (idx < 0) return NextResponse.json({ error: "Course not found" }, { status: 404 });
    const course = courses[idx];
    if (body.code) course.code = String(body.code).trim();
    if (body.name) course.name = String(body.name).trim();
    if (body.description !== undefined) course.description = body.description || null;
    if (body.department !== undefined) course.department = body.department || null;
    if (body.program_id !== undefined) course.program_id = body.program_id || null;
    if (body.year !== undefined) course.year = body.year || null;
    course.updated_at = new Date().toISOString();
    writeLocalCourses(courses);
    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "course.update", "course", id, `Updated course ${course.code}`);
    return NextResponse.json({ course, fallback: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update course" },
      { status: 500 }
    );
  }
}

// DELETE — remove a course
export async function DELETE(request: NextRequest) {
  try {
    // On a serverless host the file store is not durable, so a local-mode
    // request must not be routed to it — that is how deployed admin data
    // silently vanished.
    const local = request.headers.get("x-local-mode") === "true" && !isEphemeralHost();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    // A course can come from either store: GET merges Supabase with the file
    // store, so deleting from only one left the other copy to reappear.
    let removedFromSupabase = false;
    let supabaseError: Error | null = null;
    if (!local) {
      try {
        const { createAdminClient } = await import("@/lib/supabase/server");
        const admin = await createAdminClient();
        if (admin) {
          const { data, error } = await admin
            .from("courses")
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

    const courses = readLocalCourses();
    const target = courses.find((c: any) => c.id === id);
    const remaining = courses.filter((c: any) => c.id !== id);
    const removedFromFile = remaining.length !== courses.length;
    if (removedFromFile) writeLocalCourses(remaining);

    if (!removedFromSupabase && !removedFromFile) {
      return NextResponse.json(
        {
          error: supabaseError
            ? `Course not found (${supabaseError.message})`
            : "Course not found",
        },
        { status: 404 }
      );
    }

    const admin = await getSessionAdmin(request);
    await recordAdminAction(request, admin, "course.delete", "course", id, `Deleted course ${target?.code || id}`);
    return NextResponse.json({ success: true, fallback: removedFromFile && !removedFromSupabase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete course" },
      { status: 500 }
    );
  }
}
