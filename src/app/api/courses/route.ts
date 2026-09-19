import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { recordAdminAction } from "@/lib/audit";
import { getSessionAdmin } from "@/lib/session";

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
  writeFileSync(path, JSON.stringify(DEFAULT_COURSES, null, 2));
  return DEFAULT_COURSES;
}

function writeLocalCourses(courses: unknown[]) {
  writeFileSync(getCoursesPath(), JSON.stringify(courses, null, 2));
}

// GET — list all courses
export async function GET(request: NextRequest) {
  try {
    const local = request.headers.get("x-local-mode") === "true";
    const programId = request.nextUrl.searchParams.get("program_id") || undefined;

    if (local) {
      const all = readLocalCourses();
      const courses = !programId ? all : all.filter((c: any) => c.program_id === programId || !c.program_id);
      return NextResponse.json({ courses });
    }

    const { getCourses } = await import("@/lib/data");
    try {
      const courses = await getCourses(false, programId);
      return NextResponse.json({ courses });
    } catch (err) {
      // NO_BACKEND (Supabase unconfigured or unavailable) → file-backed storage
      if (err instanceof Error && err.message === "NO_BACKEND") {
        const all = readLocalCourses();
        const courses = !programId ? all : all.filter((c: any) => c.program_id === programId || !c.program_id);
        return NextResponse.json({ courses });
      }
      throw err;
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
    const local = request.headers.get("x-local-mode") === "true";
    const body = await request.json();
    const { code, name, description, department, program_id, year } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Course code is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    if (local) {
      const courses = readLocalCourses();
      const newCourse = {
        id: `local-course-${Date.now()}`,
        code: code.trim(),
        name: name.trim(),
        description: description || null,
        department: department || null,
        program_id: program_id || null,
        year: year || null,
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

    const { createCourse } = await import("@/lib/data");
    const course = await createCourse({ code: code.trim(), name: name.trim(), description, department, program_id, year }, false);
    return NextResponse.json({ course });
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
    const local = request.headers.get("x-local-mode") === "true";
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

    const { updateCourse } = await import("@/lib/data");
    const course = await updateCourse(
      {
        id,
        code: body.code?.trim(),
        name: body.name?.trim(),
        description: body.description,
        department: body.department,
        program_id: body.program_id,
        year: body.year,
      },
      false
    );
    return NextResponse.json({ course });
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
    const local = request.headers.get("x-local-mode") === "true";
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (local) {
      const courses = readLocalCourses();
      const target = courses.find((c: any) => c.id === id);
      const remaining = courses.filter((c: any) => c.id !== id);
      writeLocalCourses(remaining);
      const admin = await getSessionAdmin(request);
      await recordAdminAction(request, admin, "course.delete", "course", id, `Deleted course ${target?.code || id}`);
      return NextResponse.json({ success: true });
    }

    const { deleteCourse } = await import("@/lib/data");
    await deleteCourse(id, false);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete course" },
      { status: 500 }
    );
  }
}
