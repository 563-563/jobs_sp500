#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const INT_DIR = path.join(ROOT, "data", "intermediate");
const NOW_ISO = new Date().toISOString();

function parseSimpleCsv(content) {
  const lines = content.trimEnd().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
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

function latest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function tryLatest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) return "";
  return path.join(dir, files[files.length - 1]);
}

function latestRunDossierDir() {
  const dossierRoot = path.join(OUT_DIR, "company_dossiers");
  const dirs = readdirSync(dossierRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith(`${RUN_ID}__`))
    .map((d) => d.name)
    .sort();
  if (!dirs.length) return "";
  return path.join(dossierRoot, dirs[dirs.length - 1]);
}

function latestRunReasoningDir() {
  const reasoningRoot = path.join(OUT_DIR, "company_reasoning");
  let dirs = [];
  try {
    dirs = readdirSync(reasoningRoot, { withFileTypes: true })
      .filter((d) => d.isDirectory() && d.name.startsWith(`${RUN_ID}__`))
      .map((d) => d.name)
      .sort();
  } catch {
    return "";
  }
  if (!dirs.length) return "";
  return path.join(reasoningRoot, dirs[dirs.length - 1]);
}

function n(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const x = Number(raw);
  return Number.isFinite(x) ? x : null;
}

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function clip(text, max = 120) {
  const s = String(text ?? "").replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}...`;
}

function main() {
  const conservativePath = latest(OUT_DIR, /__company_vulnerability_v2_conservative__/);
  const relaxedPath = latest(OUT_DIR, /__company_vulnerability_v2_relaxed__/);
  const summaryPath = latest(OUT_DIR, /__initial_results_25_summary__/);
  const confidencePath = latest(OUT_DIR, /__confidence_pipeline_status__/);
  const headcountPath = latest(INT_DIR, /__headcount_verification_queue_reviewed__/);
  const adjudicationPath = latest(INT_DIR, /__role_mapping_adjudication_v2_reviewed__/);
  const roleMixPath = latest(INT_DIR, /__role_mix_candidates__/);
  const externalQueuePath = tryLatest(INT_DIR, /__external_role_evidence_queue__/);
  const sourceSearchReferencePath = tryLatest(OUT_DIR, /__source_search_reference__/);
  const filingsPath = latest(INT_DIR, /__pilot_filings_metadata__/);
  const dossierDir = latestRunDossierDir();
  const dossierIndexPath = dossierDir ? tryLatest(dossierDir, /__company_dossier_index__/) : "";
  const reasoningDir = latestRunReasoningDir();
  const reasoningIndexPath = reasoningDir ? tryLatest(reasoningDir, /__company_reasoning_index__/) : "";

  const conservativeRows = parseSimpleCsv(readFileSync(conservativePath, "utf8"));
  const relaxedRows = parseSimpleCsv(readFileSync(relaxedPath, "utf8"));
  const summaryRows = parseSimpleCsv(readFileSync(summaryPath, "utf8"));
  const confidenceRows = parseSimpleCsv(readFileSync(confidencePath, "utf8"));
  const headcountRows = parseSimpleCsv(readFileSync(headcountPath, "utf8"));
  const adjudicationRows = parseSimpleCsv(readFileSync(adjudicationPath, "utf8"));
  const roleMixRows = parseSimpleCsv(readFileSync(roleMixPath, "utf8"));
  const externalQueueRows = externalQueuePath ? parseSimpleCsv(readFileSync(externalQueuePath, "utf8")) : [];
  const filingRows = parseSimpleCsv(readFileSync(filingsPath, "utf8"));
  const dossierRows = dossierIndexPath ? parseSimpleCsv(readFileSync(dossierIndexPath, "utf8")) : [];
  const reasoningRows = reasoningIndexPath ? parseSimpleCsv(readFileSync(reasoningIndexPath, "utf8")) : [];

  const conservativeByTicker = new Map(conservativeRows.map((r) => [r.ticker, r]));
  const relaxedByTicker = new Map(relaxedRows.map((r) => [r.ticker, r]));
  const summaryByTicker = new Map(summaryRows.map((r) => [r.ticker, r]));
  const confidenceByTicker = new Map(confidenceRows.map((r) => [r.ticker, r]));
  const filingByTicker = new Map(filingRows.map((r) => [r.ticker, r]));
  const dossierRelByTicker = new Map(
    dossierRows.map((r) => {
      const raw = String(r.dossier_file || "");
      const abs = path.isAbsolute(raw) ? raw : path.resolve(OUT_DIR, raw);
      const rel = path.relative(OUT_DIR, abs).replaceAll("\\", "/");
      return [r.ticker, rel];
    }),
  );
  const reasoningRelByTicker = new Map(
    reasoningRows.map((r) => {
      const raw = String(r.reasoning_file || "");
      const abs = path.isAbsolute(raw) ? raw : path.resolve(OUT_DIR, raw);
      const rel = path.relative(OUT_DIR, abs).replaceAll("\\", "/");
      return [r.ticker, rel];
    }),
  );

  const roleSignalCountByTicker = new Map();
  for (const row of roleMixRows) {
    roleSignalCountByTicker.set(row.ticker, (roleSignalCountByTicker.get(row.ticker) || 0) + 1);
  }

  const approvedMappingsByTicker = new Map();
  const pendingMappingsByTicker = new Map();
  for (const row of adjudicationRows) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    const status = String(row.review_status || "").toLowerCase();
    const mapped = {
      adjudication_id: row.adjudication_id || "",
      role_phrase_raw: clip(row.role_phrase_raw || "", 110),
      approved_repo_label: row.approved_repo_label || row.suggested_repo_label || "",
      approved_share_pct: row.approved_share_pct || row.implied_share_pct || "",
      mapping_confidence: row.mapping_confidence || "",
      source_hint: clip(row.quote || row.review_notes || "", 130),
    };
    if (status === "approved") {
      if (!approvedMappingsByTicker.has(ticker)) approvedMappingsByTicker.set(ticker, []);
      approvedMappingsByTicker.get(ticker).push(mapped);
    } else if (status === "pending") {
      if (!pendingMappingsByTicker.has(ticker)) pendingMappingsByTicker.set(ticker, []);
      pendingMappingsByTicker.get(ticker).push(mapped);
    }
  }

  const externalEvidenceByTicker = new Map();
  for (const row of externalQueueRows) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    const status = String(row.review_status || "").toLowerCase();
    if (status !== "approved" && status !== "signal_captured" && status !== "pending_research") continue;
    const item = {
      source_bucket: row.source_bucket || "",
      source_bucket_label: row.source_bucket_label || row.source_bucket || "",
      review_status: row.review_status || "",
      role_phrase: clip(row.role_phrase || "", 90),
      implied_share_pct: row.implied_share_pct || "",
      found_url: row.found_url || "",
      search_url: row.search_url || "",
      quote_excerpt: clip(row.quote_excerpt || "", 120),
    };
    if (!externalEvidenceByTicker.has(ticker)) externalEvidenceByTicker.set(ticker, []);
    externalEvidenceByTicker.get(ticker).push(item);
  }

  const roleSignalsByTicker = new Map();
  for (const row of roleMixRows) {
    const ticker = String(row.ticker || "").toUpperCase();
    if (!ticker) continue;
    const item = {
      signal_id: row.signal_id || "",
      role_phrase: clip(row.role_phrase || "", 90),
      signal_type: row.signal_type || "",
      signal_value: row.signal_value || "",
      implied_share_pct: row.implied_share_pct || "",
      citation_id: row.citation_id || "",
      quote: clip(row.quote || "", 120),
      source_url: row.source_url || "",
    };
    if (!roleSignalsByTicker.has(ticker)) roleSignalsByTicker.set(ticker, []);
    roleSignalsByTicker.get(ticker).push(item);
  }

  const tickers = [...new Set([...conservativeByTicker.keys(), ...relaxedByTicker.keys()])].sort();
  const merged = tickers.map((ticker) => {
    const c = conservativeByTicker.get(ticker) || {};
    const r = relaxedByTicker.get(ticker) || {};
    const s = summaryByTicker.get(ticker) || {};
    const p = confidenceByTicker.get(ticker) || {};
    return {
      ticker,
      company_name: c.company_name || r.company_name || s.company_name || "",
      dossier_rel_path: dossierRelByTicker.get(ticker) || "",
      reasoning_rel_path: reasoningRelByTicker.get(ticker) || "",
      conservative_score: n(c.ai_vulnerability_score_v2),
      conservative_share: n(c.approved_role_share_pct),
      conservative_threshold_met: c.threshold_met || "",
      relaxed_score: n(r.estimated_ai_vulnerability_score),
      relaxed_confidence: r.confidence_level || "",
      used_sector_priors: r.used_sector_priors || "",
      headcount_status: s.headcount_verification_status || "",
      blocker: s.blocker || "",
      stage: s.stage || "",
      defensibility_status: p.defensibility_status || "",
      owner_agent: p.owner_agent || "",
      next_action: p.next_action || "",
    };
  });

  const publishedConservative = merged.filter((m) => m.conservative_score !== null).length;
  const relaxedCount = merged.filter((m) => m.relaxed_score !== null).length;
  const roleSignalGaps = merged.filter((m) => m.stage === "needs_role_signal");
  const headcountPending = headcountRows.filter((r) => String(r.review_status).toLowerCase() === "pending");
  const headcountNeedsResearch = headcountRows.filter(
    (r) => String(r.review_status).toLowerCase() === "needs_research",
  );
  const mappingPending = adjudicationRows.filter((r) => String(r.review_status).toLowerCase() === "pending");
  const externalPending = externalQueueRows.filter(
    (r) => String(r.review_status || "").toLowerCase() === "pending_research",
  );
  const externalCaptured = externalQueueRows.filter(
    (r) => String(r.review_status || "").toLowerCase() === "signal_captured",
  );
  const externalApproved = externalQueueRows.filter(
    (r) => String(r.review_status || "").toLowerCase() === "approved",
  );

  const byRelaxed = [...merged].sort((a, b) => (b.relaxed_score ?? -1) - (a.relaxed_score ?? -1));
  const top10Relaxed = byRelaxed.slice(0, 10);

  const confidenceCounts = { high: 0, medium: 0, low: 0, unknown: 0 };
  for (const m of merged) {
    const key = (m.relaxed_confidence || "unknown").toLowerCase();
    if (confidenceCounts[key] === undefined) confidenceCounts.unknown += 1;
    else confidenceCounts[key] += 1;
  }

  const blockerCounts = {};
  for (const m of merged) {
    const key = m.blocker || "none";
    blockerCounts[key] = (blockerCounts[key] || 0) + 1;
  }

  const defensibilityCounts = {
    medium_high_confidence: 0,
    defensible_guess: 0,
    not_defensible_yet: 0,
  };
  for (const row of confidenceRows) {
    const key = String(row.defensibility_status || "");
    if (defensibilityCounts[key] !== undefined) defensibilityCounts[key] += 1;
  }

  const tableRows = merged
    .map(
      (m) => `<tr>
  <td>${esc(m.ticker)}</td>
  <td>${m.dossier_rel_path ? `<a href="${esc(m.dossier_rel_path)}" target="_blank" rel="noreferrer">${esc(m.company_name)}</a>` : esc(m.company_name)}</td>
  <td><button class="mini-btn" data-open-company="${esc(m.ticker)}">view</button></td>
  <td>${m.dossier_rel_path ? `<a href="${esc(m.dossier_rel_path)}" target="_blank" rel="noreferrer">open</a>` : ""}</td>
  <td>${m.reasoning_rel_path ? `<a href="${esc(m.reasoning_rel_path)}" target="_blank" rel="noreferrer">open</a>` : ""}</td>
  <td>${m.conservative_score === null ? "" : m.conservative_score.toFixed(2)}</td>
  <td>${m.relaxed_score === null ? "" : m.relaxed_score.toFixed(2)}</td>
  <td>${esc(m.relaxed_confidence)}</td>
  <td>${esc(m.headcount_status)}</td>
  <td>${esc(m.blocker)}</td>
  <td>${esc(m.stage)}</td>
</tr>`,
    )
    .join("\n");

  const companyDrilldownRows = merged.map((m) => {
    const ticker = String(m.ticker || "").toUpperCase();
    return {
      ticker,
      company_name: m.company_name,
      conservative_score: m.conservative_score,
      conservative_share: m.conservative_share,
      relaxed_score: m.relaxed_score,
      relaxed_confidence: m.relaxed_confidence,
      defensibility_status: m.defensibility_status,
      owner_agent: m.owner_agent,
      stage: m.stage,
      headcount_status: m.headcount_status,
      used_sector_priors: m.used_sector_priors,
      blocker: m.blocker,
      next_action: m.next_action,
      dossier_rel_path: m.dossier_rel_path,
      reasoning_rel_path: m.reasoning_rel_path,
      approved_mappings: approvedMappingsByTicker.get(ticker) || [],
      pending_mappings: pendingMappingsByTicker.get(ticker) || [],
      external_evidence: externalEvidenceByTicker.get(ticker) || [],
      role_signals: roleSignalsByTicker.get(ticker) || [],
    };
  });
  const companyOptions = merged
    .map((m) => `<option value="${esc(m.ticker)}">${esc(m.ticker)} - ${esc(m.company_name)}</option>`)
    .join("\n");

  const headPendingRows = headcountPending.length
    ? headcountPending
        .map(
          (r) => `<tr>
  <td>${esc(r.ticker)}</td>
  <td>${esc(r.company_name)}</td>
  <td>${esc(r.candidate_headcount)}</td>
  <td>${esc(r.candidate_confidence)}</td>
  <td>${esc(r.citation_id)}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="5">No pending headcount rows.</td></tr>`;

  const headResearchRows = headcountNeedsResearch.length
    ? headcountNeedsResearch
        .map(
          (r) => `<tr>
  <td>${esc(r.ticker)}</td>
  <td>${esc(r.company_name)}</td>
  <td>${esc(clip(r.quote, 110))}</td>
  <td>${esc(r.review_status)}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="4">No needs-research headcount rows.</td></tr>`;

  const mappingPendingRows = mappingPending.length
    ? mappingPending
        .map(
          (r) => `<tr>
  <td>${esc(r.adjudication_id)}</td>
  <td>${esc(r.ticker)}</td>
  <td>${esc(r.role_phrase_raw)}</td>
  <td>${esc(r.implied_share_pct)}</td>
  <td>${esc(r.suggested_repo_label)}</td>
  <td>${esc(r.mapping_confidence)}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="6">No pending mapping adjudications.</td></tr>`;

  const roleSignalGapRows = roleSignalGaps.length
    ? roleSignalGaps
        .map((m) => {
          const filing = filingByTicker.get(m.ticker) || {};
          const queued = externalQueueRows.filter((r) => String(r.ticker || "").toUpperCase() === m.ticker);
          const pending = queued.filter((r) => String(r.review_status || "").toLowerCase() === "pending_research");
          const searchLink = pending[0]?.search_url || queued[0]?.search_url || "";
          return `<tr>
  <td>${esc(m.ticker)}</td>
  <td>${esc(m.company_name)}</td>
  <td>${esc(String(roleSignalCountByTicker.get(m.ticker) || 0))}</td>
  <td>${esc(String(queued.length))}</td>
  <td>${searchLink ? `<a href="${esc(searchLink)}" target="_blank" rel="noreferrer">search</a>` : ""}</td>
  <td>${esc(filing.filing_date || "")}</td>
  <td><a href="${esc(filing.filing_url || "#")}" target="_blank" rel="noreferrer">filing</a></td>
</tr>`;
        })
        .join("\n")
    : `<tr><td colspan="7">No role-signal gaps.</td></tr>`;

  const externalQueueReviewRows = externalQueueRows.length
    ? externalQueueRows
        .filter((r) => {
          const status = String(r.review_status || "").toLowerCase();
          return status === "pending_research" || status === "signal_captured";
        })
        .sort((a, b) => {
          const pa = String(a.priority || "P9");
          const pb = String(b.priority || "P9");
          if (pa !== pb) return pa.localeCompare(pb);
          const ta = String(a.ticker || "");
          const tb = String(b.ticker || "");
          if (ta !== tb) return ta.localeCompare(tb);
          return String(a.source_bucket || "").localeCompare(String(b.source_bucket || ""));
        })
        .map(
          (r) => `<tr>
  <td>${esc(r.ticker)}</td>
  <td>${esc(r.source_bucket_label || r.source_bucket)}</td>
  <td>${esc(r.review_status)}</td>
  <td>${r.search_url ? `<a href="${esc(r.search_url)}" target="_blank" rel="noreferrer">search</a>` : ""}</td>
  <td>${r.found_url ? `<a href="${esc(r.found_url)}" target="_blank" rel="noreferrer">source</a>` : ""}</td>
  <td>${esc(clip(r.role_phrase || "", 38))}</td>
  <td>${esc(r.implied_share_pct || "")}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="7">No external evidence queue rows yet.</td></tr>`;

  const confidencePipelineRows = confidenceRows.length
    ? [...confidenceRows]
        .sort((a, b) => {
          const order = { not_defensible_yet: 0, defensible_guess: 1, medium_high_confidence: 2 };
          const oa = order[a.defensibility_status] ?? -1;
          const ob = order[b.defensibility_status] ?? -1;
          if (oa !== ob) return oa - ob;
          return String(a.ticker).localeCompare(String(b.ticker));
        })
        .map(
          (r) => `<tr>
  <td>${esc(r.ticker)}</td>
  <td>${esc(r.company_name)}</td>
  <td>${esc(r.defensibility_status)}</td>
  <td>${esc(r.owner_agent)}</td>
  <td>${esc(r.current_stage)}</td>
  <td>${esc(clip(r.next_action, 95))}</td>
  <td>${esc(clip(r.recommended_sources, 95))}</td>
</tr>`,
        )
        .join("\n")
    : `<tr><td colspan="7">No confidence-pipeline rows found.</td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Jobs SP500 Pilot Dashboard</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <style>
    :root {
      --bg: #f7f4ec;
      --card: #fffaf0;
      --ink: #1f2a2e;
      --muted: #5a6a6f;
      --line: #d7cdb7;
      --accent: #2f7f6d;
      --accent2: #9a4d36;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 24px; background: radial-gradient(circle at 20% 20%, #fff9e8, var(--bg));
      color: var(--ink); font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
    }
    h1,h2 { margin: 0 0 12px 0; }
    .sub { color: var(--muted); margin-bottom: 20px; }
    .grid { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); margin-bottom: 16px; }
    .card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }
    .kpi { font-size: 30px; font-weight: 700; line-height: 1; margin-top: 6px; }
    .kpi-label { color: var(--muted); font-size: 13px; text-transform: uppercase; letter-spacing: .06em; }
    .charts { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(360px, 1fr)); margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
    th, td { padding: 9px 10px; border-bottom: 1px solid #eadfca; font-size: 13px; text-align: left; }
    th { background: #f2ead8; position: sticky; top: 0; z-index: 1; }
    .table-wrap { max-height: 460px; overflow: auto; border-radius: 12px; border: 1px solid var(--line); }
    .compact .table-wrap { max-height: 260px; }
    .mini-btn {
      border: 1px solid #cbbda0; background: #f2ead8; color: #1f2a2e;
      padding: 3px 8px; border-radius: 8px; font-size: 12px; cursor: pointer;
    }
    .mini-btn:hover { background: #e8dcc2; }
    .drill-controls { display: flex; gap: 10px; align-items: center; margin-bottom: 12px; }
    .drill-controls select {
      border: 1px solid #cbbda0; background: #fffaf0; color: #1f2a2e;
      border-radius: 8px; padding: 6px 8px; min-width: 280px;
    }
    .drill-grid { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); margin-bottom: 12px; }
    .chip { font-size: 12px; border: 1px solid #d7cdb7; border-radius: 999px; padding: 3px 10px; display: inline-block; margin-right: 6px; }
    .mono { font-family: "Consolas", "SFMono-Regular", "Menlo", monospace; font-size: 12px; }
    .split { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(420px, 1fr)); margin-bottom: 16px; }
    .small td, .small th { font-size: 12px; padding: 7px 8px; }
    pre { background: #f3ecdc; border: 1px solid #dfd2b8; border-radius: 8px; padding: 10px; overflow: auto; }
    code { background: #f3ecdc; border: 1px solid #dfd2b8; border-radius: 6px; padding: 1px 6px; }
    .foot { color: var(--muted); font-size: 12px; margin-top: 12px; }
  </style>
</head>
<body>
  <h1>Pilot 25 Vulnerability Dashboard</h1>
  <div class="sub">Run: ${RUN_ID} | Generated: ${NOW_ISO}</div>

  <div class="grid">
    <div class="card"><div class="kpi-label">Companies</div><div class="kpi">${merged.length}</div></div>
    <div class="card"><div class="kpi-label">Conservative Published</div><div class="kpi">${publishedConservative}</div></div>
    <div class="card"><div class="kpi-label">Relaxed Scored</div><div class="kpi">${relaxedCount}</div></div>
    <div class="card"><div class="kpi-label">Medium/High Confidence</div><div class="kpi">${defensibilityCounts.medium_high_confidence}</div></div>
    <div class="card"><div class="kpi-label">Defensible Guess</div><div class="kpi">${defensibilityCounts.defensible_guess}</div></div>
    <div class="card"><div class="kpi-label">Not Defensible Yet</div><div class="kpi">${defensibilityCounts.not_defensible_yet}</div></div>
    <div class="card"><div class="kpi-label">Relaxed Uses Sector Priors</div><div class="kpi">${merged.filter(m => m.used_sector_priors === "yes").length}</div></div>
    <div class="card"><div class="kpi-label">Headcount Pending</div><div class="kpi">${headcountPending.length}</div></div>
    <div class="card"><div class="kpi-label">Headcount Needs Research</div><div class="kpi">${headcountNeedsResearch.length}</div></div>
    <div class="card"><div class="kpi-label">Mapping Pending</div><div class="kpi">${mappingPending.length}</div></div>
    <div class="card"><div class="kpi-label">Role-Signal Gaps</div><div class="kpi">${roleSignalGaps.length}</div></div>
    <div class="card"><div class="kpi-label">External Pending Research</div><div class="kpi">${externalPending.length}</div></div>
    <div class="card"><div class="kpi-label">External Signals Captured</div><div class="kpi">${externalCaptured.length}</div></div>
    <div class="card"><div class="kpi-label">External Signals Approved</div><div class="kpi">${externalApproved.length}</div></div>
  </div>

  <div class="charts">
    <div class="card">
      <h2>Top 10 (Relaxed)</h2>
      <canvas id="topRelaxed"></canvas>
    </div>
    <div class="card">
      <h2>Conservative vs Relaxed</h2>
      <canvas id="scatter"></canvas>
    </div>
    <div class="card">
      <h2>Relaxed Confidence</h2>
      <canvas id="confidence"></canvas>
    </div>
    <div class="card">
      <h2>Conservative Blockers</h2>
      <canvas id="blockers"></canvas>
    </div>
  </div>

  <h2>Confidence Triage Assembly Line</h2>
  <div class="card">
    <div class="table-wrap">
      <table class="small">
        <thead><tr><th>Ticker</th><th>Company</th><th>Status</th><th>Owner</th><th>Stage</th><th>Next Action</th><th>Recommended Sources</th></tr></thead>
        <tbody>${confidencePipelineRows}</tbody>
      </table>
    </div>
    <div class="foot">Goal: move each company to medium/high confidence, otherwise produce a clearly-labeled defensible estimate.</div>
  </div>

  <h2>Human Review Queue</h2>
  <div class="split compact">
    <div class="card">
      <h2>Headcount Pending</h2>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Ticker</th><th>Company</th><th>Candidate</th><th>Confidence</th><th>Citation</th></tr></thead>
          <tbody>${headPendingRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Headcount Needs Research</h2>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Ticker</th><th>Company</th><th>Queue Note</th><th>Status</th></tr></thead>
          <tbody>${headResearchRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Mapping Adjudication Pending</h2>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Adjudication ID</th><th>Ticker</th><th>Phrase</th><th>Share %</th><th>Suggested Label</th><th>Conf</th></tr></thead>
          <tbody>${mappingPendingRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Needs Role Signal</h2>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Ticker</th><th>Company</th><th>Signals Found</th><th>External Queue</th><th>Quick Search</th><th>Filing Date</th><th>Primary Filing</th></tr></thead>
          <tbody>${roleSignalGapRows}</tbody>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>External Role-Evidence Queue</h2>
      <div class="table-wrap">
        <table class="small">
          <thead><tr><th>Ticker</th><th>Source Bucket</th><th>Status</th><th>Search</th><th>Found URL</th><th>Role Phrase</th><th>Share %</th></tr></thead>
          <tbody>${externalQueueReviewRows}</tbody>
        </table>
      </div>
    </div>
  </div>

  <div class="card">
    <h2>How You Can Help</h2>
    <p>1) Update review statuses and values in these files, then 2) rerun recompute commands.</p>
    <p class="mono">Headcount review file: ${esc(headcountPath)}</p>
    <p class="mono">Mapping adjudication file: ${esc(adjudicationPath)}</p>
    <p class="mono">Role-signal source file: ${esc(roleMixPath)}</p>
    <p class="mono">External evidence queue file: ${esc(externalQueuePath || "not generated yet")}</p>
    <p class="mono">Source search reference file: ${esc(sourceSearchReferencePath || "not generated yet")}</p>
    <pre>node scripts/compute-company-results-verified-headcount.mjs
node scripts/integrate-external-role-signals.mjs
node scripts/apply-external-adjudications.mjs
node scripts/compute-company-vulnerability-v2-conservative.mjs
node scripts/qa-methodology-v2.mjs
node scripts/compute-company-vulnerability-v2-relaxed.mjs
node scripts/generate-initial-results-25-summary.mjs
node scripts/generate-confidence-pipeline-status.mjs
node scripts/generate-external-role-evidence-queue.mjs
FORCE_ALL_TICKERS=1 node scripts/generate-external-role-evidence-queue.mjs
node scripts/generate-results-dashboard.mjs
node scripts/generate-process-kanban.mjs</pre>
    <div class="foot">Tip: run full <code>node scripts/run-company-agents.mjs</code> only when you want to rebuild queues; use the recompute block above after manual edits.</div>
  </div>

  <h2>Company Detail</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Company</th>
          <th>View</th>
          <th>Dossier</th>
          <th>Reasoning</th>
          <th>Conservative</th>
          <th>Relaxed</th>
          <th>Relaxed Conf</th>
          <th>Headcount</th>
          <th>Blocker</th>
          <th>Stage</th>
        </tr>
      </thead>
      <tbody>
        ${tableRows}
      </tbody>
    </table>
  </div>
  <div class="foot">Use conservative scores for high-confidence conclusions; use relaxed scores for exploration only.</div>
  <div class="foot">Latest dossier index: ${esc(dossierIndexPath || "not found")}</div>
  <div class="foot">Latest reasoning index: ${esc(reasoningIndexPath || "not found")}</div>

  <h2 id="company-drilldown-section">Company Drilldown</h2>
  <div class="card">
    <div class="drill-controls">
      <label for="companyPick">Select Company</label>
      <select id="companyPick">${companyOptions}</select>
      <span class="foot">Click any <code>view</code> button above to jump here.</span>
    </div>
    <div id="companyDrilldown"></div>
  </div>

  <script>
    const merged = ${JSON.stringify(merged)};
    const top10 = ${JSON.stringify(top10Relaxed)};
    const confidenceCounts = ${JSON.stringify(confidenceCounts)};
    const blockerCounts = ${JSON.stringify(blockerCounts)};
    const companyDrilldownRows = ${JSON.stringify(companyDrilldownRows)};
    const companyDrilldownByTicker = Object.fromEntries(companyDrilldownRows.map(d => [d.ticker, d]));

    const palette = ["#2f7f6d","#9a4d36","#ce8e2f","#476f9f","#7b5ea7","#718a54","#c45f82","#4f4f4f"];
    const escHtml = (text) => String(text ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const fmt2 = (v) => Number.isFinite(Number(v)) ? Number(v).toFixed(2) : "";

    new Chart(document.getElementById('topRelaxed'), {
      type: 'bar',
      data: {
        labels: top10.map(d => d.ticker),
        datasets: [{ label: 'Relaxed Score', data: top10.map(d => d.relaxed_score), backgroundColor: palette[0] }]
      },
      options: { responsive: true, plugins: { legend: { display: false } } }
    });

    new Chart(document.getElementById('scatter'), {
      type: 'scatter',
      data: {
        datasets: [{
          label: 'Companies',
          data: merged.filter(d => d.relaxed_score !== null).map(d => ({ x: d.conservative_score ?? 0, y: d.relaxed_score, label: d.ticker })),
          backgroundColor: palette[1]
        }]
      },
      options: {
        scales: {
          x: { title: { display: true, text: 'Conservative Score (null shown as 0)' } },
          y: { title: { display: true, text: 'Relaxed Score' } }
        },
        plugins: {
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const p = ctx.raw;
                return p.label + ': (' + p.x.toFixed(2) + ', ' + p.y.toFixed(2) + ')';
              }
            }
          }
        }
      }
    });

    new Chart(document.getElementById('confidence'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(confidenceCounts),
        datasets: [{ data: Object.values(confidenceCounts), backgroundColor: palette }]
      }
    });

    new Chart(document.getElementById('blockers'), {
      type: 'bar',
      data: {
        labels: Object.keys(blockerCounts),
        datasets: [{ label: 'Count', data: Object.values(blockerCounts), backgroundColor: palette[3] }]
      },
      options: { plugins: { legend: { display: false } } }
    });

    function renderDrilldown(ticker) {
      const d = companyDrilldownByTicker[String(ticker || '').toUpperCase()];
      const mount = document.getElementById('companyDrilldown');
      if (!d || !mount) return;

      const approvedRows = (d.approved_mappings || []).length
        ? d.approved_mappings.map((r) =>
            '<tr>' +
              '<td>' + escHtml(r.role_phrase_raw) + '</td>' +
              '<td>' + escHtml(r.approved_repo_label) + '</td>' +
              '<td>' + escHtml(r.approved_share_pct) + '</td>' +
              '<td>' + escHtml(r.mapping_confidence) + '</td>' +
              '<td>' + escHtml(r.source_hint) + '</td>' +
            '</tr>'
          ).join('')
        : '<tr><td colspan="5">No approved mappings.</td></tr>';

      const pendingRows = (d.pending_mappings || []).length
        ? d.pending_mappings.map((r) =>
            '<tr>' +
              '<td>' + escHtml(r.role_phrase_raw) + '</td>' +
              '<td>' + escHtml(r.approved_repo_label) + '</td>' +
              '<td>' + escHtml(r.approved_share_pct) + '</td>' +
              '<td>' + escHtml(r.mapping_confidence) + '</td>' +
              '<td>' + escHtml(r.source_hint) + '</td>' +
            '</tr>'
          ).join('')
        : '<tr><td colspan="5">No pending mappings.</td></tr>';

      const evidenceRows = (d.external_evidence || []).length
        ? d.external_evidence.map((r) => {
            const foundLink = r.found_url
              ? '<a href="' + escHtml(r.found_url) + '" target="_blank" rel="noreferrer">source</a>'
              : '';
            const searchLink = r.search_url
              ? '<a href="' + escHtml(r.search_url) + '" target="_blank" rel="noreferrer">search</a>'
              : '';
            return '<tr>' +
              '<td>' + escHtml(r.source_bucket_label) + '</td>' +
              '<td>' + escHtml(r.review_status) + '</td>' +
              '<td>' + escHtml(r.role_phrase) + '</td>' +
              '<td>' + escHtml(r.implied_share_pct) + '</td>' +
              '<td>' + foundLink + '</td>' +
              '<td>' + searchLink + '</td>' +
            '</tr>';
          }).join('')
        : '<tr><td colspan="6">No external evidence rows.</td></tr>';

      const roleSignalRows = (d.role_signals || []).length
        ? d.role_signals.map((r) =>
            '<tr>' +
              '<td>' + escHtml(r.role_phrase) + '</td>' +
              '<td>' + escHtml(r.signal_type) + '</td>' +
              '<td>' + escHtml(r.signal_value) + '</td>' +
              '<td>' + escHtml(r.implied_share_pct) + '</td>' +
              '<td>' + escHtml(r.citation_id) + '</td>' +
              '<td>' + escHtml(r.quote) + '</td>' +
            '</tr>'
          ).join('')
        : '<tr><td colspan="6">No role signals found.</td></tr>';

      const dossierLink = d.dossier_rel_path
        ? '<a href="' + escHtml(d.dossier_rel_path) + '" target="_blank" rel="noreferrer">Open dossier</a>'
        : '';
      const reasoningLink = d.reasoning_rel_path
        ? '<a href="' + escHtml(d.reasoning_rel_path) + '" target="_blank" rel="noreferrer">Open reasoning brief</a>'
        : '';
      const separator = dossierLink && reasoningLink ? ' | ' : '';

      mount.innerHTML =
        '<div class="drill-grid">' +
          '<div class="card"><div class="kpi-label">Ticker</div><div class="kpi">' + escHtml(d.ticker) + '</div></div>' +
          '<div class="card"><div class="kpi-label">Conservative</div><div class="kpi">' + fmt2(d.conservative_score) + '</div></div>' +
          '<div class="card"><div class="kpi-label">Relaxed</div><div class="kpi">' + fmt2(d.relaxed_score) + '</div></div>' +
          '<div class="card"><div class="kpi-label">Headcount</div><div class="kpi">' + escHtml(d.headcount_status) + '</div></div>' +
        '</div>' +
        '<div style="margin-bottom:10px;">' +
          '<span class="chip">Status: ' + escHtml(d.defensibility_status) + '</span>' +
          '<span class="chip">Owner: ' + escHtml(d.owner_agent) + '</span>' +
          '<span class="chip">Stage: ' + escHtml(d.stage) + '</span>' +
          '<span class="chip">Sector Priors: ' + escHtml(d.used_sector_priors) + '</span>' +
        '</div>' +
        '<div style="margin-bottom:12px;">' +
          '<div><strong>' + escHtml(d.company_name) + '</strong></div>' +
          '<div class="foot">Next: ' + escHtml(d.next_action || '') + '</div>' +
          '<div class="foot">Blocker: ' + escHtml(d.blocker || 'none') + '</div>' +
          '<div>' + dossierLink + separator + reasoningLink + '</div>' +
        '</div>' +
        '<div class="split compact">' +
          '<div class="card">' +
            '<h2>Approved Role Breakdown</h2>' +
            '<div class="table-wrap"><table class="small"><thead><tr><th>Phrase</th><th>Label</th><th>Share %</th><th>Conf</th><th>Evidence Hint</th></tr></thead><tbody>' + approvedRows + '</tbody></table></div>' +
          '</div>' +
          '<div class="card">' +
            '<h2>Pending Mappings</h2>' +
            '<div class="table-wrap"><table class="small"><thead><tr><th>Phrase</th><th>Suggested Label</th><th>Share %</th><th>Conf</th><th>Evidence Hint</th></tr></thead><tbody>' + pendingRows + '</tbody></table></div>' +
          '</div>' +
          '<div class="card">' +
            '<h2>External Evidence</h2>' +
            '<div class="table-wrap"><table class="small"><thead><tr><th>Source Bucket</th><th>Status</th><th>Role Phrase</th><th>Share %</th><th>Found</th><th>Search</th></tr></thead><tbody>' + evidenceRows + '</tbody></table></div>' +
          '</div>' +
          '<div class="card">' +
            '<h2>Role Signals</h2>' +
            '<div class="table-wrap"><table class="small"><thead><tr><th>Role Phrase</th><th>Type</th><th>Value</th><th>Share %</th><th>Citation</th><th>Quote</th></tr></thead><tbody>' + roleSignalRows + '</tbody></table></div>' +
          '</div>' +
        '</div>';
    }

    const companyPick = document.getElementById("companyPick");
    if (companyPick) {
      companyPick.addEventListener("change", (e) => renderDrilldown(e.target.value));
    }
    for (const btn of document.querySelectorAll("[data-open-company]")) {
      btn.addEventListener("click", () => {
        const t = btn.getAttribute("data-open-company");
        if (companyPick) companyPick.value = t;
        renderDrilldown(t);
        const target = document.getElementById("company-drilldown-section");
        if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    renderDrilldown((companyPick && companyPick.value) || (merged[0] && merged[0].ticker) || "");
  </script>
</body>
</html>`;

  const outPath = path.join(OUT_DIR, `${RUN_ID}__dashboard.html`);
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote dashboard: ${outPath}`);
}

main();
