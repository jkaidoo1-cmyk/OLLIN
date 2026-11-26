#!/usr/bin/env node
/**
 * Seed the OLLIN catalogue with the programmes UMaT offers.
 *
 * Source: umat.edu.gh programme pages and UMaT's admission portal
 * (apply.umat.edu.gh/en/programs), retrieved November 2026:
 *   - Undergraduate programmes, Tarkwa campus
 *   - Diploma programmes
 *   - MSc/MPhil/MBTM and MSc Engineering Management
 *   - PhD programmes
 *   - Postgraduate diplomas (PgD / PDEng / PDOHS)
 *   - Certificate programmes (Tarkwa, Essikado, Bibiani) and executive certificates
 *
 * Idempotent: a programme already in the database is matched by code, then by
 * name, and updated in place — so re-running never duplicates a row. Names that
 * already exist under a different code are updated to the canonical code (the
 * row id, and any profile pointing at it, is kept).
 *
 * Also mirrors the result into .ollin-programs.json, which is what local mode
 * reads, so the list is identical in both modes.
 *
 * Usage:
 *   node scripts/seed-umat.mjs            # write Supabase + local file
 *   node scripts/seed-umat.mjs --dry-run  # report what would change
 *
 * Credentials come from .env.local (NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY); process env wins.
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY_RUN = process.argv.includes("--dry-run");

const FMMT = "Faculty of Mining and Minerals Technology";
const FOE = "Faculty of Engineering";
const FCAMS = "Faculty of Computing and Mathematical Sciences";
const FIMS = "Faculty of Integrated Management Studies";
const FGES = "Faculty of Geosciences and Environmental Studies";
const SPETS = "School of Petroleum Studies";
const SPS = "School of Postgraduate Studies";
const ESSIKADO = "Essikado Campus (Sekondi-Takoradi)";
const EXEC = "Executive Certificate Programmes";

/**
 * code, name, department, description
 * Descriptions marked "(portal)" are UMaT's own one-line summaries from the
 * admission portal; the rest describe the level/campus exactly as the
 * programme pages state it.
 */
const PROGRAMS = [
  // ── Undergraduate — Faculty of Mining and Minerals Technology ──────────
  ["BSC-MIN", "BSc Mining Engineering", FMMT, "Master mineral extraction, processing, and sustainable mining operations."],
  ["BSC-MRL", "BSc Minerals Engineering", FMMT, "Process and refine minerals for industrial and commercial applications."],

  // ── Undergraduate — Faculty of Engineering ─────────────────────────────
  ["BSC-MEC", "BSc Mechanical Engineering", FOE, "Design and maintain mechanical systems, machinery, and manufacturing processes."],
  ["BSC-EEE", "BSc Electrical and Electronic Engineering", FOE, "Design electrical systems, electronics, and automation technologies."],
  ["BSC-REN", "BSc Renewable Energy Engineering", FOE, "Develop sustainable energy solutions and green technology systems."],
  ["BSC-TEL", "BSc Telecommunication Engineering", FOE, "New programme in telecommunications systems and networks."],
  ["BSC-CIV", "BSc Civil Engineering", FOE, "Design and construct infrastructure projects and buildings."],
  ["BSC-MEC-TUP", "BSc Mechanical Engineering (Top Up)", FOE, "Top-up degree for diploma and HND holders in mechanical engineering or a related field."],
  ["BSC-EEE-TUP", "BSc Electrical and Electronic Engineering (Top Up)", FOE, "Top-up degree for diploma and HND holders in electrical and electronic engineering or a related field."],
  ["BSC-SPV", "BSc Solar Photovoltaic and Solar Thermal Systems", FOE, "Design and implement solar energy technologies."],
  ["DIP-PME", "Diploma in Plant and Maintenance Engineering", FOE, "Diploma programme in plant and maintenance engineering."],
  ["DIP-EEE", "Diploma in Electrical and Electronic Engineering", FOE, "Diploma programme in electrical and electronic engineering."],

  // ── Undergraduate — Faculty of Computing and Mathematical Sciences ─────
  ["BSC-CYS", "BSc Cyber Security", FCAMS, "Protect digital systems and networks from cyber threats."],
  ["BSC-CSE", "BSc Computer Science and Engineering", FCAMS, "Create software solutions and computing systems for diverse industries."],
  ["BSC-IST", "BSc Information Systems and Technology", FCAMS, "Develop and manage information technology solutions."],
  ["BSC-MTH", "BSc Mathematics", FCAMS, "Develop analytical and problem-solving skills for various scientific and engineering applications."],
  ["BSC-MTF", "BSc Mathematics and Finance", FCAMS, "Combine mathematical modeling with financial analysis for investment and risk management."],
  ["BSC-SDS", "BSc Statistical Data Science", FCAMS, "Analyze data and develop statistical models for decision-making."],
  ["BSC-DSA", "BSc Data Science and Analytics", FCAMS, "Extract insights from data using advanced analytical techniques."],
  ["BSC-RAI", "BSc Robotics Engineering and Artificial Intelligence", FCAMS, "Design intelligent robotic systems and AI-powered automation solutions."],

  // ── Undergraduate — Faculty of Integrated Management Studies ───────────
  ["BSC-LTM", "BSc Logistics and Transport Management", FIMS, "Optimize supply chains and transportation systems."],
  ["BSC-EIO", "BSc Economics and Industrial Organisation", FIMS, "Study economic principles and industrial management strategies."],
  ["BSC-FDS", "BSc Finance and Data Science", FIMS, "New programme combining finance with data science."],

  // ── Undergraduate — Faculty of Geosciences and Environmental Studies ───
  ["BSC-GMT", "BSc Geomatic Engineering", FGES, "Learn surveying, mapping, and spatial data management for infrastructure development."],
  ["BSC-GEO", "BSc Geological Engineering", FGES, "Study earth materials and processes for resource exploration and environmental assessment."],
  ["BSC-SPL", "BSc Spatial Planning", FGES, "Plan and design sustainable urban and regional development."],
  ["BSC-ESE", "BSc Environmental and Safety Engineering", FGES, "Ensure workplace safety and environmental protection in industrial settings."],
  ["BSC-LAIS", "BSc Land Administration and Information Systems", FGES, "Manage land records and property information systems."],
  ["DIP-GDR", "Diploma in General Drilling", FGES, "Fee-paying diploma programme in general drilling."],

  // ── Undergraduate — School of Petroleum Studies ────────────────────────
  ["BSC-PET", "BSc Petroleum Engineering", SPETS, "Specialize in oil and gas exploration, production, and reservoir management. Fee-paying programme."],
  ["BSC-NGE", "BSc Natural Gas Engineering", SPETS, "Manage natural gas extraction, processing, and distribution systems."],
  ["BSC-PGE", "BSc Petroleum Geosciences and Engineering", SPETS, "Combine geology and engineering for petroleum exploration and development."],
  ["BSC-PRP", "BSc Petroleum Refining and Petrochemical Engineering", SPETS, "Process crude oil into fuels and chemical products."],
  ["BSC-CHE", "BSc Chemical Engineering", SPETS, "Design chemical processes and industrial manufacturing systems."],

  // ── Postgraduate — MSc / MPhil ────────────────────────────────────────
  ["MSC-GMT", "MSc Geomatic Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-GMT", "MPhil Geomatic Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-GEO", "MSc Geological Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-GEO", "MPhil Geological Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-MIN", "MSc Mining Engineering", SPS, "Taught-plus-research master's with options in rock mechanics, mine planning and design, exploration and blasting technology, mine machinery, mine health, safety and environment, mine economics and evaluation, and mineral resource management."],
  ["MPHIL-MIN", "MPhil Mining Engineering", SPS, "Research master's with limited taught courses; same option areas as the MSc."],
  ["MSC-MRL", "MSc Minerals Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-MRL", "MPhil Minerals Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-PET", "MSc Petroleum Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-PET", "MPhil Petroleum Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-PRP", "MSc Petroleum Refining and Petrochemical Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-PRP", "MPhil Petroleum Refining and Petrochemical Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-ENV", "MSc Environmental Engineering (Weekend)", SPS, "Weekend master's combining taught courses and research."],
  ["MPHIL-ENV", "MPhil Environmental Engineering (Weekend)", SPS, "Weekend research master's with limited taught courses."],
  ["MSC-OHS", "MSc Occupational Health and Safety (Weekend)", SPS, "Weekend master's combining taught courses and research."],
  ["MPHIL-OHS", "MPhil Occupational Health and Safety (Weekend)", SPS, "Weekend research master's with limited taught courses."],
  ["MSC-MEC", "MSc Mechanical Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-MEC", "MPhil Mechanical Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-EEE", "MSc Electrical and Electronic Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-EEE", "MPhil Electrical and Electronic Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-CSE", "MSc Computer Science and Engineering", SPS, "Master of Science combining taught courses and research."],
  ["MPHIL-CSE", "MPhil Computer Science and Engineering", SPS, "Master of Philosophy based on research with limited taught courses."],
  ["MSC-MTH", "MSc Mathematics", SPS, "Taught-plus-research master's with specialisation in computational mathematics, statistics or financial engineering."],
  ["MPHIL-MTH", "MPhil Mathematics", SPS, "Research master's with specialisation in computational mathematics, statistics or financial engineering."],

  // ── Postgraduate — management ─────────────────────────────────────────
  ["MSC-EMG", "MSc Engineering Management", SPS, "Weekend master's programme for engineering and technology graduates."],
  ["MBTM-FIN", "MBTM Finance and Investment", SPS, "Master of Business and Technology Management, weekend programme."],
  ["MBTM-SCM", "MBTM Supply Chain Management", SPS, "Master of Business and Technology Management, weekend programme."],
  ["MBTM-MIS", "MBTM Management Information Systems", SPS, "Master of Business and Technology Management, weekend programme."],
  ["MBTM-HRM", "MBTM Strategic Human Resource Management", SPS, "Master of Business and Technology Management, weekend programme."],

  // ── Postgraduate — PhD ────────────────────────────────────────────────
  ["PHD-GMT", "PhD Geomatic Engineering", SPS, "Doctoral research programme."],
  ["PHD-GEO", "PhD Geological Engineering", SPS, "Doctoral research programme."],
  ["PHD-MIN", "PhD Mining Engineering", SPS, "Doctoral research programme."],
  ["PHD-MRL", "PhD Minerals Engineering", SPS, "Doctoral research programme."],
  ["PHD-PET", "PhD Petroleum Engineering", SPS, "Doctoral research programme."],
  ["PHD-PRP", "PhD Petroleum Refining and Petrochemical Engineering", SPS, "Doctoral research programme."],
  ["PHD-ENV", "PhD Environmental Engineering", SPS, "Doctoral research programme."],
  ["PHD-OHS", "PhD Occupational Health and Safety", SPS, "Doctoral research programme."],
  ["PHD-MEC", "PhD Mechanical Engineering", SPS, "Doctoral research programme."],
  ["PHD-EEE", "PhD Electrical and Electronic Engineering", SPS, "Doctoral research programme."],
  ["PHD-MTH", "PhD Mathematics", SPS, "Doctoral research programme."],

  // ── Postgraduate diplomas ─────────────────────────────────────────────
  ["PGD-MIN", "PgD Mining Engineering", SPS, "Postgraduate Diploma in Mining Engineering."],
  ["PGD-MRL", "PgD Minerals Engineering", SPS, "Postgraduate Diploma in Minerals Engineering."],
  ["PDENG-ENV", "PDEng Environmental Engineering", SPS, "Postgraduate Diploma in Engineering (Environmental Engineering)."],
  ["PDOHS-OHS", "PDOHS Occupational Health and Safety", SPS, "Postgraduate Diploma in Occupational Health and Safety."],

  // ── Certificates — Faculty of Engineering ─────────────────────────────
  ["CERT-PME", "Certificate in Plant and Maintenance Engineering", FOE, "Weekend certificate programme."],
  ["CERT-ET", "Certificate in Electrical Technology", FOE, "Weekend certificate programme; also offered at the Essikado campus."],
  ["CERT-ENT", "Certificate in Engineering Technology", FOE, "Certificate programme for industry partners only."],
  ["CERT-BIO", "Certificate in Bioenergy", FOE, "Weekend certificate programme."],
  ["CERT-SPV", "Certificate in Solar Photovoltaic and Solar Thermal Systems", FOE, "Weekend certificate programme."],

  // ── Certificates — Faculty of Computing and Mathematical Sciences ─────
  ["CERT-AST", "Certificate in Applied Statistics", FCAMS, "Weekend certificate programme."],
  ["CERT-CYS", "Certificate in Cyber Security", FCAMS, "Weekend certificate programme."],
  ["CERT-DAML", "Certificate in Data Analytics and Machine Learning", FCAMS, "Weekend certificate programme; also offered at the Essikado campus."],
  ["CERT-IST", "Certificate in Information Systems and Technology", FCAMS, "Weekend certificate programme; also offered at the Essikado campus."],
  ["CERT-NSA", "Certificate in Network and Systems Administration", FCAMS, "Weekend certificate programme."],
  ["CERT-SWD", "Certificate in Software Development", FCAMS, "Weekend certificate programme."],

  // ── Certificates — Faculty of Geosciences and Environmental Studies ───
  ["CERT-SVM", "Certificate in Survey and Mapping", FGES, "Weekend certificate programme; offered at Tarkwa, Essikado and Bibiani campuses."],
  ["CERT-DOA", "Certificate in Drone Operations and Applications", FGES, "Weekend certificate programme."],
  ["CERT-WTR", "Certificate in Water Resources", FGES, "Weekend certificate programme."],
  ["CERT-GAS", "Certificate in Geological Assistantship", FGES, "Weekend certificate programme; offered at Tarkwa, Essikado and Bibiani campuses."],
  ["CERT-ENVS", "Certificate in Environmental Studies", FGES, "Weekend certificate programme."],
  ["CERT-OHS", "Certificate in Occupational Health and Safety", FGES, "Weekend certificate programme; offered at Tarkwa, Essikado and Bibiani campuses."],

  // ── Certificates — Faculty of Mining and Minerals Technology ──────────
  ["CERT-SUM", "Certificate in Surface and Underground Mining", FMMT, "Weekend certificate programme; also offered at the Bibiani campus."],
  ["CERT-MRT", "Certificate in Minerals Technology", FMMT, "Weekend certificate programme; also offered at the Bibiani campus."],
  ["CERT-MJT", "Certificate in Metal Smithing and Jewellery Technology", FMMT, "Weekend certificate programme."],

  // ── Certificates — Faculty of Integrated Management Studies ───────────
  ["CERT-ENG", "Certificate in English (for Non-English Speaking Applicants)", FIMS, "Weekend certificate programme."],
  ["CERT-FRN", "Certificate in French", FIMS, "Weekend certificate programme."],
  ["CERT-SSMQ", "Certificate in Small Scale Mine and Quarry Administration", FIMS, "Weekend certificate programme."],

  // ── Certificates — School of Petroleum Studies ────────────────────────
  ["CERT-DFT", "Certificate in Drilling Fluids Technology", SPETS, "Weekend certificate programme."],
  ["CERT-NGT", "Certificate in Natural Gas Technology", SPETS, "Weekend certificate programme."],
  ["CERT-OWC", "Certificate in Oil Well Cementing Technology", SPETS, "Weekend certificate programme."],
  ["CERT-BRM", "Certificate in Basic Reservoir Management", SPETS, "Weekend certificate programme."],
  ["CERT-PSE", "Certificate in Process Safety and Engineering", SPETS, "Weekend certificate programme."],
  ["CERT-CTECH", "Certificate in Chemical Technology", SPETS, "Weekend certificate programme."],

  // ── Certificates — Essikado campus additions ──────────────────────────
  ["CERT-WF", "Certificate in Welding and Fabrication", ESSIKADO, "Certificate programme at the Essikado campus, Sekondi-Takoradi."],
  ["CERT-LOC", "Certificate in Locomotive Engineering", ESSIKADO, "Certificate programme at the Essikado campus, Sekondi-Takoradi."],
  ["CERT-SIG", "Certificate in Signalling and Telecommunication", ESSIKADO, "Certificate programme at the Essikado campus, Sekondi-Takoradi."],
  ["CERT-RPO", "Certificate in Railway Planning and Operations", ESSIKADO, "Certificate programme at the Essikado campus, Sekondi-Takoradi."],
  ["CERT-GTT", "Certificate in Geotechnical Technology", ESSIKADO, "Certificate programme at the Essikado campus, Sekondi-Takoradi."],

  // ── Executive certificates ────────────────────────────────────────────
  ["EXEC-MIN", "Executive Certificate in Mining Technology", EXEC, "Regular stream (6–12 months, Saturdays) or special stream (2–4 weeks)."],
  ["EXEC-GET", "Executive Certificate in Gold Extraction Technology", EXEC, "Regular stream (6–12 months, Saturdays) or special stream (2–4 weeks)."],
  ["EXEC-OHS", "Executive Certificate in Occupational Health and Safety", EXEC, "Regular stream (6–12 months, Saturdays) or special stream (2–4 weeks)."],
].map(([code, name, department, description]) => ({ code, name, department, description }));

// ─── Credentials ──────────────────────────────────────────────────────

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
  // The connection here comes and goes; a transient failure must not abort a
  // 115-row seed halfway through.
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

const normName = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");

// ─── Supabase ─────────────────────────────────────────────────────────

async function seedSupabase() {
  if (!url || !key) {
    console.log("• Supabase not configured in .env.local — skipping the database.");
    return { inserted: 0, updated: 0, skipped: true };
  }

  const existing = await rest("/programs?select=id,code,name,department,description");
  const byCode = new Map(existing.map((p) => [String(p.code).toUpperCase(), p]));
  const byName = new Map(existing.map((p) => [normName(p.name), p]));

  let inserted = 0;
  let updated = 0;
  let unchanged = 0;
  const failed = [];

  // Sequential and spaced out: this project's connection drops when a burst of
  // writes follows each other too closely.
  for (const program of PROGRAMS) {
    const match = byCode.get(program.code) || byName.get(normName(program.name));
    const payload = {
      code: program.code,
      name: program.name,
      department: program.department,
      description: program.description,
    };

    if (match) {
      const same =
        match.code === payload.code &&
        match.name === payload.name &&
        (match.department || null) === payload.department &&
        (match.description || null) === payload.description;
      if (same) {
        unchanged += 1;
        continue;
      }
      try {
        if (!DRY_RUN) await rest(`/programs?id=eq.${match.id}`, { method: "PATCH", body: JSON.stringify(payload) });
        console.log(`  ~ ${match.code} → ${payload.code}  ${payload.name}`);
        updated += 1;
      } catch (err) {
        failed.push({ program, id: match.id, message: err.message });
      }
    } else {
      try {
        if (!DRY_RUN) await rest("/programs", { method: "POST", body: JSON.stringify(payload) });
        inserted += 1;
      } catch (err) {
        failed.push({ program, id: null, message: err.message });
      }
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  // Second pass for rows the connection dropped: everything above is matched by
  // code, so re-running a failed row is safe.
  if (failed.length && !DRY_RUN) {
    console.log(`  … retrying ${failed.length} row(s) that the connection dropped`);
    await new Promise((r) => setTimeout(r, 3000));
    const stillFailing = [];
    for (const item of failed) {
      const payload = {
        code: item.program.code,
        name: item.program.name,
        department: item.program.department,
        description: item.program.description,
      };
      try {
        if (item.id) {
          await rest(`/programs?id=eq.${item.id}`, { method: "PATCH", body: JSON.stringify(payload) });
          updated += 1;
        } else {
          await rest("/programs", { method: "POST", body: JSON.stringify(payload) });
          inserted += 1;
        }
      } catch (err) {
        stillFailing.push(`${item.program.code} (${err.message})`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    if (stillFailing.length) {
      console.log(`  ✗ could not write: ${stillFailing.length} row(s)`);
      for (const line of stillFailing) console.log(`      ${line}`);
    }
  }

  console.log(
    `• Supabase: ${inserted} inserted, ${updated} updated, ${unchanged} already current${DRY_RUN ? " (dry run)" : ""}.`
  );
  return { inserted, updated, unchanged };
}

// ─── Local-mode store ─────────────────────────────────────────────────

const LOCAL_PATH = join(ROOT, ".ollin-programs.json");

function seedLocalFile() {
  const current = existsSync(LOCAL_PATH)
    ? (() => {
        try {
          const parsed = JSON.parse(readFileSync(LOCAL_PATH, "utf8"));
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      })()
    : [];

  const byCode = new Map(current.map((p) => [String(p.code || "").toUpperCase(), p]));
  const byName = new Map(current.map((p) => [normName(p.name), p]));
  let added = 0;
  let touched = 0;

  for (const program of PROGRAMS) {
    const match = byCode.get(program.code) || byName.get(normName(program.name));
    if (match) {
      const changed =
        match.code !== program.code ||
        match.name !== program.name ||
        (match.department || null) !== program.department ||
        (match.description || null) !== program.description;
      if (!changed) continue;
      match.code = program.code;
      match.name = program.name;
      match.department = program.department;
      match.description = program.description;
      match.updated_at = new Date().toISOString();
      touched += 1;
      continue;
    }
    const row = {
      id: `local-program-umat-${program.code.toLowerCase()}`,
      code: program.code,
      name: program.name,
      department: program.department,
      description: program.description,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    current.push(row);
    byCode.set(program.code, row);
    byName.set(normName(program.name), row);
    added += 1;
  }

  if (!DRY_RUN) {
    const kept = current.filter((p) => PROGRAMS.some((x) => x.code === p.code) || p.id?.startsWith("local-program-umat-") || true);
    writeFileSync(LOCAL_PATH, JSON.stringify(kept, null, 2) + "\n");
  }
  console.log(`• Local file: ${added} added, ${touched} updated, ${current.length} total${DRY_RUN ? " (dry run)" : ""}.`);
}

// ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`UMaT programme catalogue → ${PROGRAMS.length} programmes\n`);
  if (url && key) console.log(`  database: ${url.slice(0, 32)}…`);
  console.log("");

  await seedSupabase();
  seedLocalFile();

  if (url && key && !DRY_RUN) {
    const rows = await rest("/programs?select=code&order=code");
    console.log(`\n✓ ${rows.length} programmes now in the database.`);
  }
}

main().catch((err) => {
  console.error("\nSeeding failed:", err.message);
  process.exit(1);
});
