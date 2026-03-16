#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const MAX_SNIPPETS_PER_COMPANY = Number(process.env.MAX_SNIPPETS_PER_COMPANY || 12);

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INT_DIR, { recursive: true });

const KEYWORDS = [
  "employee",
  "employees",
  "workforce",
  "headcount",
  "personnel",
  "associates",
  "team members",
  "workers",
];

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

function latestFile(pattern) {
  const files = readdirSync(INT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (files.length === 0) {
    throw new Error(`No input files matching ${pattern} for run_id=${RUN_ID}.`);
  }
  return path.join(INT_DIR, files[files.length - 1]);
}

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#160;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function splitSentences(text) {
  return text
    .split(/(?<=[.?!;])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40);
}

function hasKeyword(sentence) {
  const s = sentence.toLowerCase();
  return KEYWORDS.some((k) => s.includes(k));
}

function isNoisySentence(sentence) {
  const s = sentence.toLowerCase();
  if (s.includes("us-gaap:") || s.includes("xbrli:") || s.includes("http://fasb.org")) return true;
  if (s.includes("0000") && s.includes("member")) return true;
  if (sentence.split(/\s+/).length > 120) return true;
  return false;
}

function extractEmployeeCount(sentence) {
  const patterns = [
    /(?:approximately|about|around|over|nearly|roughly)?\s*([\d,]{3,})\s+(?:full[- ]time\s+equivalent\s+)?employees?/i,
    /employees?.{0,40}?([\d,]{3,})/i,
    /workforce.{0,40}?([\d,]{3,})/i,
  ];
  for (const p of patterns) {
    const match = sentence.match(p);
    if (!match) continue;
    const numeric = Number(match[1].replaceAll(",", ""));
    if (!Number.isFinite(numeric) || numeric < 500) continue;
    if (numeric >= 1900 && numeric <= 2100 && !match[1].includes(",")) continue;
    return numeric;
  }
  return null;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const filingsPath = latestFile(/__pilot_filings_metadata__/);
  const filings = parseSimpleCsv(readFileSync(filingsPath, "utf8")).filter((r) => r.status === "ok");
  const filingRawDir = path.join(RAW_DIR, `${RUN_ID}__filing_primary_docs__${STAMP}`);
  mkdirSync(filingRawDir, { recursive: true });

  const evidenceRows = [];
  const citationRows = [];
  const sourceRows = [];

  for (const filing of filings) {
    const ticker = filing.ticker;
    const cik = filing.cik;
    const filingUrl = filing.filing_url;
    const accession = filing.accession_number;
    const primaryDoc = filing.primary_document;

    const res = await fetch(filingUrl, {
      headers: {
        "User-Agent": "jobs_sp500_research/0.1 (local project pipeline)",
        "Accept-Encoding": "identity",
      },
    });

    if (!res.ok) {
      evidenceRows.push({
        evidence_id: `EVD-${RUN_ID}-${ticker}-FETCHFAIL`,
        run_id: RUN_ID,
        ticker,
        doc_id: "",
        filing_date: filing.filing_date,
        section_ref: "",
        page_ref: "",
        quoted_text: `Failed to fetch primary filing document: HTTP ${res.status}`,
        extracted_metric_name: "",
        extracted_metric_value: "",
        extracted_metric_unit: "",
        extraction_method: "script",
        citation_id: "",
      });
      await sleep(150);
      continue;
    }

    const html = await res.text();
    const localName = `${ticker}__${accession.replaceAll("-", "")}__${primaryDoc}`;
    const localPath = path.join(filingRawDir, localName);
    writeFileSync(localPath, html, "utf8");

    const docId = `SRC-${RUN_ID}-FILING-${ticker}-${accession.replaceAll("-", "")}`;
    sourceRows.push({
      doc_id: docId,
      run_id: RUN_ID,
      source_type: "filing",
      source_name: `${ticker} ${filing.form} primary filing document`,
      source_url: filingUrl,
      source_version: accession,
      accessed_at: NOW_ISO,
      published_at: filing.filing_date,
      local_path: localPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(html),
    });

    const text = stripHtml(html);
    const sentenceCandidates = splitSentences(text).filter((s) => hasKeyword(s) && !isNoisySentence(s));
    const selected = sentenceCandidates.slice(0, MAX_SNIPPETS_PER_COMPANY);

    selected.forEach((sentence, idx) => {
      const citationId = `CIT-${RUN_ID}-${ticker}-${String(idx + 1).padStart(3, "0")}`;
      const evidenceId = `EVD-${RUN_ID}-${ticker}-${String(idx + 1).padStart(3, "0")}`;
      const extracted = extractEmployeeCount(sentence);

      evidenceRows.push({
        evidence_id: evidenceId,
        run_id: RUN_ID,
        ticker,
        doc_id: docId,
        filing_date: filing.filing_date,
        section_ref: "auto_keyword_scan",
        page_ref: "",
        quoted_text: sentence,
        extracted_metric_name: extracted ? "employee_count_candidate" : "",
        extracted_metric_value: extracted ?? "",
        extracted_metric_unit: extracted ? "count" : "",
        extraction_method: "script",
        citation_id: citationId,
      });

      citationRows.push({
        citation_id: citationId,
        run_id: RUN_ID,
        ticker,
        claim_type: extracted ? "numeric" : "qualitative",
        claim_text: extracted
          ? `Employee count candidate for ${ticker}: ${extracted}`
          : `Workforce-related statement for ${ticker}`,
        source_doc_id: docId,
        source_url: filingUrl,
        source_version: accession,
        filing_date: filing.filing_date,
        section_ref: "auto_keyword_scan",
        page_ref: "",
        quote: sentence,
        extraction_method: "script",
        recorded_by: "pipeline",
        recorded_at: NOW_ISO,
        verification_status: "unverified",
        verified_by: "",
        verified_at: "",
        notes: "",
      });
    });

    if (selected.length === 0) {
      evidenceRows.push({
        evidence_id: `EVD-${RUN_ID}-${ticker}-NOSNIPPET`,
        run_id: RUN_ID,
        ticker,
        doc_id: docId,
        filing_date: filing.filing_date,
        section_ref: "auto_keyword_scan",
        page_ref: "",
        quoted_text: "No workforce-related snippets matched keyword scan.",
        extracted_metric_name: "",
        extracted_metric_value: "",
        extracted_metric_unit: "",
        extraction_method: "script",
        citation_id: "",
      });
    }

    await sleep(150);
  }

  const evidencePath = path.join(INT_DIR, `${RUN_ID}__workforce_evidence_auto__${STAMP}.csv`);
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

  const citationsPath = path.join(INT_DIR, `${RUN_ID}__citations_auto__${STAMP}.csv`);
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

  const sourcesPath = path.join(INT_DIR, `${RUN_ID}__source_documents_filing_primary__${STAMP}.csv`);
  writeFileSync(
    sourcesPath,
    toCsv(sourceRows, [
      "doc_id",
      "run_id",
      "source_type",
      "source_name",
      "source_url",
      "source_version",
      "accessed_at",
      "published_at",
      "local_path",
      "checksum_sha256",
    ]),
    "utf8",
  );

  const byTicker = new Map();
  for (const r of evidenceRows) {
    byTicker.set(r.ticker, (byTicker.get(r.ticker) || 0) + 1);
  }

  console.log(`Filings scanned: ${filings.length}`);
  console.log(`Evidence rows: ${evidenceRows.length}`);
  console.log(`Citation rows: ${citationRows.length}`);
  console.log(`Source rows: ${sourceRows.length}`);
  console.log(`Wrote evidence: ${evidencePath}`);
  console.log(`Wrote citations: ${citationsPath}`);
  console.log(`Wrote filing source docs ledger: ${sourcesPath}`);
  console.log(
    `Per-ticker evidence counts: ${[...byTicker.entries()]
      .map(([k, v]) => `${k}:${v}`)
      .join(", ")}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
