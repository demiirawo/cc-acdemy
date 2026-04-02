UPDATE staff_requests 
SET coverage_metadata = jsonb_set(
  jsonb_set(coverage_metadata, '{shifts,0,date}', '"2026-04-11"'),
  '{covered_dates}', '["2026-04-11"]'
)
WHERE id = 'fe233ca8-454d-43b2-821f-6b4f34477fbe'
AND coverage_metadata IS NOT NULL;