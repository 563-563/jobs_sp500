#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");

const TARGET_TERMS = [
  "human capital",
  "employees",
  "employee",
  "workforce",
  "personnel",
  "talent",
  "union",
  "headcount",
  "hiring",
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

function latestInDir(dir, pattern) {
  const files = readdirSync(dir).filter((f) => pattern.test(f)).sort();
  if (!files.length) throw new Error(`No files in ${dir} matching ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function latestSubdir(dir, pattern) {
  const entries = readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && pattern.test(d.name))
    .map((d) => d.name)
    .sort();
  if (!entries.length) throw new Error(`No subdir in ${dir} matching ${pattern}`);
  return path.join(dir, entries[entries.length - 1]);
}

function htmlToLines(html) {
  const normalized = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, "\n");

  return normalized
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 30 && l.length <= 550);
}

function sentenceSplit(text) {
  return text
    .split(/(?<=[.?!;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35 && s.length <= 500);
}

function hasTargetTerm(text) {
  const lower = text.toLowerCase();
  return TARGET_TERMS.some((t) => lower.includes(t));
}

function isNoise(text) {
  const lower = text.toLowerCase();
  if (lower.includes("us-gaap:") || lower.includes("xbrli:")) return true;
  if (lower.includes("http://fasb.org")) return true;
  if (lower.match(/\b\d{10}\b/) && lower.includes("member")) return true;
  return false;
}

function extractEmployeeCount(sentence) {
  const lower = sentence.toLowerCase();
  if (!lower.includes("employee") && !lower.includes("people")) return null;
  const patterns = [
    /as of.{0,60}?(?:had|employed)\s+(?:approximately|about|around|over|nearly|roughly)?\s*([\d,]{3,})\s+(?:full[- ]time\s+equivalent\s+)?(?:employees?|people|team members)/i,
    /(?:had|employed)\s+(?:approximately|about|around|over|nearly|roughly)?\s*([\d,]{3,})\s+(?:full[- ]time\s+equivalent\s+)?(?:employees?|people|team members)/i,
    /(?:approximately|about|around|over|nearly|roughly)\s*([\d,]{3,})\s+(?:full[- ]time\s+equivalent\s+)?employees?/i,
  ];
  for (const p of patterns) {
    const m = sentence.match(p);
    if (!m) continue;
    const n = Number(m[1].replaceAll(",", ""));
    if (!Number.isFinite(n) || n < 500) continue;
    return n;
  }
  return null;
}

function main() {
  const filingsPath = latestInDir(INT_DIR, new RegExp(`^${RUN_ID}__pilot_filings_metadata__.*\\.csv$`));
  const filingRows = parseSimpleCsv(readFileSync(filingsPath, "utf8"));
  const filingByTicker = new Map(filingRows.map((r) => [r.ticker, r]));

  const rawFilingDir = latestSubdir(RAW_DIR, new RegExp(`^${RUN_ID}__filing_primary_docs__`));
  const files = readdirSync(rawFilingDir).filter((f) => f.toLowerCase().endsWith(".htm"));

  const evidenceRows = [];
  const citationRows = [];

  for (const file of files) {
    const ticker = file.split("__")[0];
    const html = readFileSync(path.join(rawFilingDir, file), "utf8");
    const lines = htmlToLines(html);
    const picks = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      if (!hasTargetTerm(line) || isNoise(line)) continue;
      const window = [lines[i - 1], line, lines[i + 1]].filter(Boolean).join(" ");
      const sentences = sentenceSplit(window).filter((s) => hasTargetTerm(s) && !isNoise(s));
      for (const s of sentences) {
        const key = s.toLowerCase().replace(/\s+/g, " ");
        if (seen.has(key)) continue;
        seen.add(key);
        picks.push(s);
      }
      if (picks.length >= 40) break;
    }

    const filing = filingByTicker.get(ticker);
    picks.forEach((quote, idx) => {
      const citationId = `CITT-${RUN_ID}-${ticker}-${String(idx + 1).padStart(3, "0")}`;
      const evidenceId = `EVDT-${RUN_ID}-${ticker}-${String(idx + 1).padStart(3, "0")}`;
      const count = extractEmployeeCount(quote);
      evidenceRows.push({
        evidence_id: evidenceId,
        run_id: RUN_ID,
        ticker,
        doc_id: `SRC-${RUN_ID}-FILING-${ticker}-${(filing?.accession_number || "").replaceAll("-", "")}`,
        filing_date: filing?.filing_date || "",
        section_ref: "targeted_human_capital_scan",
        page_ref: "",
        quoted_text: quote,
        extracted_metric_name: count ? "employee_count_candidate" : "",
        extracted_metric_value: count ?? "",
        extracted_metric_unit: count ? "count" : "",
        extraction_method: "script",
        citation_id: citationId,
      });
      citationRows.push({
        citation_id: citationId,
        run_id: RUN_ID,
        ticker,
        claim_type: count ? "numeric" : "qualitative",
        claim_text: count
          ? `Employee count candidate for ${ticker}: ${count}`
          : `Workforce statement for ${ticker}`,
        source_doc_id: `SRC-${RUN_ID}-FILING-${ticker}-${(filing?.accession_number || "").replaceAll("-", "")}`,
        source_url: filing?.filing_url || "",
        source_version: filing?.accession_number || "",
        filing_date: filing?.filing_date || "",
        section_ref: "targeted_human_capital_scan",
        page_ref: "",
        quote,
        extraction_method: "script",
        recorded_by: "pipeline",
        recorded_at: NOW_ISO,
        verification_status: "unverified",
        verified_by: "",
        verified_at: "",
        notes: "",
      });
    });
  }

  const evidencePath = path.join(INT_DIR, `${RUN_ID}__workforce_evidence_targeted__${STAMP}.csv`);
  const citationsPath = path.join(INT_DIR, `${RUN_ID}__citations_targeted__${STAMP}.csv`);
  writeFileSync(
    evidencePath,
    toCsv(evidenceRows, [
      "evidence_id",
      "run_id",
      "ticker",
      "doc_id",
      "filing_date",
      "section_ref",
      "page_ref",
      "quoted_text",
      "extracted_metric_name",
      "extracted_metric_value",
      "extracted_metric_unit",
      "extraction_method",
      "citation_id",
    ]),
    "utf8",
  );
  writeFileSync(
    citationsPath,
    toCsv(citationRows, [
      "citation_id",
      "run_id",
      "ticker",
      "claim_type",
      "claim_text",
      "source_doc_id",
      "source_url",
      "source_version",
      "filing_date",
      "section_ref",
      "page_ref",
      "quote",
      "extraction_method",
      "recorded_by",
      "recorded_at",
      "verification_status",
      "verified_by",
      "verified_at",
      "notes",
    ]),
    "utf8",
  );

  console.log(`Wrote targeted evidence: ${evidencePath}`);
  console.log(`Wrote targeted citations: ${citationsPath}`);
  console.log(`Evidence rows: ${evidenceRows.length}`);
}

main();

