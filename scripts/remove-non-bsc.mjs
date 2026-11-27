#!/usr/bin/env node
/**
 * Remove every non-BSc programme from the OLLIN catalogue.
 *
 * "Not BSc" = any row whose code doesn't start with BSC, plus the executive
 * certificate block (EXEC-*) which is a separate level anyway.
 *
 * Idempotent: reports what it removed; safe to re-run.
 *
 * Usage:
 *   node scripts/remove-non-bsc.mjs
 *
 * Requires .env.local (NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * same as the seeder.
 */
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

function loadEnv() {
  const envPath = join(ROOT, ".env.local");
  const env = {};
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m) env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  }
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

const { url, key } = loadEnv();

async function rest(path, options = {}) {
  let lastError = null;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const res = await fetch(`${url}/rest/v1${path}`, {
        ...options,
        headers: {
          apikey: key,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
          ...(options.headers || {}),
        },
      });
      let json = null;
      try {
        json = await res.json();
      } catch {
        /* empty body */
      }
      if (!res.ok) {
        throw new Error(`${options.method || "GET"} ${path} → ${res.status} ${JSON.stringify(json).slice(0, 300)}`);
      }
      return json;
    } catch (err) {
      lastError = err;
      const transient = err instanceof TypeError || /fetch failed|network/i.test(err?.message || "");
      if (!transient || attempt === 6) break;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw lastError;
}

function codeToPattern(code) {
  // UMaT codes are like BSC-PME; keep letters and digits, no regex specials.
  const escaped = code.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return escaped.replace(/[A-Za-z0-9]/g, (ch) => `\\${ch}`);
}

const nonBscCodes = [
  // Executive certificates (separate level, not BSc)
  "EXEC-MIN", "EXEC-GET", "EXEC-OHS",
].map((c) => ({ code: c, label: "executive" }));

const allCodes = await rest("/programs?select=code").catch((err) => {
  console.error("Could not list programmes:", err.message);
  process.exit(1);
});

const all = Array.isArray(allCodes) ? allCodes : [];
const target = nonBscCodes.map((item) => item.code);
const matched = all.filter((p) => target.includes(p.code));
const byPrefix = all.filter((p) => p.code && !p.code.startsWith("BSC"));

const toDelete = new Set([...matched, ...byPrefix].map((p) => p.code));
console.log(`Found ${all.length} programmes; ${toDelete.size} are not BSc and will be removed.`);
if (DRY_RUN) {
  console.log("Dry run — nothing removed. Programs that would go:");
  for (const p of all) {
    if (toDelete.has(p.code)) console.log(`  ${p.code}  ${p.name}`);
  }
  process.exit(0);
}

// Delete in batches of 100 to stay under per-request limits.
// The code filter is an `in` list: code=in.(a,b,c).
let deleted = 0;
const codes = Array.from(toDelete);
for (let i = 0; i < codes.length; i += 100) {
  const batch = codes.slice(i, i + 100).join(",");
  const res = await rest(`/programs?code=in.(${batch})`, { method: "DELETE" });
  deleted += 100;
  console.log(`  deleted ${deleted} of ${codes.length}`);
}

const remaining = await rest("/programs?select=code");
console.log(`✓ Removed non-BSc rows. ${Array.isArray(remaining) ? remaining.length : 0} programmes left.`);
