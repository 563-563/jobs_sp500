#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const PILOT_SIZE = Number(process.env.PILOT_SIZE || 25);
const AS_OF_DATE = process.env.AS_OF_DATE || new Date().toISOString().slice(0, 10);
const NOW_ISO = new Date().toISOString();
const STAMP = NOW_ISO.replaceAll(":", "-");

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");
const RUNS_DIR = path.join(ROOT, "runs");

const WIKI_URL =
  "https://en.wikipedia.org/w/index.php?title=List_of_S%26P_500_companies&action=raw";
const SEC_URL = "https://www.sec.gov/files/company_tickers.json";

mkdirSync(RAW_DIR, { recursive: true });
mkdirSync(INT_DIR, { recursive: true });
mkdirSync(RUNS_DIR, { recursive: true });

function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

function cleanCell(text) {
  let out = text.trim();
  out = out.replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, "");
  out = out.replace(/<ref[^/]*\/>/g, "");
  out = out.replace(/\[\[([^|\]]+)\|([^\]]+)\]\]/g, "$2");
  out = out.replace(/\[\[([^\]]+)\]\]/g, "$1");
  out = out.replace(/\{\{[^{}]*\|([^{}|]+)\}\}/g, "$1");
  out = out.replace(/&amp;/g, "&");
  out = out.replace(/&nbsp;/g, " ");
  out = out.replace(/''/g, "");
  out = out.replace(/<[^>]+>/g, "");
  return out.trim();
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

function parseWikiConstituents(rawText) {
  const idIdx = rawText.indexOf('id="constituents"');
  if (idIdx < 0) {
    throw new Error("Could not find constituents table id in Wikipedia raw content.");
  }
  const start = rawText.lastIndexOf("{|", idIdx);
  if (start < 0) {
    throw new Error("Could not find constituents table in Wikipedia raw content.");
  }
  const tableStart = rawText.slice(start);
  const end = tableStart.indexOf("\n|}");
  if (end < 0) {
    throw new Error("Could not find end of constituents table.");
  }
  const table = tableStart.slice(0, end);
  const rowChunks = table.split("\n|-").slice(1);
  const records = [];

  for (const chunk of rowChunks) {
    const lines = chunk
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("|"));
    const cells = [];
    for (const line of lines) {
      const payload = line.replace(/^\|+/, "");
      const parts = payload.split("||");
      for (const p of parts) {
        cells.push(cleanCell(p));
      }
    }
    if (cells.length < 4) continue;

    const symbol = cells[0];
    const security = cells[1];
    const gicsSector = cells[2];
    const gicsSubIndustry = cells[3];
    records.push({
      ticker_raw: symbol,
      ticker_norm: symbol.replaceAll(".", "-"),
      company_name: security,
      gics_sector: gicsSector,
      gics_sub_industry: gicsSubIndustry,
    });
  }
  return records;
}

function normalizeSecTicker(t) {
  return t.trim().toUpperCase().replaceAll(".", "-");
}

async function main() {
  console.log(`RUN_ID=${RUN_ID} PILOT_SIZE=${PILOT_SIZE} AS_OF_DATE=${AS_OF_DATE}`);

  const [wikiRes, secRes] = await Promise.all([
    fetch(WIKI_URL, {
      headers: {
        "User-Agent": "jobs_sp500_research/0.1 (local project pipeline)",
      },
    }),
    fetch(SEC_URL, {
      headers: {
        "User-Agent": "jobs_sp500_research/0.1 (local project pipeline)",
        "Accept-Encoding": "identity",
      },
    }),
  ]);

  if (!wikiRes.ok) throw new Error(`Wikipedia request failed: ${wikiRes.status}`);
  if (!secRes.ok) throw new Error(`SEC request failed: ${secRes.status}`);

  const wikiRaw = await wikiRes.text();
  const secRaw = await secRes.text();
  const secJson = JSON.parse(secRaw);

  const wikiPath = path.join(RAW_DIR, `${RUN_ID}__sp500_wikipedia_raw__${STAMP}.txt`);
  const secPath = path.join(RAW_DIR, `${RUN_ID}__sec_company_tickers__${STAMP}.json`);
  writeFileSync(wikiPath, wikiRaw, "utf8");
  writeFileSync(secPath, secRaw, "utf8");

  const constituents = parseWikiConstituents(wikiRaw);
  const secByTicker = new Map();
  for (const row of Object.values(secJson)) {
    const t = normalizeSecTicker(row.ticker || "");
    if (t) secByTicker.set(t, row);
  }

  const merged = constituents.map((c) => {
    const sec = secByTicker.get(c.ticker_norm);
    return {
      run_id: RUN_ID,
      as_of_date: AS_OF_DATE,
      ticker: c.ticker_raw,
      ticker_norm: c.ticker_norm,
      company_name: c.company_name,
      cik: sec ? String(sec.cik_str).padStart(10, "0") : "",
      sec_title: sec?.title || "",
      gics_sector: c.gics_sector,
      gics_sub_industry: c.gics_sub_industry,
      cik_match_status: sec ? "matched" : "unmatched",
    };
  });

  merged.sort((a, b) => a.ticker_norm.localeCompare(b.ticker_norm));
  const pilot = merged.slice(0, PILOT_SIZE);

  const fullCsv = toCsv(merged, [
    "run_id",
    "as_of_date",
    "ticker",
    "ticker_norm",
    "company_name",
    "cik",
    "sec_title",
    "gics_sector",
    "gics_sub_industry",
    "cik_match_status",
  ]);
  const pilotCsv = toCsv(pilot, [
    "run_id",
    "as_of_date",
    "ticker",
    "ticker_norm",
    "company_name",
    "cik",
    "sec_title",
    "gics_sector",
    "gics_sub_industry",
    "cik_match_status",
  ]);

  const fullPath = path.join(
    INT_DIR,
    `${RUN_ID}__sp500_constituents_full__${STAMP}.csv`,
  );
  const pilotPath = path.join(INT_DIR, `${RUN_ID}__pilot${PILOT_SIZE}_companies__${STAMP}.csv`);
  writeFileSync(fullPath, fullCsv, "utf8");
  writeFileSync(pilotPath, pilotCsv, "utf8");

  const sourceRows = [
    {
      doc_id: `SRC-${RUN_ID}-SP500-WIKI`,
      run_id: RUN_ID,
      source_type: "index_snapshot",
      source_name: "Wikipedia List of S&P 500 companies (raw wikitext)",
      source_url: WIKI_URL,
      source_version: "action=raw",
      accessed_at: NOW_ISO,
      published_at: "",
      local_path: wikiPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(wikiRaw),
    },
    {
      doc_id: `SRC-${RUN_ID}-SEC-TICKERS`,
      run_id: RUN_ID,
      source_type: "other",
      source_name: "SEC company_tickers.json",
      source_url: SEC_URL,
      source_version: "latest",
      accessed_at: NOW_ISO,
      published_at: "",
      local_path: secPath.replaceAll("\\", "/"),
      checksum_sha256: sha256(secRaw),
    },
  ];
  const sourceCsv = toCsv(sourceRows, [
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
  ]);
  const sourcesPath = path.join(INT_DIR, `${RUN_ID}__source_documents__${STAMP}.csv`);
  writeFileSync(sourcesPath, sourceCsv, "utf8");

  const runManifestRows = [
    {
      run_id: RUN_ID,
      as_of_date: AS_OF_DATE,
      started_at: NOW_ISO,
      ended_at: NOW_ISO,
      operator_name: "",
      sp500_source_doc_id: `SRC-${RUN_ID}-SP500-WIKI`,
      sp500_snapshot_timestamp: NOW_ISO,
      karpathy_jobs_source_doc_id: "",
      karpathy_jobs_commit_hash: "",
      schema_version: "001_phase1_tables",
      notes: `pilot_size=${PILOT_SIZE}; selection_rule=alphabetical_by_ticker_norm`,
    },
  ];
  const runManifestCsv = toCsv(runManifestRows, [
    "run_id",
    "as_of_date",
    "started_at",
    "ended_at",
    "operator_name",
    "sp500_source_doc_id",
    "sp500_snapshot_timestamp",
    "karpathy_jobs_source_doc_id",
    "karpathy_jobs_commit_hash",
    "schema_version",
    "notes",
  ]);
  const runManifestPath = path.join(RUNS_DIR, `${RUN_ID}__run_manifest__${STAMP}.csv`);
  writeFileSync(runManifestPath, runManifestCsv, "utf8");

  const unmatched = merged.filter((r) => r.cik_match_status === "unmatched");
  console.log(`Wrote full universe: ${fullPath}`);
  console.log(`Wrote pilot list: ${pilotPath}`);
  console.log(`Wrote source ledger: ${sourcesPath}`);
  console.log(`Wrote run manifest: ${runManifestPath}`);
  console.log(`Total constituents: ${merged.length}`);
  console.log(`CIK unmatched: ${unmatched.length}`);
  if (unmatched.length > 0) {
    console.log("Unmatched tickers:", unmatched.map((u) => u.ticker).join(", "));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
