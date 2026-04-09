#!/usr/bin/env node
/**
 * generate-treemap.mjs
 *
 * Generates an interactive D3 treemap HTML visualization of AI vulnerability
 * scores for all companies in the SP500 pipeline.
 *
 * Reads:
 *  - data/outputs/*__company_vulnerability_v2_conservative__*.csv
 *  - data/outputs/*__company_vulnerability_v2_relaxed__*.csv
 *  - data/intermediate/*__pilot25_companies__*.csv  (for sector info)
 *
 * Writes:
 *  - data/outputs/<RUN_ID>__treemap.html
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const RUN_ID = process.env.RUN_ID || "pilot25_2026Q1_v1";
const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "data", "outputs");
const INT_DIR = path.join(ROOT, "data", "intermediate");
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
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i += 1; continue; }
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] ?? ""; });
    return row;
  });
}

function latest(dir, pattern) {
  const files = readdirSync(dir)
    .filter((f) => f.startsWith(RUN_ID) && pattern.test(f))
    .sort();
  if (!files.length) throw new Error(`No file found in ${dir} for ${pattern}`);
  return path.join(dir, files[files.length - 1]);
}

function n(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

function esc(text) {
  return String(text ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function main() {
  const conservativePath = latest(OUT_DIR, /__company_vulnerability_v2_conservative__/);
  const relaxedPath = latest(OUT_DIR, /__company_vulnerability_v2_relaxed__/);
  const pilotPath = latest(INT_DIR, /__pilot\d+_companies__/);

  const conservativeRows = parseSimpleCsv(readFileSync(conservativePath, "utf8"));
  const relaxedRows = parseSimpleCsv(readFileSync(relaxedPath, "utf8"));
  const pilotRows = parseSimpleCsv(readFileSync(pilotPath, "utf8"));

  const conservativeByTicker = new Map(conservativeRows.map((r) => [r.ticker, r]));
  const relaxedByTicker = new Map(relaxedRows.map((r) => [r.ticker, r]));
  const sectorByTicker = new Map(pilotRows.map((r) => [r.ticker, r.gics_sector || "Unknown"]));

  // Build merged company list
  const allTickers = [...new Set([
    ...conservativeByTicker.keys(),
    ...relaxedByTicker.keys(),
  ])].sort();

  const companies = allTickers.map((ticker) => {
    const c = conservativeByTicker.get(ticker) || {};
    const r = relaxedByTicker.get(ticker) || {};
    const sector = sectorByTicker.get(ticker) || "Unknown";
    const conservativeScore = n(c.ai_vulnerability_score_v2);
    const relaxedScore = n(r.estimated_ai_vulnerability_score);
    const displayScore = conservativeScore !== null ? conservativeScore : relaxedScore;
    const isConservative = conservativeScore !== null;
    return {
      ticker,
      company_name: c.company_name || r.company_name || ticker,
      sector,
      conservative_score: conservativeScore,
      relaxed_score: relaxedScore,
      display_score: displayScore,
      is_conservative: isConservative,
      confidence: r.confidence_level || (isConservative ? "high" : "low"),
      used_priors: r.used_sector_priors === "yes",
    };
  }).filter((c) => c.display_score !== null);

  // Group by sector for treemap hierarchy
  const sectorGroups = {};
  for (const c of companies) {
    const s = c.sector || "Unknown";
    if (!sectorGroups[s]) sectorGroups[s] = [];
    sectorGroups[s].push(c);
  }

  // Build D3 hierarchy data
  const hierarchyData = {
    name: "SP500",
    children: Object.entries(sectorGroups)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([sector, children]) => ({
        name: sector,
        children: children
          .sort((a, b) => (b.display_score || 0) - (a.display_score || 0))
          .map((c) => ({
            name: c.ticker,
            company_name: c.company_name,
            value: Math.max(0.5, c.display_score || 0),
            display_score: c.display_score,
            conservative_score: c.conservative_score,
            relaxed_score: c.relaxed_score,
            is_conservative: c.is_conservative,
            confidence: c.confidence,
            used_priors: c.used_priors,
            sector: c.sector,
          })),
      })),
  };

  const statsTotal = companies.length;
  const statsConservative = companies.filter((c) => c.is_conservative).length;
  const statsRelaxedOnly = companies.filter((c) => !c.is_conservative && c.relaxed_score !== null).length;
  const avgScore = companies.reduce((a, b) => a + (b.display_score || 0), 0) / (statsTotal || 1);

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SP500 AI Vulnerability Treemap</title>
  <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
  <style>
    :root {
      --bg: #f7f4ec;
      --card: #fffaf0;
      --ink: #1f2a2e;
      --muted: #5a6a6f;
      --line: #d7cdb7;
      --accent: #2f7f6d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--ink);
      font-family: "IBM Plex Sans", "Segoe UI", sans-serif;
      padding: 20px;
    }
    h1 { font-size: 22px; margin-bottom: 4px; }
    .sub { color: var(--muted); font-size: 13px; margin-bottom: 16px; }
    .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
    .kpi { background: var(--card); border: 1px solid var(--line); border-radius: 10px; padding: 10px 16px; min-width: 140px; }
    .kpi-val { font-size: 26px; font-weight: 700; line-height: 1.1; }
    .kpi-label { font-size: 11px; color: var(--muted); text-transform: uppercase; letter-spacing: .06em; margin-top: 2px; }
    .legend { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; font-size: 12px; }
    .legend-item { display: flex; align-items: center; gap: 6px; }
    .legend-swatch { width: 14px; height: 14px; border-radius: 3px; flex-shrink: 0; }
    #treemap { width: 100%; border-radius: 12px; overflow: hidden; }
    #tooltip {
      position: fixed; pointer-events: none; display: none;
      background: rgba(31,42,46,0.92); color: #fff; border-radius: 8px;
      padding: 10px 14px; font-size: 12px; line-height: 1.6; max-width: 260px;
      z-index: 999;
    }
    .controls { display: flex; gap: 10px; margin-bottom: 14px; flex-wrap: wrap; align-items: center; }
    select, button {
      padding: 6px 12px; border: 1px solid var(--line); border-radius: 6px;
      background: var(--card); color: var(--ink); font-size: 13px; cursor: pointer;
    }
    .foot { margin-top: 10px; color: var(--muted); font-size: 11px; }
  </style>
</head>
<body>
  <h1>SP500 AI Vulnerability Treemap</h1>
  <div class="sub">Run: ${esc(RUN_ID)} &nbsp;|&nbsp; Generated: ${esc(NOW_ISO)} &nbsp;|&nbsp; Score source: conservative where available, relaxed otherwise</div>

  <div class="kpis">
    <div class="kpi"><div class="kpi-val">${statsTotal}</div><div class="kpi-label">Companies Scored</div></div>
    <div class="kpi"><div class="kpi-val">${statsConservative}</div><div class="kpi-label">Conservative Lock</div></div>
    <div class="kpi"><div class="kpi-val">${statsRelaxedOnly}</div><div class="kpi-label">Relaxed Only</div></div>
    <div class="kpi"><div class="kpi-val">${avgScore.toFixed(2)}</div><div class="kpi-label">Avg Score</div></div>
  </div>

  <div class="controls">
    <label for="colorMode">Color by:</label>
    <select id="colorMode">
      <option value="score">Score (green→red)</option>
      <option value="sector">Sector</option>
      <option value="confidence">Confidence</option>
    </select>
    <label for="sizeMode">Size by:</label>
    <select id="sizeMode">
      <option value="score">Score</option>
      <option value="equal">Equal</option>
    </select>
    <button id="resetZoom">Reset zoom</button>
  </div>

  <div class="legend" id="legend"></div>
  <div id="treemap"></div>
  <div id="tooltip"></div>
  <div class="foot">
    Cell size = vulnerability score (larger = higher risk). Conservative scores shown with solid border; relaxed-only with dashed.
    Sector label cells are not clickable. Click a company tile to zoom; click background to reset.
  </div>

  <script>
    const DATA = ${JSON.stringify(hierarchyData)};
    const SECTORS = [...new Set(DATA.children.map(d => d.name))].sort();

    // Color scales
    const scoreColor = d3.scaleSequential(d3.interpolateRdYlGn).domain([10, 5]).clamp(true);
    const sectorPalette = d3.schemeTableau10;
    const sectorColor = d3.scaleOrdinal().domain(SECTORS).range(sectorPalette);
    const confidenceColor = { high: "#2f7f6d", medium: "#ce8e2f", low: "#9a4d36", unknown: "#aaa" };

    function getColor(d, mode) {
      if (!d.data.name || d.children) return "#e8e0cc"; // sector node
      if (mode === "sector") return sectorColor(d.data.sector);
      if (mode === "confidence") return confidenceColor[d.data.confidence] || "#aaa";
      return scoreColor(d.data.display_score || 0);
    }

    let colorMode = "score";
    let sizeMode = "score";

    function buildLegend() {
      const leg = document.getElementById("legend");
      leg.innerHTML = "";
      if (colorMode === "sector") {
        SECTORS.forEach((s, i) => {
          const div = document.createElement("div");
          div.className = "legend-item";
          div.innerHTML = \`<div class="legend-swatch" style="background:\${sectorPalette[i % sectorPalette.length]}"></div><span>\${s}</span>\`;
          leg.appendChild(div);
        });
      } else if (colorMode === "score") {
        const stops = [5, 6, 7, 8, 9, 10];
        stops.forEach(v => {
          const div = document.createElement("div");
          div.className = "legend-item";
          div.innerHTML = \`<div class="legend-swatch" style="background:\${scoreColor(v)}"></div><span>\${v}</span>\`;
          leg.appendChild(div);
        });
      } else {
        Object.entries(confidenceColor).forEach(([k, v]) => {
          const div = document.createElement("div");
          div.className = "legend-item";
          div.innerHTML = \`<div class="legend-swatch" style="background:\${v}"></div><span>\${k}</span>\`;
          leg.appendChild(div);
        });
      }
    }

    function render() {
      const container = document.getElementById("treemap");
      container.innerHTML = "";
      const W = container.clientWidth || window.innerWidth - 40;
      const H = Math.max(400, Math.round(W * 0.6));

      const root = d3.hierarchy(DATA)
        .sum(d => d.children ? 0 : (sizeMode === "equal" ? 1 : Math.max(0.5, d.value || 0)))
        .sort((a, b) => b.value - a.value);

      d3.treemap()
        .size([W, H])
        .paddingOuter(4)
        .paddingInner(2)
        .paddingTop(20)
        .round(true)(root);

      const svg = d3.create("svg")
        .attr("width", W)
        .attr("height", H)
        .attr("viewBox", \`0 0 \${W} \${H}\`)
        .style("font-family", "IBM Plex Sans, Segoe UI, sans-serif");

      // Sector groups (depth=1)
      const sectors = svg.selectAll("g.sector")
        .data(root.children || [])
        .join("g").attr("class", "sector");

      sectors.append("rect")
        .attr("x", d => d.x0).attr("y", d => d.y0)
        .attr("width", d => d.x1 - d.x0).attr("height", d => d.y1 - d.y0)
        .attr("fill", "#e8e0cc").attr("rx", 6);

      sectors.append("text")
        .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 14)
        .attr("fill", "#5a6a6f").attr("font-size", 11).attr("font-weight", 600)
        .text(d => d.data.name);

      // Company leaves (depth=2)
      const tooltip = document.getElementById("tooltip");

      const leaves = svg.selectAll("g.leaf")
        .data(root.leaves())
        .join("g").attr("class", "leaf")
        .style("cursor", "pointer");

      leaves.append("rect")
        .attr("x", d => d.x0 + 1).attr("y", d => d.y0 + 1)
        .attr("width", d => Math.max(0, d.x1 - d.x0 - 2))
        .attr("height", d => Math.max(0, d.y1 - d.y0 - 2))
        .attr("fill", d => getColor(d, colorMode))
        .attr("rx", 4)
        .attr("stroke", d => d.data.is_conservative ? "#1f2a2e" : "#888")
        .attr("stroke-width", d => d.data.is_conservative ? 1.5 : 0.5)
        .attr("stroke-dasharray", d => d.data.is_conservative ? null : "3,2");

      leaves.append("text")
        .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 13)
        .attr("fill", d => {
          const score = d.data.display_score || 0;
          return score >= 8 ? "#fff" : "#1f2a2e";
        })
        .attr("font-size", d => {
          const w = d.x1 - d.x0;
          return w < 35 ? 8 : w < 60 ? 10 : 11;
        })
        .attr("font-weight", 600)
        .text(d => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 18 || h < 14) return "";
          return d.data.name;
        });

      leaves.append("text")
        .attr("x", d => d.x0 + 4).attr("y", d => d.y0 + 25)
        .attr("fill", d => {
          const score = d.data.display_score || 0;
          return score >= 8 ? "rgba(255,255,255,0.85)" : "#444";
        })
        .attr("font-size", 9)
        .text(d => {
          const w = d.x1 - d.x0;
          const h = d.y1 - d.y0;
          if (w < 30 || h < 28) return "";
          return d.data.display_score !== null ? d.data.display_score.toFixed(1) : "";
        });

      leaves
        .on("mousemove", (event, d) => {
          const dd = d.data;
          tooltip.style.display = "block";
          tooltip.style.left = (event.clientX + 14) + "px";
          tooltip.style.top = (event.clientY - 10) + "px";
          tooltip.innerHTML = [
            \`<strong>\${dd.name}</strong> — \${dd.company_name}\`,
            \`Sector: \${dd.sector}\`,
            \`Score: \${dd.display_score !== null ? dd.display_score.toFixed(2) : "N/A"}\`,
            dd.conservative_score !== null ? \`Conservative: \${dd.conservative_score.toFixed(2)}\` : "Conservative: —",
            dd.relaxed_score !== null ? \`Relaxed: \${dd.relaxed_score.toFixed(2)}\` : "Relaxed: —",
            \`Confidence: \${dd.confidence}\`,
            dd.used_priors ? "⚠ Uses sector priors" : "",
          ].filter(Boolean).join("<br>");
        })
        .on("mouseleave", () => { tooltip.style.display = "none"; });

      container.appendChild(svg.node());
      buildLegend();
    }

    document.getElementById("colorMode").addEventListener("change", (e) => { colorMode = e.target.value; render(); });
    document.getElementById("sizeMode").addEventListener("change", (e) => { sizeMode = e.target.value; render(); });
    document.getElementById("resetZoom").addEventListener("click", () => render());
    window.addEventListener("resize", () => render());
    render();
  </script>
</body>
</html>`;

  const outPath = path.join(OUT_DIR, `${RUN_ID}__treemap.html`);
  writeFileSync(outPath, html, "utf8");
  console.log(`Wrote treemap: ${outPath}`);
  console.log(`Companies in treemap: ${companies.length}`);
  console.log(`Sectors: ${Object.keys(sectorGroups).join(", ")}`);
}

main();
