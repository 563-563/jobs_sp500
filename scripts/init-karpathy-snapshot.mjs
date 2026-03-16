#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const AS_OF_DATE = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");
const RUNS_DIR = path.join(ROOT, "runs");

const COMMIT_URL = "https://api.github.com/repos/karpathy/jobs/commits/master";
const SCORES_URL = "https://raw.githubusercontent.com/karpathy/jobs/master/scores.json";
const OCC_URL = "https://raw.githubusercontent.com/karpathy/jobs/master/occupations.csv";

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INT_DIR, { recursive: true });
mkdirSync(RUNS_DIR, { recursive: true });

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function csvEscape(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

function toCsv(rows, headers) {
  const head = headers.join(",");
  const body = rows.map((row) => headers.map((h) => csvEscape(row[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

function parseSimpleCsv(content) {
  const lines = content.trimEnd().split("\n");
  const headers = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === "," && !inQuotes) {
        cells.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = cells[idx] ?? "";
    });
    return row;
  });
}

function readLatestRunManifest(runId) {
  const files = readdirSync(RUNS_DIR)
    .filter((f) => f.startsWith(`${runId}__run_manifest__`) && f.endsWith(".csv"))
    .sort();
  if (files.length === 0) return null;
  const latest = files[files.length - 1];
  const p = path.join(RUNS_DIR, latest);
  const parsed = parseSimpleCsv(readFileSync(p, "utf8"));
  return { path: p, row: parsed[0] || null };
}

async function main() {
  console.log(`RUN_ID=${RUN_ID} AS_OF_DATE=${AS_OF_DATE}`);

  const [commitRes, scoresRes, occRes] = await Promise.all([
    fetch(COMMIT_URL, { headers: { "User-Agent": "jobs_sp500_research/0.1" } }),
    fetch(SCORES_URL, { headers: { "User-Agent": "jobs_sp500_research/0.1" } }),
    fetch(OCC_URL, { headers: { "User-Agent": "jobs_sp500_research/0.1" } }),
  ]);

  if (!commitRes.ok) throw new Error(`Commit API request failed: ${commitRes.status}`);
  if (!scoresRes.ok) throw new Error(`scores.json request failed: ${scoresRes.status}`);
  if (!occRes.ok) throw new Error(`occupations.csv request failed: ${occRes.status}`);

  const commitJson = await commitRes.json();
  const commitHash = commitJson.sha;
  const commitDate = commitJson?.commit?.author?.date || "";
  const scoresRaw = await scoresRes.text();
  const occupationsRaw = await occRes.text();

  const scoresPath = path.join(
    RAW_DIR,
    `${RUN_ID}__karpathy_scores__${commitHash.slice(0, 12)}__${STAMP}.json`,
  );
  const occPath = path.join(
    RAW_DIR,
    `${RUN_ID}__karpathy_occupations__${commitHash.slice(0, 12)}__${STAMP}.csv`,
  );
  writeFileSync(scoresPath, scoresRaw, "utf8");
  writeFileSync(occPath, occupationsRaw, "utf8");

  const scores = JSON.parse(scoresRaw);
  const scoreRows = scores.map((s) => ({
    run_id: RUN_ID,
    repo_label: s.slug,
    repo_title: s.title,
    repo_score: s.exposure,
    repo_source_doc_id: `SRC-${RUN_ID}-KARPATHY-SCORES`,
    repo_commit_hash: commitHash,
  }));
  const scoresCsv = toCsv(scoreRows, [
    "run_id",
    "repo_label",
    "repo_title",
    "repo_score",
    "repo_source_doc_id",
    "repo_commit_hash",
  ]);
  const scoresOutPath = path.join(
    INT_DIR,
    `${RUN_ID}__karpathy_vulnerability_scores__${commitHash.slice(0, 12)}__${STAMP}.csv`,
  );
  writeFileSync(scoresOutPath, scoresCsv, "utf8");

  const sourceRows = [
    {
      doc_id: `SRC-${RUN_ID}-KARPATHY-SCORES`,
      run_id: RUN_ID,
      source_type: "repo_snapshot",
      source_name: "karpathy/jobs scores.json",
      source_url: SCORES_URL,
      source_version: commitHash,
      accessed_at: NOW_ISO,
      published_at: commitDate,
      local_path: scoresPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(scoresRaw),
    },
    {
      doc_id: `SRC-${RUN_ID}-KARPATHY-OCCUPATIONS`,
      run_id: RUN_ID,
      source_type: "repo_snapshot",
      source_name: "karpathy/jobs occupations.csv",
      source_url: OCC_URL,
      source_version: commitHash,
      accessed_at: NOW_ISO,
      published_at: commitDate,
      local_path: occPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(occupationsRaw),
    },
  ];
  const sourceCsv = toCsv(sourceRows, [
    "doc_id",
    "run_id",
    "source_type",
    "source_name",
    "source_url",
    "source_version",
    "accessed_at",
    "published_at",
    "local_path",
    "checksum_sha256",
  ]);
  const sourcesPath = path.join(INT_DIR, `${RUN_ID}__source_documents_karpathy__${STAMP}.csv`);
  writeFileSync(sourcesPath, sourceCsv, "utf8");

  const prevManifest = readLatestRunManifest(RUN_ID);
  const manifestRow = {
    run_id: RUN_ID,
    as_of_date: AS_OF_DATE,
    started_at: prevManifest?.row?.started_at || NOW_ISO,
    ended_at: NOW_ISO,
    operator_name: prevManifest?.row?.operator_name || "",
    sp500_source_doc_id: prevManifest?.row?.sp500_source_doc_id || "",
    sp500_snapshot_timestamp: prevManifest?.row?.sp500_snapshot_timestamp || "",
    karpathy_jobs_source_doc_id: `SRC-${RUN_ID}-KARPATHY-SCORES`,
    karpathy_jobs_commit_hash: commitHash,
    schema_version: "001_phase1_tables",
    notes: [prevManifest?.row?.notes, `karpathy_snapshot=${commitHash.slice(0, 12)}`]
      .filter(Boolean)
      .join("; "),
  };
  const manifestCsv = toCsv([manifestRow], [
    "run_id",
    "as_of_date",
    "started_at",
    "ended_at",
    "operator_name",
    "sp500_source_doc_id",
    "sp500_snapshot_timestamp",
    "karpathy_jobs_source_doc_id",
    "karpathy_jobs_commit_hash",
    "schema_version",
    "notes",
  ]);
  const manifestPath = path.join(RUNS_DIR, `${RUN_ID}__run_manifest__${STAMP}.csv`);
  writeFileSync(manifestPath, manifestCsv, "utf8");

  console.log(`Wrote score snapshot: ${scoresPath}`);
  console.log(`Wrote occupations snapshot: ${occPath}`);
  console.log(`Wrote vulnerability scores: ${scoresOutPath}`);
  console.log(`Wrote source ledger: ${sourcesPath}`);
  console.log(`Wrote updated run manifest: ${manifestPath}`);
  console.log(`karpathy/jobs commit: ${commitHash}`);
  console.log(`Score rows: ${scoreRows.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

