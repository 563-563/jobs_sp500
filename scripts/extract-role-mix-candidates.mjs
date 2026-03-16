#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const INT_DIR = path.join(ROOT, "data", "intermediate");

const ROLE_KEYWORDS = [
  "engineering",
  "sales",
  "marketing",
  "operations",
  "manufacturing",
  "research",
  "development",
  "corporate",
  "customer service",
  "product",
];

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
  if (!files.length) throw new Error(`No file for ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function detectRoleKeyword(text) {
  const lower = text.toLowerCase();
  return ROLE_KEYWORDS.find((k) => lower.includes(k)) || "";
}

function extractSignals(quote) {
  const signals = [];
  const q = quote;
  const roleKeyword = detectRoleKeyword(q);
  if (!roleKeyword) return signals;

  const countPattern = /of whom(?: approximately)? ([\d,]+) are in ([a-zA-Z\-\s]+?) roles?/i;
  const countMatch = q.match(countPattern);
  if (countMatch) {
    signals.push({
      signal_type: "count",
      signal_value: Number(countMatch[1].replaceAll(",", "")),
      role_phrase: countMatch[2].trim(),
      role_keyword: roleKeyword,
    });
  }

  const pctPattern = /(\d+(?:\.\d+)?)%\s+(?:are\s+)?in\s+([a-zA-Z\-\s]+?)\b/i;
  const pctMatch = q.match(pctPattern);
  if (pctMatch) {
    signals.push({
      signal_type: "pct",
      signal_value: Number(pctMatch[1]),
      role_phrase: pctMatch[2].trim(),
      role_keyword: roleKeyword,
    });
  }

  return signals;
}

function main() {
  const evidencePath = latest(/__workforce_evidence_auto__/);
  const reviewedQueuePath = latest(/__headcount_verification_queue_reviewed__/);
  const evidence = parseSimpleCsv(readFileSync(evidencePath, "utf8"));
  const queue = parseSimpleCsv(readFileSync(reviewedQueuePath, "utf8"));

  const approvedHeadcount = new Map(
    queue
      .filter((q) => q.review_status === "approved")
      .map((q) => [q.ticker, Number(q.verified_headcount)]),
  );

  const rows = [];
  for (const e of evidence) {
    if (!approvedHeadcount.has(e.ticker)) continue;
    const signals = extractSignals(e.quoted_text || "");
    for (const s of signals) {
      const total = approvedHeadcount.get(e.ticker);
      const impliedShare =
        s.signal_type === "count" && Number.isFinite(total) && total > 0
          ? ((s.signal_value / total) * 100).toFixed(2)
          : "";
      rows.push({
        signal_id: `RSC-${RUN_ID}-${e.ticker}-${rows.length + 1}`,
        run_id: RUN_ID,
        ticker: e.ticker,
        evidence_id: e.evidence_id,
        citation_id: e.citation_id,
        role_keyword: s.role_keyword,
        role_phrase: s.role_phrase,
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        total_headcount_reference: total,
        implied_share_pct: impliedShare,
        quote: e.quoted_text,
        review_status: "pending",
        reviewer: "",
        reviewed_at: "",
        review_notes: "",
      });
    }
  }

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_mix_candidates__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(rows, [
      "signal_id",
      "run_id",
      "ticker",
      "evidence_id",
      "citation_id",
      "role_keyword",
      "role_phrase",
      "signal_type",
      "signal_value",
      "total_headcount_reference",
      "implied_share_pct",
      "quote",
      "review_status",
      "reviewer",
      "reviewed_at",
      "review_notes",
    ]),
    "utf8",
  );

  console.log(`Wrote role-mix candidate queue: ${outPath}`);
  console.log(`Rows: ${rows.length}`);
}

main();

