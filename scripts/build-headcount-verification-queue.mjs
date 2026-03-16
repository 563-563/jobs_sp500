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
  if (files.length === 0) throw new Error(`No file found for pattern ${pattern}`);
  return path.join(INT_DIR, files[files.length - 1]);
}

function scoreCandidate(quote) {
  const q = quote.toLowerCase();
  let s = 0;
  if (q.includes("as of")) s += 3;
  if (q.includes("we had") || q.includes("we employed")) s += 2;
  if (q.includes("full-time equivalent")) s += 3;
  if (q.includes("approximately") || q.includes("about")) s += 2;
  if (q.includes("employees")) s += 2;
  if (q.includes("temporary")) s -= 2;
  if (q.includes("union")) s -= 1;
  if (q.includes("decrease from") || q.includes("increase from")) s -= 2;
  if (q.includes("ai and data workforce")) s -= 5;
  if (q.includes("retail stores")) s -= 5;
  if (q.includes("employee retirement income security act") || q.includes("erisa")) s -= 6;
  if (q.includes("or more employees")) s -= 4;
  return s;
}

function confidenceFromScore(score) {
  if (score >= 7) return "high";
  if (score >= 4) return "medium";
  return "low";
}

function isLikelyTotalHeadcount(quote, candidateHeadcount) {
  const q = String(quote || "").toLowerCase();
  if (!q.includes("employee") && !q.includes("people") && !q.includes("workforce")) return false;
  if (q.includes("ai and data workforce")) return false;
  if (q.includes("retail stores")) return false;
  if (q.includes("employee retirement income security act") || q.includes("erisa")) return false;
  if (q.includes("or more employees") && !q.includes("we had")) return false;
  if (candidateHeadcount <= 500 && !q.includes("full-time equivalent")) return false;
  if ((q.includes("decrease from") || q.includes("increase from")) && !q.includes("as of")) return false;
  return q.includes("as of") || q.includes("we had") || q.includes("we employed") || q.includes("had approximately");
}

function main() {
  const evidencePath = latest(/__workforce_evidence_auto__/);
  const citationsPath = latest(/__citations_auto__/);
  const pilotPath = latest(/__pilot\d+_companies__/);

  const evidence = parseSimpleCsv(readFileSync(evidencePath, "utf8"));
  const citations = parseSimpleCsv(readFileSync(citationsPath, "utf8"));
  const pilot = parseSimpleCsv(readFileSync(pilotPath, "utf8"));

  const citationById = new Map(citations.map((c) => [c.citation_id, c]));
  const companyByTicker = new Map(pilot.map((p) => [p.ticker, p]));

  const candidateRows = evidence
    .filter((e) => e.extracted_metric_name === "employee_count_candidate")
    .map((e) => {
      const score = scoreCandidate(e.quoted_text || "");
      const citation = citationById.get(e.citation_id);
      return {
        run_id: RUN_ID,
        ticker: e.ticker,
        company_name: companyByTicker.get(e.ticker)?.company_name || "",
        cik: companyByTicker.get(e.ticker)?.cik || "",
        evidence_id: e.evidence_id,
        citation_id: e.citation_id,
        candidate_headcount: Number(e.extracted_metric_value || 0),
        filing_date: e.filing_date,
        source_url: citation?.source_url || "",
        quote: e.quoted_text || "",
        auto_priority_score: score,
        auto_confidence: confidenceFromScore(score),
        likely_total_headcount: isLikelyTotalHeadcount(e.quoted_text || "", Number(e.extracted_metric_value || 0))
          ? "yes"
          : "no",
        is_recommended: "no",
      };
    })
    .filter((r) => Number.isFinite(r.candidate_headcount) && r.candidate_headcount > 0);

  const byTicker = new Map();
  for (const row of candidateRows) {
    const list = byTicker.get(row.ticker) || [];
    list.push(row);
    byTicker.set(row.ticker, list);
  }
  for (const [ticker, list] of byTicker.entries()) {
    list.sort((a, b) => {
      if (a.likely_total_headcount !== b.likely_total_headcount) {
        return a.likely_total_headcount === "yes" ? -1 : 1;
      }
      if (b.auto_priority_score !== a.auto_priority_score) {
        return b.auto_priority_score - a.auto_priority_score;
      }
      if (b.candidate_headcount !== a.candidate_headcount) {
        return b.candidate_headcount - a.candidate_headcount;
      }
      return String(a.evidence_id).localeCompare(String(b.evidence_id));
    });
    const candidate = list.find((x) => x.likely_total_headcount === "yes");
    if (candidate) candidate.is_recommended = "yes";
    byTicker.set(ticker, list);
  }

  const queueRows = pilot.map((p) => {
    const list = byTicker.get(p.ticker) || [];
    const rec = list.find((x) => x.is_recommended === "yes");
    if (!rec) {
      return {
        run_id: RUN_ID,
        ticker: p.ticker,
        company_name: p.company_name,
        cik: p.cik,
        candidate_headcount: "",
        candidate_confidence: "none",
        citation_id: "",
        source_url: "",
        filing_date: "",
        quote: "No candidate extracted automatically; manual filing review required.",
        review_status: "needs_research",
        verified_headcount: "",
        reviewer: "",
        reviewed_at: "",
        review_notes: "",
      };
    }
    return {
      run_id: RUN_ID,
      ticker: p.ticker,
      company_name: p.company_name,
      cik: p.cik,
        candidate_headcount: rec.candidate_headcount,
        candidate_confidence: rec.auto_confidence,
        citation_id: rec.citation_id,
      source_url: rec.source_url,
      filing_date: rec.filing_date,
      quote: rec.quote,
      review_status: "pending",
      verified_headcount: "",
      reviewer: "",
      reviewed_at: "",
      review_notes: "",
    };
  });

  const allCandidatesPath = path.join(
    INT_DIR,
    `${RUN_ID}__headcount_candidates_auto__${STAMP}.csv`,
  );
  writeFileSync(
    allCandidatesPath,
    toCsv(candidateRows, [
      "run_id",
      "ticker",
      "company_name",
      "cik",
      "evidence_id",
      "citation_id",
      "candidate_headcount",
      "filing_date",
      "source_url",
      "quote",
      "auto_priority_score",
      "auto_confidence",
      "likely_total_headcount",
      "is_recommended",
    ]),
    "utf8",
  );

  const queuePath = path.join(INT_DIR, `${RUN_ID}__headcount_verification_queue__${STAMP}.csv`);
  writeFileSync(
    queuePath,
    toCsv(queueRows, [
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

  console.log(`Wrote candidate set: ${allCandidatesPath}`);
  console.log(`Wrote verification queue: ${queuePath}`);
  console.log(`Candidate rows: ${candidateRows.length}`);
  console.log(`Queue rows: ${queueRows.length}`);
}

main();
