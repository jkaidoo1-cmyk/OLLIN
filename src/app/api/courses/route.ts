import { NextRequest, NextResponse } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const DEFAULT_COURSES = [
  { id: "demo-course-001", code: "CSC 101", name: "Introduction to Computer Science", description: "Fundamentals of computing, algorithms, and programming concepts.", department: "Computer Science", program_id: "demo-program-001", year: 1, created_by: "admin-001", created_at: new Date(Date.now() - 86400000 * 60).toISOString(), updated_at: new Date(Date.now() - 86400000 * 60).toISOString() },
  { id: "demo-course-002", code: "BIO 201", name: "Cell Biology", description: "Cell structure, organelles, division, and molecular processes.", department: "Biology", program_id: "demo-program-002", year: 2, created_by: "admin-001", created_at: new Date(Date.now() - 86400000 * 55).toISOString(), updated_at: new Date(Date.now() - 86400000 * 55).toISOString() },
  { id: "demo-course-003", code: "HIS 301", name: "World History: Ancient Civilizations", description: "Mesopotamia, Egypt, Greece, and Rome.", department: "History", program_id: "demo-program-003", year: 3, created_by: "admin-001", created_at: new Date(Date.now() - 86400000 * 50).toISOString(), updated_at: new Date(Date.now() - 86400000 * 50).toISOString() },
  { id: "demo-course-004", code: "MTH 102", name: "Calculus I", description: "Limits, derivatives, and integrals.", department: "Mathematics", program_id: "demo-program-004", year: 1, created_by: "admin-001", created_at: new Date(Date.now() - 86400000 * 45).toISOString(), updated_at: new Date(Date.now() - 86400000 * 45).toISOString() },
  { id: "demo-course-005", code: "GST 101", name: "Communication Skills", description: "English language, writing, and presentation skills for all students.", department: "General Studies", program_id: null, year: 1, created_by: "admin-001", created_at: new Date(Date.now() - 86400000 * 45).toISOString(), updated_at: new Date(Date.now() - 86400000 * 45).toISOString() },
];

function getCoursesPath() {
  return join(process.cwd(), ".ollin-courses.json");
}

function readDemoCourses() {
  const path = getCoursesPath();
  if (existsSync(path)) {
    try { return JSON.parse(readFileSync(path, "utf-8")); } catch { /* ignore */ }
  }
  writeFileSync(path, JSON.stringify(DEFAULT_COURSES, null, 2));
  return DEFAULT_COURSES;
}

function writeDemoCourses(courses: unknown[]) {
  writeFileSync(getCoursesPath(), JSON.stringify(courses, null, 2));
}

// GET — list all courses
export async function GET(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const programId = request.nextUrl.searchParams.get("program_id") || undefined;

    if (demo) {
      const all = readDemoCourses();
      const courses = !programId ? all : all.filter((c: any) => c.program_id === programId || !c.program_id);
      return NextResponse.json({ courses });
    }

    const { getCourses } = await import("@/lib/data");
    const courses = await getCourses(false, programId);
    return NextResponse.json({ courses });
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
    const demo = request.headers.get("x-demo-mode") === "true";
    const body = await request.json();
    const { code, name, description, department, program_id, year } = body;

    if (!code || !code.trim()) {
      return NextResponse.json({ error: "Course code is required" }, { status: 400 });
    }
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Course name is required" }, { status: 400 });
    }

    if (demo) {
      const courses = readDemoCourses();
      const newCourse = {
        id: `demo-course-${Date.now()}`,
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
      writeDemoCourses(courses);
      return NextResponse.json({ course: newCourse });
    }

    const { createCourse } = await import("@/lib/data");
    const course = await createCourse({ code: code.trim(), name: name.trim(), description, department, program_id }, false);
    return NextResponse.json({ course });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create course" },
      { status: 500 }
    );
  }
}

// DELETE — remove a course
export async function DELETE(request: NextRequest) {
  try {
    const demo = request.headers.get("x-demo-mode") === "true";
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

    if (demo) {
      const courses = readDemoCourses().filter((c: any) => c.id !== id);
      writeDemoCourses(courses);
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
