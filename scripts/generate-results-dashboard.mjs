#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const NOW_ISO = new Date().toISOString();

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

function latest(pattern) {
  const files = readdirSync(OUT_DIR)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found for ${pattern}`);
  return path.join(OUT_DIR, files[files.length - 1]);
}

function n(value) {
  const x = Number(value);
  return Number.isFinite(x) ? x : null;
}

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function main() {
  const conservativePath = latest(/__company_vulnerability_v2_conservative__/);
  const relaxedPath = latest(/__company_vulnerability_v2_relaxed__/);
  const summaryPath = latest(/__initial_results_25_summary__/);

  const conservativeRows = parseSimpleCsv(readFileSync(conservativePath, "utf8"));
  const relaxedRows = parseSimpleCsv(readFileSync(relaxedPath, "utf8"));
  const summaryRows = parseSimpleCsv(readFileSync(summaryPath, "utf8"));

  const conservativeByTicker = new Map(conservativeRows.map((r) => [r.ticker, r]));
  const relaxedByTicker = new Map(relaxedRows.map((r) => [r.ticker, r]));
  const summaryByTicker = new Map(summaryRows.map((r) => [r.ticker, r]));

  const tickers = [...new Set([...conservativeByTicker.keys(), ...relaxedByTicker.keys()])].sort();
  const merged = tickers.map((ticker) => {
    const c = conservativeByTicker.get(ticker) || {};
    const r = relaxedByTicker.get(ticker) || {};
    const s = summaryByTicker.get(ticker) || {};
    return {
      ticker,
      company_name: c.company_name || r.company_name || s.company_name || "",
      conservative_score: n(c.ai_vulnerability_score_v2),
      conservative_share: n(c.approved_role_share_pct),
      conservative_threshold_met: c.threshold_met || "",
      relaxed_score: n(r.estimated_ai_vulnerability_score),
      relaxed_confidence: r.confidence_level || "",
      used_sector_priors: r.used_sector_priors || "",
      headcount_status: s.headcount_verification_status || "",
      blocker: s.blocker || "",
      stage: s.stage || "",
    };
  });

  const publishedConservative = merged.filter((m) => m.conservative_score !== null).length;
  const relaxedCount = merged.filter((m) => m.relaxed_score !== null).length;

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

  const tableRows = merged
    .map(
      (m) => `<tr>
  <td>${esc(m.ticker)}</td>
  <td>${esc(m.company_name)}</td>
  <td>${m.conservative_score === null ? "" : m.conservative_score.toFixed(2)}</td>
  <td>${m.relaxed_score === null ? "" : m.relaxed_score.toFixed(2)}</td>
  <td>${esc(m.relaxed_confidence)}</td>
  <td>${esc(m.headcount_status)}</td>
  <td>${esc(m.blocker)}</td>
  <td>${esc(m.stage)}</td>
</tr>`,
    )
    .join("\n");

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
    <div class="card"><div class="kpi-label">Relaxed Uses Sector Priors</div><div class="kpi">${merged.filter(m => m.used_sector_priors === "yes").length}</div></div>
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

  <h2>Company Detail</h2>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>Ticker</th>
          <th>Company</th>
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

  <script>
    const merged = ${JSON.stringify(merged)};
    const top10 = ${JSON.stringify(top10Relaxed)};
    const confidenceCounts = ${JSON.stringify(confidenceCounts)};
    const blockerCounts = ${JSON.stringify(blockerCounts)};

    const palette = ["#2f7f6d","#9a4d36","#ce8e2f","#476f9f","#7b5ea7","#718a54","#c45f82","#4f4f4f"];

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
  </script>
</body>
</html>`;

  const outPath = path.join(OUT_DIR, `${RUN_ID}__dashboard.html`);
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote dashboard: ${outPath}`);
}

main();
