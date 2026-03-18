#!/usr/bin/env node

import { copyFileSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

function argValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx < 0) return "";
  return process.argv[idx + 1] || "";
}

function usage() {
  console.log(
    "Usage: node skills/public/sp500-defensibility-pipeline/scripts/restore_checkpoint.mjs --checkpoint <checkpoint.json>",
  );
}

function main() {
  const checkpointArg = argValue("--checkpoint");
  if (!checkpointArg) {
    usage();
    process.exit(1);
  }

  const checkpointPath = path.isAbsolute(checkpointArg)
    ? checkpointArg
    : path.join(ROOT, checkpointArg);
  if (!existsSync(checkpointPath)) {
    throw new Error(`Checkpoint not found: ${checkpointPath}`);
  }

  const checkpoint = JSON.parse(readFileSync(checkpointPath, "utf8"));
  const runId = checkpoint.run_id || "pilot25_2026Q1_v1";
  const stamp = new Date().toISOString().replaceAll(":", "-");
  const wanted = new Set([
    "scores_conservative",
    "scores_relaxed",
    "initial_results_summary",
    "confidence_pipeline",
    "source_search_reference",
    "professionals_summary",
    "professionals_allocations",
    "headcount_queue_reviewed",
    "mapping_adjudication_reviewed",
    "external_role_evidence_queue",
    "qa_methodology_log",
    "qa_source_ladder_log",
  ]);

  let restored = 0;
  for (const artifact of checkpoint.artifacts || []) {
    if (!wanted.has(String(artifact.id || ""))) continue;
    const src = path.join(ROOT, String(artifact.path || "").replaceAll("/", path.sep));
    if (!existsSync(src)) {
      console.log(`Skip missing source: ${src}`);
      continue;
    }

    const base = path.basename(src);
    const rest = base.startsWith(`${runId}__`)
      ? base.slice(`${runId}__`.length)
      : base;
    const idx = rest.lastIndexOf("__");
    if (idx < 0) continue;
    const label = rest.slice(0, idx);
    const ext = path.extname(base) || ".csv";
    const dst = path.join(path.dirname(src), `${runId}__${label}__${stamp}${ext}`);
    copyFileSync(src, dst);
    restored += 1;
    console.log(`Restored: ${path.relative(ROOT, dst).replaceAll("\\", "/")}`);
  }

  if (restored === 0) {
    throw new Error("No artifacts restored. Check checkpoint contents.");
  }

  console.log(`Restored artifacts: ${restored}`);
  console.log("Regenerate UI artifacts next:");
  console.log("  node scripts/generate-results-dashboard.mjs");
  console.log("  node scripts/generate-process-kanban.mjs");
}

main();

