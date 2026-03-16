-- Phase 1 canonical schema
-- Compatible with DuckDB and easily adapted for Postgres.

CREATE TABLE IF NOT EXISTS company_master (
  run_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  company_name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  gics_sector TEXT,
  gics_industry_group TEXT,
  primary_filing_doc_id TEXT,
  PRIMARY KEY (run_id, ticker)
);

CREATE TABLE IF NOT EXISTS source_documents (
  doc_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  source_type TEXT NOT NULL, -- filing, index_snapshot, repo_snapshot, other
  source_name TEXT NOT NULL,
  source_url TEXT NOT NULL,
  source_version TEXT, -- commit hash, filing accession, snapshot id
  accessed_at TIMESTAMP NOT NULL,
  published_at TIMESTAMP,
  local_path TEXT,
  checksum_sha256 TEXT
);

CREATE TABLE IF NOT EXISTS vulnerability_scores (
  run_id TEXT NOT NULL,
  repo_label TEXT NOT NULL,
  repo_score DOUBLE NOT NULL,
  repo_source_doc_id TEXT NOT NULL,
  repo_commit_hash TEXT NOT NULL,
  PRIMARY KEY (run_id, repo_label)
);

CREATE TABLE IF NOT EXISTS workforce_evidence (
  evidence_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  doc_id TEXT NOT NULL,
  filing_date DATE,
  section_ref TEXT,
  page_ref TEXT,
  quoted_text TEXT NOT NULL,
  extracted_metric_name TEXT, -- e.g., total_employees, role_share_pct
  extracted_metric_value DOUBLE,
  extracted_metric_unit TEXT, -- count, pct
  extraction_method TEXT NOT NULL, -- manual, script, hybrid
  citation_id TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS role_mapping (
  mapping_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  repo_label TEXT,
  mapped_share_pct DOUBLE,
  mapping_confidence TEXT NOT NULL, -- high, medium, low, unknown
  mapping_rationale TEXT NOT NULL,
  assumption_id TEXT
);

CREATE TABLE IF NOT EXISTS company_results (
  run_id TEXT NOT NULL,
  as_of_date DATE NOT NULL,
  company_name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  ai_vulnerability_score DOUBLE,
  known_workforce_share_pct DOUBLE NOT NULL,
  unknown_workforce_share_pct DOUBLE NOT NULL,
  confidence_level TEXT NOT NULL,
  data_quality_grade TEXT NOT NULL,
  primary_filing_date DATE,
  notes TEXT,
  PRIMARY KEY (run_id, ticker)
);

CREATE TABLE IF NOT EXISTS assumptions_register (
  assumption_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  assumption_text TEXT NOT NULL,
  rationale TEXT NOT NULL,
  impact_area TEXT NOT NULL,
  status TEXT NOT NULL, -- proposed, approved, rejected
  owner TEXT,
  created_at TIMESTAMP NOT NULL,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qa_checks (
  check_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  check_name TEXT NOT NULL,
  check_status TEXT NOT NULL, -- pass, fail, warn
  check_details TEXT,
  checked_at TIMESTAMP NOT NULL
);
