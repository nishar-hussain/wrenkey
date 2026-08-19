#!/usr/bin/env node
/**
 * Apply the Bullet database schema to Supabase via the SQL API.
 *
 * Usage:
 *   node scripts/apply-schema.mjs           # reads env from ../.env
 *   node scripts/apply-schema.mjs --dry-run  # print SQL without executing
 *
 * Requirements:
 *   - SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in bullet/.env
 *   - Node.js 18+ (fetch is built-in)
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const dryRun = process.argv.includes("--dry-run");

// ── Load env ─────────────────────────────────────────────────────────────────
function loadEnvFile(file) {
  try {
    fs.readFileSync(file, "utf8")
      .split("\n")
      .forEach((line) => {
        const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
      });
  } catch { /* file absent */ }
}
loadEnvFile(path.join(REPO_ROOT, ".env"));

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("✗ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
  process.exit(1);
}

// ── Load schema SQL ───────────────────────────────────────────────────────────
const schemaPath = path.join(REPO_ROOT, "backend", "sql", "schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

if (dryRun) {
  console.log("── SQL to execute (dry-run) ───────────────────────────────────\n");
  console.log(sql);
  console.log("\n── End of SQL ────────────────────────────────────────────────");
  process.exit(0);
}

// ── Execute via Supabase SQL endpoint ─────────────────────────────────────────
// The /rest/v1/rpc endpoint can't run arbitrary SQL, so we use the
// pg-query API at /pg/query which accepts a POST with { query: "..." }.
// If that's not available, we fall back to the database connection pooler.

const PROJECT_REF = SUPABASE_URL.match(/https?:\/\/([a-z0-9]+)\.supabase\.co/)?.[1] ?? "";

async function applyViaPgApi() {
  const url = `${SUPABASE_URL}/pg/query`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`pg/query returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function applyViaRest() {
  // Split into individual statements and run each via a temp function.
  // Supabase REST doesn't support multi-statement, so we wrap in DO block.
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "apikey": SERVICE_KEY,
    },
    body: JSON.stringify({ sql }),
  });
  if (!res.ok) throw new Error(`exec_sql RPC not found (${res.status})`);
  return res.json();
}

async function main() {
  console.log(`Bullet schema migration`);
  console.log(`  Target:  ${SUPABASE_URL}`);
  console.log(`  Project: ${PROJECT_REF}`);
  console.log(`  Mode:    ${dryRun ? "DRY RUN" : "APPLY"}`);
  console.log("");

  try {
    let result;
    try {
      result = await applyViaPgApi();
      console.log("✓ Schema applied via /pg/query");
    } catch (pgErr) {
      console.log(`/pg/query failed (${pgErr.message}), trying exec_sql RPC...`);
      result = await applyViaRest();
      console.log("✓ Schema applied via exec_sql RPC");
    }
  } catch (e) {
    console.error("✗ Could not apply schema automatically.");
    console.error("");
    console.error("  The Supabase REST API does not support running");
    console.error("  arbitrary SQL from a script. You have two options:");
    console.error("");
    console.error("  Option 1 — Install Supabase CLI (recommended):");
    console.error("    brew install supabase/tap/supabase");
    console.error("    supabase link --project-ref zycgtxsxnxwkxookawkl");
    console.error("    npx supabase db execute < backend/sql/schema.sql");
    console.error("");
    console.error("  Option 2 — Run the SQL in Supabase Dashboard:");
    console.error(`    Open: https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new`);
    console.error(`    File: ${schemaPath}`);
    console.error("    Paste the SQL and click Run.");
    console.error("");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});