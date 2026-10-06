-- uploads: one row per uploaded Excel FILE (listing the months it imported),
-- instead of one row per month. Rows written by the same import (same year, file and timestamp)
-- are merged into one. No party data is touched.

ALTER TABLE uploads ADD COLUMN months TEXT[];

UPDATE uploads u
SET months = g.months
FROM (
  SELECT min(id) AS keep_id,
         array_agg(month ORDER BY array_position(ARRAY['January','February','March','April','May','June','July',
                                                       'August','September','October','November','December'], month)) AS months
  FROM uploads
  GROUP BY reporting_year, file_name, uploaded_at
) g
WHERE u.id = g.keep_id;

DELETE FROM uploads WHERE months IS NULL;

ALTER TABLE uploads DROP CONSTRAINT uploads_year_month_key;
ALTER TABLE uploads DROP COLUMN month;
ALTER TABLE uploads ALTER COLUMN months SET NOT NULL;
ALTER TABLE uploads ADD CONSTRAINT uploads_months_valid CHECK (
  cardinality(months) > 0 AND
  months <@ ARRAY['January','February','March','April','May','June','July',
                  'August','September','October','November','December']::TEXT[]
);
CREATE INDEX uploads_year_idx ON uploads (reporting_year, id DESC);
