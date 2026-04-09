#!/usr/bin/env node

/**
 * build-treemap-data.mjs
 *
 * Parses all data sources and outputs a combined JSON blob for the
 * S&P 500 AI Vulnerability treemap visualization.
 *
 * Usage:
 *   node scripts/build-treemap-data.mjs
 */

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const RAW_DIR = path.join(ROOT, "data", "raw");
const INT_DIR = path.join(ROOT, "data", "intermediate");
const OUT_DIR = path.join(ROOT, "data", "outputs");

// ── Helpers ──

function parseSimpleCsv(content) {
  const lines = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trimEnd().split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const cells = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; continue; }
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

function latestFile(dir, pattern) {
  const files = readdirSync(dir).filter((f) => pattern.test(f)).sort();
  if (!files.length) throw new Error(`No file matching ${pattern} in ${dir}`);
  return path.join(dir, files[files.length - 1]);
}

// ── 1. Parse S&P 500 universe from Wikipedia markup ──

console.log("Parsing S&P 500 universe from Wikipedia...");
const wikiPath = path.join(RAW_DIR, "sp500_2026Q1_v1__sp500_wikipedia_raw__2026-03-18T19-27-00.983Z.txt");
const wikiText = readFileSync(wikiPath, "utf8");

const universe = [];
// Match patterns like: |{{NyseSymbol|TICKER}} or |{{NasdaqSymbol|TICKER}} or |{{BZX link|TICKER}}
// followed by |[[Company Name]]|| GICS Sector
const lines = wikiText.split("\n");
for (let i = 0; i < lines.length; i++) {
  const tickerMatch = lines[i].match(/\{\{(?:Nyse|Nasdaq)Symbol\|([A-Z.]+)\}\}/) ||
                      lines[i].match(/\{\{BZX link\|([A-Z.]+)\}\}/);
  if (!tickerMatch) continue;
  const ticker = tickerMatch[1];

  // Next line has company name and sector
  const nextLine = lines[i + 1];
  if (!nextLine) continue;

  // Some entries have company and sector on same line as ticker (KKR style)
  const sameLine = nextLine.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]\s*\|\|\s*([^|]+?)(?:\s*\|\||\s*$)/);
  if (!sameLine) {
    // Try multi-line approach: |[[Company Name]]|| GICS Sector
    const nameMatch = nextLine.match(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/);
    if (!nameMatch) continue;
    const companyName = nameMatch[2] || nameMatch[1];
    const sectorMatch = nextLine.match(/\]\]\|\|\s*([^|]+?)(?:\s*\|\||\s*$)/);
    if (!sectorMatch) continue;
    const sector = sectorMatch[1].trim();
    universe.push({ ticker, company_name: companyName, gics_sector: sector });
  } else {
    const companyName = sameLine[2] || sameLine[1];
    const sector = sameLine[3].trim();
    universe.push({ ticker, company_name: companyName, gics_sector: sector });
  }
}

// Add manually missing tickers (dual-class shares, special parsing issues)
const MISSING_MANUAL = [
  { ticker: "GOOG", company_name: "Alphabet (Class C)", gics_sector: "Communication Services" },
  { ticker: "FOXA", company_name: "Fox Corporation (Class A)", gics_sector: "Communication Services" },
  { ticker: "FOX", company_name: "Fox Corporation (Class B)", gics_sector: "Communication Services" },
  { ticker: "NWSA", company_name: "News Corp (Class A)", gics_sector: "Communication Services" },
  { ticker: "NWS", company_name: "News Corp (Class B)", gics_sector: "Communication Services" },
  { ticker: "APO", company_name: "Apollo Global Management", gics_sector: "Financials" },
  { ticker: "BX", company_name: "Blackstone", gics_sector: "Financials" },
  { ticker: "VST", company_name: "Vistra", gics_sector: "Utilities" },
  { ticker: "XYZ", company_name: "Block Inc.", gics_sector: "Financials" },
];
const existingTickers = new Set(universe.map((c) => c.ticker));
for (const m of MISSING_MANUAL) {
  if (!existingTickers.has(m.ticker)) {
    universe.push(m);
  }
}

console.log(`  Found ${universe.length} companies in S&P 500 universe`);

// Fix known bad sector parses
const SECTOR_FIXES = {
  "GOOGL": "Communication Services",
  "GOOG": "Communication Services",
  "VST": "Utilities",
};
for (const c of universe) {
  if (SECTOR_FIXES[c.ticker]) c.gics_sector = SECTOR_FIXES[c.ticker];
}

// Normalize GICS sector names
const SECTOR_MAP = {
  "Information Technology": "Information Technology",
  "Health Care": "Health Care",
  "Financials": "Financials",
  "Consumer Discretionary": "Consumer Discretionary",
  "Communication Services": "Communication Services",
  "Industrials": "Industrials",
  "Consumer Staples": "Consumer Staples",
  "Energy": "Energy",
  "Utilities": "Utilities",
  "Real Estate": "Real Estate",
  "Materials": "Materials",
};

for (const c of universe) {
  // Normalize sector
  const found = Object.keys(SECTOR_MAP).find(
    (s) => c.gics_sector.toLowerCase().includes(s.toLowerCase())
  );
  if (found) c.gics_sector = SECTOR_MAP[found];
}

// ── 2. Parse vulnerability scores ──

console.log("Parsing vulnerability scores...");
const vulnPath = latestFile(OUT_DIR, /company_vulnerability_v2_conservative__/);
console.log(`  Using: ${path.basename(vulnPath)}`);
const vulnRows = parseSimpleCsv(readFileSync(vulnPath, "utf8"));

const vulnMap = new Map();
for (const row of vulnRows) {
  const score = parseFloat(row.ai_vulnerability_score_v2);
  if (!isNaN(score)) {
    vulnMap.set(row.ticker, { score, company_name: row.company_name });
  }
}
console.log(`  ${vulnMap.size} companies with vulnerability scores`);

// ── 3. Parse headcount data ──

console.log("Parsing headcount data...");
const hcPath = latestFile(INT_DIR, /headcount_verification_queue_reviewed__/);
console.log(`  Using: ${path.basename(hcPath)}`);
const hcRows = parseSimpleCsv(readFileSync(hcPath, "utf8"));

const hcMap = new Map();
for (const row of hcRows) {
  if (row.review_status === "approved" && row.verified_headcount) {
    hcMap.set(row.ticker, parseInt(row.verified_headcount, 10));
  }
}
console.log(`  ${hcMap.size} companies with approved headcount`);

// ── 4. Parse Karpathy AI exposure scores ──

console.log("Parsing Karpathy scores...");
const karpathyFiles = readdirSync(RAW_DIR).filter((f) => f.includes("karpathy_scores")).sort();
const karpathyPath = path.join(RAW_DIR, karpathyFiles[karpathyFiles.length - 1]);
const karpathyData = JSON.parse(readFileSync(karpathyPath, "utf8"));
const karpathyMap = new Map();
for (const entry of karpathyData) {
  karpathyMap.set(entry.slug, { title: entry.title, exposure: entry.exposure });
}
console.log(`  ${karpathyMap.size} role slugs with exposure scores`);

// ── 5. Parse researched role mappings ──

console.log("Parsing researched role mappings...");
const injectPath = path.join(ROOT, "scripts", "inject-researched-role-mappings.mjs");
const injectText = readFileSync(injectPath, "utf8");

// Extract the RESEARCHED object content
const researchedMatch = injectText.match(/const RESEARCHED\s*=\s*\{([\s\S]*?)\n\};\s*\n/);
const roleMap = new Map();

if (researchedMatch) {
  const block = researchedMatch[1];
  // Parse each ticker block
  const tickerPattern = /(\w+(?:\.\w+)?)\s*:\s*\[([\s\S]*?)\],?\s*(?=\n\s+\w|$)/g;
  let match;
  while ((match = tickerPattern.exec(block)) !== null) {
    const ticker = match[1];
    const rolesBlock = match[2];
    const roles = [];

    // Parse individual role objects
    const rolePattern = /\{\s*label:\s*"([^"]+)"\s*,\s*share:\s*([\d.]+)\s*,\s*conf:\s*"([^"]+)"\s*,\s*note:\s*"([^"]*(?:\\.[^"]*)*)"\s*\}/g;
    let roleMatch;
    while ((roleMatch = rolePattern.exec(rolesBlock)) !== null) {
      const slug = roleMatch[1];
      const kEntry = karpathyMap.get(slug);
      roles.push({
        label: slug,
        title: kEntry ? kEntry.title : slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
        share: parseFloat(roleMatch[2]),
        conf: roleMatch[3],
        note: roleMatch[4].replace(/\\'/g, "'"),
        ai_exposure: kEntry ? kEntry.exposure : null,
      });
    }

    if (roles.length > 0) {
      roleMap.set(ticker, roles);
    }
  }
}
console.log(`  ${roleMap.size} companies with researched role breakdowns`);

// ── 6. Approximate market cap tiers for S&P 500 weighting ──

// Hardcoded approximate market caps (in $B) for top companies as of early 2026
const MCAP_APPROX = {
  AAPL: 3800, MSFT: 3200, NVDA: 3100, AMZN: 2200, GOOGL: 2100, META: 1700,
  "BRK.B": 1100, AVGO: 1050, TSLA: 1000, LLY: 900, WMT: 750, JPM: 700,
  V: 650, XOM: 500, UNH: 480, MA: 470, COST: 430, ORCL: 420, HD: 400,
  PG: 400, JNJ: 380, NFLX: 370, ABBV: 360, "BRK.A": 0, // skip dup
  CRM: 330, BAC: 320, AMD: 300, CVX: 290, KO: 280, MRK: 275,
  PEP: 270, TMO: 260, LIN: 250, ADBE: 240, CSCO: 240, ACN: 230,
  MCD: 220, ABT: 210, PM: 200, IBM: 200, NOW: 200, GE: 200,
  ISRG: 195, CAT: 190, VZ: 190, INTU: 185, AMGN: 180, QCOM: 175,
  TXN: 175, GS: 170, AXP: 165, MS: 165, AMAT: 160, BKNG: 160,
  PFE: 155, HON: 155, LOW: 155, RTX: 155, BLK: 155, T: 150,
  C: 150, UBER: 145, NEE: 145, SPGI: 140, DE: 140, SCHW: 135,
  BMY: 135, PLD: 130, UNP: 130, BA: 125, ADP: 125, SYK: 125,
  ADI: 120, LRCX: 120, GILD: 120, MDLZ: 115, REGN: 115, VRTX: 115,
  MMC: 115, CB: 115, PANW: 110, CME: 110, ETN: 110, BSX: 110,
  SLB: 105, SO: 105, DUK: 105, APH: 100, CI: 100, BDX: 100,
  MO: 100, PYPL: 100, ICE: 100, COP: 100, FCX: 100, WM: 95,
  PH: 95, CMG: 95, MCO: 95, CL: 95, SNPS: 95, KLAC: 95,
  CDNS: 95, ZTS: 90, MSI: 90, EOG: 90, ITW: 90, EMR: 90,
  FDX: 85, TDG: 85, ORLY: 85, USB: 85, NOC: 85, PSA: 85,
  HCA: 85, GD: 85, MCHP: 80, ROP: 80, AIG: 80, NSC: 80,
  AFL: 80, TFC: 75, HUM: 75, MET: 75, SPG: 75, ALL: 75,
  AEP: 75, WMB: 75, CEG: 75, KMB: 70, SRE: 70, DLR: 70,
  OXY: 70, F: 70, GM: 70, PSX: 70, VLO: 70, DVN: 65,
  TGT: 65, KR: 65, CTSH: 65, STZ: 65, EL: 60, NEM: 60,
  HPQ: 60, DOW: 55, LHX: 55, PRU: 55, DD: 55, NUE: 50,
  AZO: 50, ROST: 50, FAST: 50, DLTR: 50, PAYX: 50,
  SBUX: 100, DIS: 200, CVS: 80, TJX: 70, TSCO: 30,
  K: 25, GIS: 40, HSY: 30, WFC: 200, PNC: 75,
  LMT: 120, AMCR: 15, MMM: 70, IBM: 200,
  APP: 100, ABNB: 80, ADSK: 60, AKAM: 15,
};

// Assign market cap weights
function getWeight(ticker) {
  if (MCAP_APPROX[ticker]) return MCAP_APPROX[ticker];
  // Default tiers based on typical S&P 500 member size
  return 30; // ~$30B as reasonable default for unlisted S&P 500 members
}

// ── 7. Assemble final dataset ──

console.log("Assembling treemap data...");

const companies = [];
for (const entry of universe) {
  const { ticker, company_name, gics_sector } = entry;
  const vuln = vulnMap.get(ticker);
  const headcount = hcMap.get(ticker) || null;
  const roles = roleMap.get(ticker) || null;
  const weight = getWeight(ticker);

  companies.push({
    ticker,
    name: vuln ? vuln.company_name : company_name,
    sector: gics_sector,
    weight,
    headcount,
    vulnerability_score: vuln ? vuln.score : null,
    has_score: vuln ? true : false,
    has_roles: roles ? true : false,
    roles: roles ? roles.map((r) => ({
      title: r.title,
      slug: r.label,
      share_pct: r.share,
      ai_exposure: r.ai_exposure,
      note: r.note,
      workers: headcount ? Math.round(headcount * r.share / 100) : null,
    })) : null,
  });
}

// Summary stats
const withScores = companies.filter((c) => c.has_score).length;
const withRoles = companies.filter((c) => c.has_roles).length;
const withHeadcount = companies.filter((c) => c.headcount).length;

const output = {
  generated_at: new Date().toISOString(),
  stats: {
    total_companies: companies.length,
    with_vulnerability_scores: withScores,
    with_role_breakdowns: withRoles,
    with_headcount: withHeadcount,
  },
  companies,
};

const outPath = path.join(OUT_DIR, "sp500_treemap_data.json");
writeFileSync(outPath, JSON.stringify(output, null, 2));
console.log(`\nWrote ${outPath}`);
console.log(`  Total: ${companies.length} companies`);
console.log(`  With scores: ${withScores}`);
console.log(`  With roles: ${withRoles}`);
console.log(`  With headcount: ${withHeadcount}`);

// ── 8. Inline data into HTML ──

const htmlTemplatePath = path.join(ROOT, "scripts", "treemap-template.html");
let html = readFileSync(htmlTemplatePath, "utf8");
const inlineScript = `window.__TREEMAP_DATA__ = ${JSON.stringify(output)};`;
// Replace the marker with actual data
html = html.replace(/\/\/ DATA_INJECT_MARKER/, inlineScript);
const htmlOutPath = path.join(OUT_DIR, "sp500_treemap_vulnerability.html");
writeFileSync(htmlOutPath, html, "utf8");
console.log(`\nWrote ${htmlOutPath} (${(html.length / 1024).toFixed(0)} KB)`);
