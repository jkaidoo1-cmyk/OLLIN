#!/usr/bin/env node
/**
 * Push supabase/schema.sql to the Supabase project via the management API.
 * Usage: node scripts/push-schema.mjs
 * Credentials: read from .env.local (NEXT_PUBLIC_SUPABASE_URL + a PAT env var).
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Find the project root (quizai/) by walking up from this script's location
const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SCRIPT_DIR, '..');

// Load .env.local (manual parse — no dotenv dependency)
function loadEnv() {
  const env = { ...process.env };
  const envPath = join(ROOT, '.env.local');
  try {
    for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && !(m[1] in env)) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  } catch {}
  return env;
}

const env = loadEnv();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const PAT = env.SUPABASE_PERSONAL_ACCESS_TOKEN;

if (!url) {
  console.error('✗ NEXT_PUBLIC_SUPABASE_URL not set in .env.local');
  process.exit(2);
}
if (!PAT) {
  console.error('✗ SUPABASE_PERSONAL_ACCESS_TOKEN not set in .env.local');
  console.error('   Create one at https://supabase.com/account/tokens');
  process.exit(2);
}

const ref = url.match(/https:\/\/([^\.]+)\.supabase\.co/)[1];
const sql = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8');

console.log(`Project: ${url}`);
console.log(`Ref:     ${ref}`);
console.log(`SQL:     ${sql.length} bytes`);

const api = `https://api.supabase.com/v1/projects/${ref}/database/query`;
const res = await fetch(api, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${PAT}`,
  },
  body: JSON.stringify({ query: sql }),
});

const body = await res.text();
if (res.status === 201 || res.status === 200) {
  console.log('✓ Schema applied successfully');
  if (body) console.log('Response:', body.slice(0, 200));
} else {
  console.error('✗ Failed — status', res.status);
  console.error(body.slice(0, 500));
  process.exit(1);
}
