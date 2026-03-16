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
  if (!files.length) throw new Error(`No file found for ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function main() {
  const roleMixPath = latest(/__role_mix_candidates__/);
  const suggestionPath = latest(/__role_label_suggestions__/);
  const roleMix = parseSimpleCsv(readFileSync(roleMixPath, "utf8"));
  const suggestions = parseSimpleCsv(readFileSync(suggestionPath, "utf8"));

  const topSuggestionBySignal = new Map(
    suggestions
      .filter((s) => Number(s.suggestion_rank) === 1)
      .map((s) => [s.signal_id, s]),
  );

  const queue = roleMix.map((r, idx) => {
    const top = topSuggestionBySignal.get(r.signal_id);
    return {
      mapping_review_id: `RMR-${RUN_ID}-${String(idx + 1).padStart(3, "0")}`,
      run_id: RUN_ID,
      signal_id: r.signal_id,
      ticker: r.ticker,
      role_phrase: r.role_phrase,
      signal_type: r.signal_type,
      signal_value: r.signal_value,
      implied_share_pct: r.implied_share_pct,
      suggested_repo_label: top?.suggested_repo_label || "",
      suggested_repo_title: top?.suggested_repo_title || "",
      suggested_repo_score: top?.suggested_repo_score || "",
      suggestion_match_score: top?.match_score || "",
      review_status: "pending",
      approved_repo_label: "",
      approved_share_pct: "",
      reviewer: "",
      reviewed_at: "",
      review_notes: "",
      citation_id: r.citation_id,
      quote: r.quote,
    };
  });

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_mapping_review_queue__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(queue, [
      "mapping_review_id",
      "run_id",
      "signal_id",
      "ticker",
      "role_phrase",
      "signal_type",
      "signal_value",
      "implied_share_pct",
      "suggested_repo_label",
      "suggested_repo_title",
      "suggested_repo_score",
      "suggestion_match_score",
      "review_status",
      "approved_repo_label",
      "approved_share_pct",
      "reviewer",
      "reviewed_at",
      "review_notes",
      "citation_id",
      "quote",
    ]),
    "utf8",
  );

  console.log(`Wrote role mapping review queue: ${outPath}`);
  console.log(`Rows: ${queue.length}`);
}

main();

