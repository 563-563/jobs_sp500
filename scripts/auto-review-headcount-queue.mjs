#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const REVIEWER = process.env.REVIEWER || "codex-auto";
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

function shouldApprove(row) {
  const conf = String(row.candidate_confidence || "").toLowerCase();
  if (conf !== "high") return false;
  const quote = String(row.quote || "").toLowerCase();
  if (!quote.includes("employee") && !quote.includes("people")) return false;
  if (!(quote.includes("as of") || quote.includes("we had") || quote.includes("employed"))) return false;
  if (quote.includes("ai and data workforce")) return false;
  if (quote.includes("aepsc had")) return false; // subsidiary-specific
  const val = Number(row.candidate_headcount || 0);
  if (!Number.isFinite(val) || val <= 0) return false;
  return true;
}

function main() {
  const queuePath = latest(/__headcount_verification_queue__/);
  const queue = parseSimpleCsv(readFileSync(queuePath, "utf8"));

  const reviewed = queue.map((r) => {
    if (r.review_status === "needs_research") return r;
    if (shouldApprove(r)) {
      return {
        ...r,
        review_status: "approved",
        verified_headcount: r.candidate_headcount,
        reviewer: REVIEWER,
        reviewed_at: NOW_ISO,
        review_notes: "Auto-approved: high-confidence total employee statement pattern.",
      };
    }
    return {
      ...r,
      review_status: r.review_status === "pending" ? "pending" : r.review_status,
      reviewer: r.reviewer || REVIEWER,
      reviewed_at: r.reviewed_at || NOW_ISO,
      review_notes:
        r.review_notes ||
        "Left pending: not high-confidence total employee statement under strict auto policy.",
    };
  });

  const outPath = path.join(INT_DIR, `${RUN_ID}__headcount_verification_queue_reviewed__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(reviewed, [
      "run_id",
      "ticker",
      "company_name",
      "cik",
      "candidate_headcount",
      "candidate_confidence",
      "citation_id",
      "source_url",
      "filing_date",
      "quote",
      "review_status",
      "verified_headcount",
      "reviewer",
      "reviewed_at",
      "review_notes",
    ]),
    "utf8",
  );

  const approved = reviewed.filter((r) => r.review_status === "approved").length;
  const pending = reviewed.filter((r) => r.review_status === "pending").length;
  const research = reviewed.filter((r) => r.review_status === "needs_research").length;
  console.log(`Wrote reviewed queue: ${outPath}`);
  console.log(`approved=${approved} pending=${pending} needs_research=${research}`);
}

main();

