#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const REVIEWER = process.env.REVIEWER || "codex-auto-v2";
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

function approveRule(row) {
  const ticker = String(row.ticker || "");
  const phrase = String(row.role_phrase_raw || "").toLowerCase();
  const quote = String(row.quote || "").toLowerCase();
  const implied = Number(row.implied_share_pct || 0);

  // ADI clear count-based engineering disclosure
  if (
    ticker === "ADI" &&
    phrase.includes("engineering") &&
    quote.includes("of whom approximately") &&
    implied >= 30
  ) {
    return {
      approved: true,
      label: "computer-hardware-engineers",
      share: implied.toFixed(2),
      confidence: "narrow",
      note: "Auto-approved: explicit role count within total headcount disclosure.",
    };
  }

  // AKAM grouped role percentages with overall population context
  if (ticker === "AKAM" && quote.includes("overall population")) {
    if (phrase.includes("engineering") || phrase.includes("research and development")) {
      return {
        approved: true,
        label: "software-developers",
        share: implied.toFixed(2),
        confidence: "narrow",
        note: "Auto-approved: grouped workforce percentage for engineering/R&D.",
      };
    }
    if (phrase.includes("services and support")) {
      return {
        approved: true,
        label: "computer-support-specialists",
        share: implied.toFixed(2),
        confidence: "narrow",
        note: "Auto-approved: grouped workforce percentage for services/support.",
      };
    }
  }

  return { approved: false };
}

function main() {
  const adjPath = latest(/__role_mapping_adjudication_v2__/);
  const rows = parseSimpleCsv(readFileSync(adjPath, "utf8"));

  const reviewed = rows.map((r) => {
    const rule = approveRule(r);
    if (!rule.approved) {
      return {
        ...r,
        review_status: r.review_status === "pending" ? "pending" : r.review_status,
        reviewer: r.reviewer || REVIEWER,
        reviewed_at: r.reviewed_at || NOW_ISO,
        review_notes: r.review_notes || "Left pending by strict auto-adjudication policy.",
      };
    }
    return {
      ...r,
      review_status: "approved",
      approved_repo_label: rule.label,
      approved_share_pct: rule.share,
      mapping_confidence: rule.confidence,
      reviewer: REVIEWER,
      reviewed_at: NOW_ISO,
      review_notes: rule.note,
    };
  });

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_mapping_adjudication_v2_reviewed__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(reviewed, [
      "adjudication_id",
      "run_id",
      "mapping_review_id",
      "signal_id",
      "ticker",
      "role_phrase_raw",
      "signal_type",
      "signal_value",
      "implied_share_pct",
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

  const approved = reviewed.filter((r) => String(r.review_status).toLowerCase() === "approved").length;
  console.log(`Wrote reviewed adjudication v2: ${outPath}`);
  console.log(`Approved rows: ${approved}`);
}

main();

