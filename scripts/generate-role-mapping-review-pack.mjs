#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW = new Date();
const STAMP = NOW.toISOString().replaceAll(":", "-");
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");

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

function latest(pattern) {
  const files = readdirSync(INT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found for ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function main() {
  const queuePath = latest(/__role_mapping_review_queue__/);
  const rows = parseSimpleCsv(readFileSync(queuePath, "utf8"));

  const lines = [];
  lines.push(`# Role Mapping Review Pack (${RUN_ID})`);
  lines.push("");
  lines.push(`Generated: ${NOW.toISOString()}`);
  lines.push(`Rows: ${rows.length}`);
  lines.push("");

  for (const r of rows) {
    lines.push(`- **${r.ticker}**`);
    lines.push(`  signal: ${r.signal_type}=${r.signal_value}; implied_share_pct=${r.implied_share_pct}`);
    lines.push(`  role phrase: ${r.role_phrase}`);
    lines.push(`  suggested label: ${r.suggested_repo_label} (${r.suggested_repo_title})`);
    lines.push(`  suggested exposure score: ${r.suggested_repo_score}`);
    lines.push(`  citation: ${r.citation_id}`);
    lines.push(`  quote: "${r.quote}"`);
    lines.push("");
  }

  lines.push("## Reviewer Steps");
  lines.push("");
  lines.push("1. In the queue CSV, set `review_status` to `approved`, `rejected`, or `needs_research`.");
  lines.push("2. For approved rows, set `approved_repo_label` and `approved_share_pct`.");
  lines.push("3. Fill `reviewer`, `reviewed_at`, and `review_notes`.");

  const outPath = path.join(OUT_DIR, `${RUN_ID}__role_mapping_review_pack__${STAMP}.md`);
  writeFileSync(outPath, lines.join("\n"), "utf8");
  console.log(`Wrote role mapping review pack: ${outPath}`);
}

main();

