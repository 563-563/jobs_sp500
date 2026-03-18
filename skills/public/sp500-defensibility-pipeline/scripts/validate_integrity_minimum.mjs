#!/usr/bin/env node

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const LOG_DIR = path.join(ROOT, "data", "logs");
const ARGS = new Set(process.argv.slice(2));
const FAIL_ON_SOURCE_WARN = ARGS.has("--fail-on-source-warn");

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

function countByStatus(rows, value) {
  return rows.filter((r) => String(r.check_status || r.severity || "").toLowerCase() === value)
    .length;
}

function main() {
  const sourceQaPath = latest(LOG_DIR, /__qa_source_ladder__/);
  const methodologyPath = latest(LOG_DIR, /__qa_methodology_v2__/);

  const sourceRows = parseSimpleCsv(readFileSync(sourceQaPath, "utf8"));
  const methodologyRows = parseSimpleCsv(readFileSync(methodologyPath, "utf8"));

  const sourceWarn = countByStatus(sourceRows, "warn");
  const sourceFail = countByStatus(sourceRows, "fail");
  const methodologyFail = countByStatus(methodologyRows, "fail");

  const out = {
    run_id: RUN_ID,
    source_warn: sourceWarn,
    source_fail: sourceFail,
    methodology_fail: methodologyFail,
    fail_on_source_warn: FAIL_ON_SOURCE_WARN,
  };

  console.log(JSON.stringify(out, null, 2));

  const failed =
    sourceFail > 0 || methodologyFail > 0 || (FAIL_ON_SOURCE_WARN && sourceWarn > 0);
  if (failed) process.exit(1);
}

main();
