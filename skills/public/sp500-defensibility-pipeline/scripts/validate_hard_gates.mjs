#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const INT_DIR = path.join(ROOT, "data", "intermediate");
const LOG_DIR = path.join(ROOT, "data", "logs");

function parseSimpleCsv(content) {
  const trimmed = content.trimEnd();
  if (!trimmed) return [];
  const lines = trimmed.split("\n");
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

function latest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found in ${dir} for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function countByStatus(rows, field, target) {
  return rows.filter((r) => String(r[field] || "").toLowerCase() === target).length;
}

function main() {
  const confidencePath = latest(OUT_DIR, /__confidence_pipeline_status__/);
  const summaryPath = latest(OUT_DIR, /__initial_results_25_summary__/);
  const mappingPath = latest(INT_DIR, /__role_mapping_adjudication_v2_reviewed__/);
  const externalPath = latest(INT_DIR, /__external_role_evidence_queue__/);
  const sourceQaPath = latest(LOG_DIR, /__qa_source_ladder__/);
  const methodologyQaPath = latest(LOG_DIR, /__qa_methodology_v2__/);

  const confidenceRows = parseSimpleCsv(readFileSync(confidencePath, "utf8"));
  const summaryRows = parseSimpleCsv(readFileSync(summaryPath, "utf8"));
  const mappingRows = parseSimpleCsv(readFileSync(mappingPath, "utf8"));
  const externalRows = parseSimpleCsv(readFileSync(externalPath, "utf8"));
  const sourceQaRows = parseSimpleCsv(readFileSync(sourceQaPath, "utf8"));
  const methodologyRows = parseSimpleCsv(readFileSync(methodologyQaPath, "utf8"));

  const universe = summaryRows.length;
  const mediumHigh = confidenceRows.filter(
    (r) => String(r.defensibility_status || "") === "medium_high_confidence",
  ).length;
  const published = summaryRows.filter(
    (r) => String(r.stage || "") === "published_score",
  ).length;
  const conservative = summaryRows.filter(
    (r) => String(r.ai_vulnerability_score_v2 || "").trim() !== "",
  ).length;
  const pendingMapping = countByStatus(mappingRows, "review_status", "pending");
  const pendingResearch = countByStatus(externalRows, "review_status", "pending_research");
  const sourceWarn = countByStatus(sourceQaRows, "check_status", "warn");
  const sourceFail = countByStatus(sourceQaRows, "check_status", "fail");
  const methodologyFail = countByStatus(methodologyRows, "check_status", "fail");

  const gates = {
    universe,
    medium_high_confidence: `${mediumHigh}/${universe}`,
    published_score: `${published}/${universe}`,
    conservative_score: `${conservative}/${universe}`,
    pending_mapping: pendingMapping,
    pending_research: pendingResearch,
    source_warn: sourceWarn,
    source_fail: sourceFail,
    methodology_fail: methodologyFail,
  };

  console.log(JSON.stringify(gates, null, 2));

  const failed =
    mediumHigh !== universe ||
    published !== universe ||
    conservative !== universe ||
    pendingMapping !== 0 ||
    pendingResearch !== 0 ||
    sourceWarn !== 0 ||
    sourceFail !== 0 ||
    methodologyFail !== 0;

  if (failed) process.exit(1);
}

main();

