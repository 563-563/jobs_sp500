-- Reference query to produce ranked phase-1 output
SELECT
  run_id,
  as_of_date,
  company_name,
  ticker,
  cik,
  ai_vulnerability_score,
  known_workforce_share_pct,
  unknown_workforce_share_pct,
  confidence_level,
  data_quality_grade,
  primary_filing_date,
  notes
FROM company_results
WHERE run_id = ?
ORDER BY ai_vulnerability_score DESC NULLS LAST, unknown_workforce_share_pct ASC;
