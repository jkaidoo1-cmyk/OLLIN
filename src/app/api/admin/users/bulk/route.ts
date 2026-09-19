import { NextRequest, NextResponse } from "next/server";
import { readLocalUsers, writeLocalUsers, publicUser, hashPassword } from "@/lib/local-users-store";
import { getSessionAdmin } from "@/lib/session";
import { recordAdminAction } from "@/lib/audit";

/**
 * POST /api/admin/users/bulk — create many accounts at once from CSV text.
 *
 * Accepted row format (header optional, detected by presence of "email"):
 *   email, full name, role, program, year, password
 * e.g.
 *   j.kusi@univ.edu,Kwame Kusi,student,BSc CS,2,S3curePass!
 *
 * Program may be a program id OR its code (e.g. "BSc CS"); resolved server-side.
 * Password is optional — a random one is generated when omitted.
 * Existing emails are skipped (reported in the response, not an error).
 */

interface BulkResult {
  created: Array<{ email: string; full_name: string; role: string; temp_password?: string }>;
  skipped: Array<{ email: string; reason: string }>;
}

function parseCsv(text: string): string[][] {
  // Minimal CSV parser: handles quoted fields with embedded commas.
  const rows: string[][] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const fields: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuotes = false;
        else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(cur.trim()); cur = ""; }
      else cur += ch;
    }
    fields.push(cur.trim());
    rows.push(fields);
  }
  return rows;
}

function randomPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let out = "";
  const bytes = require("crypto").randomBytes(12) as Buffer;
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export async function POST(request: NextRequest) {
  const admin = await getSessionAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  try {
    const body = await request.json();
    const csv = typeof body.csv === "string" ? body.csv : "";
    if (!csv.trim()) {
      return NextResponse.json({ error: "CSV content is required" }, { status: 400 });
    }

    let rows = parseCsv(csv);
    if (rows.length === 0) {
      return NextResponse.json({ error: "No rows found in CSV" }, { status: 400 });
    }

    // Drop a header row if the first line mentions "email"
    if (rows[0].some((c) => c.toLowerCase().includes("email"))) {
      rows = rows.slice(1);
    }

    // Resolve program codes → ids once
    const programMap = new Map<string, string>();
    try {
      const { readFileSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const p = join(process.cwd(), ".ollin-programs.json");
      if (existsSync(p)) {
        for (const prog of JSON.parse(readFileSync(p, "utf-8"))) {
          if (prog?.id) {
            programMap.set(String(prog.id).toLowerCase(), prog.id);
            if (prog?.code) programMap.set(String(prog.code).toLowerCase(), prog.id);
          }
        }
      }
    } catch { /* program resolution optional */ }

    // Supabase program lookup when configured
    try {
      const { createAdminClient } = await import("@/lib/supabase/server");
      const sb = await createAdminClient();
      if (sb) {
        const { data } = await sb.from("programs").select("id, code");
        for (const prog of data || []) {
          programMap.set(String(prog.id).toLowerCase(), prog.id);
          if (prog?.code) programMap.set(String(prog.code).toLowerCase(), prog.id);
        }
      }
    } catch { /* ignore */ }

    const result: BulkResult = { created: [], skipped: [] };
    const users = readLocalUsers();
    const takenEmails = new Set(users.map((u: any) => String(u.email).toLowerCase()));
    let mutated = false;

    for (const row of rows) {
      const [email, fullName, roleRaw, programRaw, yearRaw, passwordRaw] = row;
      const cleanEmail = String(email || "").toLowerCase().trim();
      if (!cleanEmail || !cleanEmail.includes("@")) {
        if (email) result.skipped.push({ email: String(email), reason: "Invalid email" });
        continue;
      }
      if (takenEmails.has(cleanEmail)) {
        result.skipped.push({ email: cleanEmail, reason: "Account already exists" });
        continue;
      }

      const role: "admin" | "student" =
        String(roleRaw || "").toLowerCase() === "admin" ? "admin" : "student";
      const programId = programRaw
        ? programMap.get(String(programRaw).toLowerCase()) || null
        : null;
      const year = yearRaw ? Math.min(8, Math.max(1, parseInt(String(yearRaw), 10) || 1)) : role === "admin" ? undefined : 1;
      const password = passwordRaw && String(passwordRaw).length >= 6 ? String(passwordRaw) : randomPassword();

      const newUser = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        email: cleanEmail,
        full_name: fullName || cleanEmail.split("@")[0],
        role,
        password_hash: hashPassword(password),
        program_id: programId,
        current_year: year,
        created_at: new Date().toISOString(),
      };
      users.push(newUser);
      takenEmails.add(cleanEmail);
      mutated = true;
      result.created.push({
        email: cleanEmail,
        full_name: newUser.full_name,
        role,
        temp_password: password,
      });
    }

    if (mutated) writeLocalUsers(users);

    await recordAdminAction(
      request,
      admin,
      "user.bulk_import",
      "user",
      null,
      `Bulk imported ${result.created.length} account(s), skipped ${result.skipped.length}`
    );

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bulk import failed" },
      { status: 500 }
    );
  }
}
