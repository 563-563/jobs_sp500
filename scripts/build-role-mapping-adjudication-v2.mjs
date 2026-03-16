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

function normalizeBucket(rolePhrase) {
  const r = String(rolePhrase || "").toLowerCase();
  if (r.includes("engineer")) return "engineering";
  if (r.includes("sales")) return "sales";
  if (r.includes("marketing")) return "marketing";
  if (r.includes("manufactur")) return "manufacturing";
  if (r.includes("operation")) return "operations";
  if (r.includes("research")) return "research";
  if (r.includes("customer")) return "customer_support";
  if (r.includes("product")) return "product";
  return "unknown";
}

function initialConfidence(row) {
  const match = Number(row.suggestion_match_score || 0);
  const phrase = String(row.role_phrase || "").toLowerCase();
  const title = String(row.suggested_repo_title || "").toLowerCase();
  if (!row.suggested_repo_label) return "unknown";
  if (phrase.includes("engineering") && title.includes("engineers")) return "narrow";
  if (match >= 6) return "narrow";
  if (match >= 3) return "broad";
  return "unknown";
}

function main() {
  const reviewQueuePath = latest(/__role_mapping_review_queue__/);
  const rows = parseSimpleCsv(readFileSync(reviewQueuePath, "utf8"));

  const out = rows.map((r, i) => {
    const bucket = normalizeBucket(r.role_phrase);
    const conf = initialConfidence(r);
    return {
      adjudication_id: `ADJ-${RUN_ID}-${String(i + 1).padStart(3, "0")}`,
      run_id: RUN_ID,
      mapping_review_id: r.mapping_review_id,
      signal_id: r.signal_id,
      ticker: r.ticker,
      role_phrase_raw: r.role_phrase,
      normalized_role_bucket: bucket,
      suggested_repo_label: r.suggested_repo_label,
      suggested_repo_title: r.suggested_repo_title,
      suggested_repo_score: r.suggested_repo_score,
      mapping_confidence: conf,
      confidence_rationale:
        conf === "narrow"
          ? "Phrase and suggested label semantically aligned."
          : conf === "broad"
            ? "Lexical overlap present but semantic specificity limited."
            : "Insufficient signal for reliable mapping.",
      review_status: "pending",
      approved_repo_label: "",
      approved_share_pct: "",
      reviewer: "",
      reviewed_at: "",
      review_notes: "",
      citation_id: r.citation_id,
      quote: r.quote,
      created_at: NOW_ISO,
    };
  });

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_mapping_adjudication_v2__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(out, [
      "adjudication_id",
      "run_id",
      "mapping_review_id",
      "signal_id",
      "ticker",
      "role_phrase_raw",
      "normalized_role_bucket",
      "suggested_repo_label",
      "suggested_repo_title",
      "suggested_repo_score",
      "mapping_confidence",
      "confidence_rationale",
      "review_status",
      "approved_repo_label",
      "approved_share_pct",
      "reviewer",
      "reviewed_at",
      "review_notes",
      "citation_id",
      "quote",
      "created_at",
    ]),
    "utf8",
  );

  console.log(`Wrote role mapping adjudication v2: ${outPath}`);
  console.log(`Rows: ${out.length}`);
}

main();

