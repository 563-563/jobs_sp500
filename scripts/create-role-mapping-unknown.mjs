#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");

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

function latest(pattern) {
  const files = readdirSync(INT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (files.length === 0) throw new Error(`No file found for pattern ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function main() {
  const pilotPath = latest(/__pilot\d+_companies__/);
  const pilot = parseSimpleCsv(readFileSync(pilotPath, "utf8"));

  const rows = pilot.map((r, i) => ({
    mapping_id: `MAP-${RUN_ID}-${String(i + 1).padStart(3, "0")}`,
    run_id: RUN_ID,
    ticker: r.ticker,
    evidence_id: "",
    repo_label: "",
    mapped_share_pct: 100,
    mapping_confidence: "unknown",
    mapping_rationale:
      "No auditable role-share distribution was extracted from current filing evidence; workforce share remains explicit unknown.",
    assumption_id: "ASM-003",
  }));

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_mapping_unknown__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(rows, [
      "mapping_id",
      "run_id",
      "ticker",
      "evidence_id",
      "repo_label",
      "mapped_share_pct",
      "mapping_confidence",
      "mapping_rationale",
      "assumption_id",
    ]),
    "utf8",
  );

  console.log(`Wrote unknown role mapping placeholder: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
}

main();

