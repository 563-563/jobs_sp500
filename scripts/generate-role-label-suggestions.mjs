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

function tokens(text) {
  return new Set(
    String(text || "")
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2),
  );
}

function overlapScore(a, b) {
  let hit = 0;
  for (const t of a) {
    if (b.has(t)) hit += 1;
  }
  return hit;
}

function main() {
  const roleMixPath = latest(/__role_mix_candidates__/);
  const scorePath = latest(/__karpathy_vulnerability_scores__/);
  const companyPath = latest(/__pilot\d+_companies__/);
  const roleMix = parseSimpleCsv(readFileSync(roleMixPath, "utf8"));
  const scoreRows = parseSimpleCsv(readFileSync(scorePath, "utf8"));
  const companyRows = parseSimpleCsv(readFileSync(companyPath, "utf8"));
  const companyByTicker = new Map(companyRows.map((c) => [c.ticker, c]));

  const indexed = scoreRows.map((r) => ({
    ...r,
    token_set: tokens(`${r.repo_title} ${r.repo_label}`),
  }));

  const out = [];
  for (const rm of roleMix) {
    const queryTokens = tokens(`${rm.role_phrase} ${rm.role_keyword}`);
    const company = companyByTicker.get(rm.ticker);
    const industry = String(company?.gics_sub_industry || "").toLowerCase();
    const scored = indexed
      .map((row) => ({
        repo_label: row.repo_label,
        repo_title: row.repo_title,
        repo_score: row.repo_score,
        match_score: (() => {
          let score = overlapScore(queryTokens, row.token_set);
          const title = String(row.repo_title || "").toLowerCase();
          const phrase = String(rm.role_phrase).toLowerCase();
          if (phrase.includes("engineering") || phrase.includes("research and development")) {
            if (title.includes("engineers")) score += 3;
            if (title.includes("software developers")) score += 4;
            if (title.includes("computer and information research scientists")) score += 2;
            if (title.includes("engineering managers")) score += 1;
            if (title.includes("technicians")) score -= 1;
          }
          if (phrase.includes("services and support")) {
            if (row.repo_label === "computer-support-specialists") score += 5;
            if (row.repo_label === "customer-service-representatives") score += 4;
          }
          if (phrase.includes("sales and marketing")) {
            if (row.repo_label === "sales-managers") score += 4;
            if (row.repo_label === "advertising-promotions-and-marketing-managers") score += 4;
            if (row.repo_label === "market-research-analysts") score += 2;
          }
          if (phrase.includes("administrative functions")) {
            if (row.repo_label === "management-analysts") score += 3;
            if (row.repo_label === "administrative-services-managers") score += 3;
          }
          if (phrase.includes("direct-labor") || phrase.includes("manufacturing and clinical treatment planning")) {
            if (row.repo_label === "assemblers-and-fabricators") score += 5;
            if (row.repo_label === "dental-and-ophthalmic-laboratory-technicians-and-medical-appliance-technicians") score += 4;
            if (row.repo_label === "industrial-production-managers") score += 2;
          }
          if (industry.includes("semiconductor")) {
            if (
              row.repo_label === "electrical-and-electronics-engineers" ||
              row.repo_label === "computer-hardware-engineers" ||
              row.repo_label === "materials-engineers"
            ) {
              score += 2;
            }
          }
          if (industry.includes("internet") || industry.includes("software")) {
            if (row.repo_label === "software-developers") score += 3;
            if (row.repo_label === "computer-support-specialists") score += 2;
          }
          return score;
        })(),
      }))
      .filter((x) => x.match_score > 0)
      .sort((a, b) => b.match_score - a.match_score || Number(b.repo_score) - Number(a.repo_score))
      .slice(0, 5);

    if (!scored.length) {
      out.push({
        run_id: RUN_ID,
        signal_id: rm.signal_id,
        ticker: rm.ticker,
        role_phrase: rm.role_phrase,
        role_keyword: rm.role_keyword,
        suggestion_rank: 1,
        suggested_repo_label: "",
        suggested_repo_title: "",
        suggested_repo_score: "",
        match_score: 0,
        review_status: "needs_research",
        reviewer: "",
        reviewed_at: "",
        review_notes: "No lexical match to occupation catalog.",
      });
      continue;
    }

    scored.forEach((s, idx) => {
      out.push({
        run_id: RUN_ID,
        signal_id: rm.signal_id,
        ticker: rm.ticker,
        role_phrase: rm.role_phrase,
        role_keyword: rm.role_keyword,
        suggestion_rank: idx + 1,
        suggested_repo_label: s.repo_label,
        suggested_repo_title: s.repo_title,
        suggested_repo_score: s.repo_score,
        match_score: s.match_score,
        review_status: idx === 0 ? "pending" : "optional",
        reviewer: "",
        reviewed_at: "",
        review_notes: "",
      });
    });
  }

  const outPath = path.join(INT_DIR, `${RUN_ID}__role_label_suggestions__${STAMP}.csv`);
  writeFileSync(
    outPath,
    toCsv(out, [
      "run_id",
      "signal_id",
      "ticker",
      "role_phrase",
      "role_keyword",
      "suggestion_rank",
      "suggested_repo_label",
      "suggested_repo_title",
      "suggested_repo_score",
      "match_score",
      "review_status",
      "reviewer",
      "reviewed_at",
      "review_notes",
    ]),
    "utf8",
  );

  console.log(`Wrote role label suggestions: ${outPath}`);
  console.log(`Rows: ${out.length}`);
}

main();
