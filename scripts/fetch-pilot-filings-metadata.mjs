#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");
const FORM_PRIORITY = ["10-K", "20-F", "40-F"];

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INT_DIR, { recursive: true });

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

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function latestPilotCsv(runId) {
  const files = readdirSync(INT_DIR)
    .filter((f) => f.startsWith(`${runId}__pilot`) && f.includes("_companies__") && f.endsWith(".csv"))
    .sort();
  if (files.length === 0) {
    throw new Error(`No pilot company CSV found for run_id=${runId} in data/intermediate.`);
  }
  return path.join(INT_DIR, files[files.length - 1]);
}

function chooseLatestAnnualFiling(recent) {
  const rows = [];
  for (let i = 0; i < recent.form.length; i += 1) {
    const form = recent.form[i];
    if (!FORM_PRIORITY.includes(form)) continue;
    rows.push({
      form,
      filingDate: recent.filingDate[i],
      reportDate: recent.reportDate[i],
      accessionNumber: recent.accessionNumber[i],
      primaryDocument: recent.primaryDocument[i],
    });
  }
  rows.sort((a, b) => String(b.filingDate).localeCompare(String(a.filingDate)));
  return rows[0] || null;
}

function filingUrl(cik, accessionNumber, primaryDocument) {
  const cikInt = String(Number(cik));
  const accessionNoDashes = accessionNumber.replaceAll("-", "");
  return `https://www.sec.gov/Archives/edgar/data/${cikInt}/${accessionNoDashes}/${primaryDocument}`;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`RUN_ID=${RUN_ID}`);
  const pilotPath = latestPilotCsv(RUN_ID);
  const pilotRows = parseSimpleCsv(readFileSync(pilotPath, "utf8"));
  const submissionsDir = path.join(RAW_DIR, `${RUN_ID}__sec_submissions__${STAMP}`);
  mkdirSync(submissionsDir, { recursive: true });

  const filingRows = [];
  const sourceRows = [];
  for (const row of pilotRows) {
    const cik = row.cik;
    const ticker = row.ticker;
    const company = row.company_name;
    if (!cik) {
      filingRows.push({
        run_id: RUN_ID,
        ticker,
        cik,
        company_name: company,
        form: "",
        filing_date: "",
        report_date: "",
        accession_number: "",
        primary_document: "",
        filing_url: "",
        submission_doc_id: "",
        submission_fetched_at: NOW_ISO,
        status: "missing_cik",
      });
      continue;
    }

    const submissionUrl = `https://data.sec.gov/submissions/CIK${cik}.json`;
    const res = await fetch(submissionUrl, {
      headers: {
        "User-Agent": "jobs_sp500_research/0.1 (local project pipeline)",
        "Accept-Encoding": "identity",
      },
    });

    if (!res.ok) {
      filingRows.push({
        run_id: RUN_ID,
        ticker,
        cik,
        company_name: company,
        form: "",
        filing_date: "",
        report_date: "",
        accession_number: "",
        primary_document: "",
        filing_url: "",
        submission_doc_id: "",
        submission_fetched_at: NOW_ISO,
        status: `submission_fetch_failed_${res.status}`,
      });
      await sleep(175);
      continue;
    }

    const raw = await res.text();
    const submissionPath = path.join(submissionsDir, `CIK${cik}.json`);
    writeFileSync(submissionPath, raw, "utf8");
    const sub = JSON.parse(raw);
    const docId = `SRC-${RUN_ID}-SEC-SUB-${ticker}`;
    sourceRows.push({
      doc_id: docId,
      run_id: RUN_ID,
      source_type: "filing",
      source_name: `SEC submissions CIK${cik}.json`,
      source_url: submissionUrl,
      source_version: sub?.filings?.recent?.accessionNumber?.[0] || "latest",
      accessed_at: NOW_ISO,
      published_at: "",
      local_path: submissionPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(raw),
    });

    const latest = chooseLatestAnnualFiling(sub.filings.recent);
    if (!latest) {
      filingRows.push({
        run_id: RUN_ID,
        ticker,
        cik,
        company_name: company,
        form: "",
        filing_date: "",
        report_date: "",
        accession_number: "",
        primary_document: "",
        filing_url: "",
        submission_doc_id: docId,
        submission_fetched_at: NOW_ISO,
        status: "no_10k_like_form_found",
      });
      await sleep(175);
      continue;
    }

    filingRows.push({
      run_id: RUN_ID,
      ticker,
      cik,
      company_name: company,
      form: latest.form,
      filing_date: latest.filingDate,
      report_date: latest.reportDate,
      accession_number: latest.accessionNumber,
      primary_document: latest.primaryDocument,
      filing_url: filingUrl(cik, latest.accessionNumber, latest.primaryDocument),
      submission_doc_id: docId,
      submission_fetched_at: NOW_ISO,
      status: "ok",
    });

    await sleep(175);
  }

  const filingsCsv = toCsv(filingRows, [
    "run_id",
    "ticker",
    "cik",
    "company_name",
    "form",
    "filing_date",
    "report_date",
    "accession_number",
    "primary_document",
    "filing_url",
    "submission_doc_id",
    "submission_fetched_at",
    "status",
  ]);
  const filingsPath = path.join(INT_DIR, `${RUN_ID}__pilot_filings_metadata__${STAMP}.csv`);
  writeFileSync(filingsPath, filingsCsv, "utf8");

  const sourcesPath = path.join(INT_DIR, `${RUN_ID}__source_documents_sec_submissions__${STAMP}.csv`);
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

  const okCount = filingRows.filter((r) => r.status === "ok").length;
  console.log(`Pilot rows: ${pilotRows.length}`);
  console.log(`Filings with latest annual form: ${okCount}`);
  console.log(`Wrote filings metadata: ${filingsPath}`);
  console.log(`Wrote SEC submission source ledger: ${sourcesPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

