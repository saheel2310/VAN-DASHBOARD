-- Moves from one row per party per MONTH (party_month_data) to one row per party per YEAR
-- (party_year_data) with a VAN usage column for each month.
--
-- Data handling:
--   * Every party-month value in party_month_data is copied into the matching van_usage_<mon> column.
--   * party_month_data is NOT dropped. It is renamed to party_month_data_legacy as a backup
--     (and dropped only if it is empty, i.e. on a fresh install).
--   * Rows without a PARTY CODE cannot be keyed by (reporting_year, party_code) and are not copied
--     (they remain in the legacy table; a NOTICE reports how many).
--   * DESTRUCTIVE: uploads keeps only the latest import per (year, month); older history rows are deleted.

-- Monthly VAN classification. "van nos" is deliberately not used.
CREATE FUNCTION van_classification(usage TEXT, pay_terms TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(btrim(usage)) = 'no' THEN 'NOT_USING'
    WHEN btrim(usage) ~ '^[A-Za-z0-9]{6}$' THEN
      CASE
        WHEN lower(btrim(pay_terms)) = 'credit' THEN 'USING_CREDIT'
        WHEN lower(btrim(pay_terms)) IN ('100% adv', '100% advance') THEN 'USING_ADVANCE'
        ELSE 'USING_OTHER'
      END
    ELSE 'INVALID_MISSING'
  END
$$;

-- A party missing from a month's upload counts as 'No' for that month, so months default to 'No'.
-- An empty string means the party was in the file but its VAN usage cell was blank (Invalid / Missing).
CREATE TABLE party_year_data (
  id                          BIGSERIAL PRIMARY KEY,
  reporting_year              INTEGER NOT NULL CHECK (reporting_year BETWEEN 2000 AND 2100),
  party_code                  TEXT    NOT NULL CHECK (btrim(party_code) <> ''),
  party_name                  TEXT,
  sales_representative_name   TEXT,
  group_head                  TEXT,
  regional_head               TEXT,
  nos                         NUMERIC,
  category_frequency_purchase TEXT,
  van_usage_jan               TEXT NOT NULL DEFAULT 'No',
  van_usage_feb               TEXT NOT NULL DEFAULT 'No',
  van_usage_mar               TEXT NOT NULL DEFAULT 'No',
  van_usage_apr               TEXT NOT NULL DEFAULT 'No',
  van_usage_may               TEXT NOT NULL DEFAULT 'No',
  van_usage_jun               TEXT NOT NULL DEFAULT 'No',
  van_usage_jul               TEXT NOT NULL DEFAULT 'No',
  van_usage_aug               TEXT NOT NULL DEFAULT 'No',
  van_usage_sep               TEXT NOT NULL DEFAULT 'No',
  van_usage_oct               TEXT NOT NULL DEFAULT 'No',
  van_usage_nov               TEXT NOT NULL DEFAULT 'No',
  van_usage_dec               TEXT NOT NULL DEFAULT 'No',
  pay_terms                   TEXT,
  van_nos                     TEXT,
  months_van_used             TEXT,
  van_status                  TEXT,
  conversion_wave             TEXT,
  van_no                      TEXT,
  upi                         TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT party_year_data_year_party_key UNIQUE (reporting_year, party_code)
);

CREATE INDEX pyd_year_category_idx ON party_year_data (reporting_year, category_frequency_purchase);
CREATE INDEX pyd_year_pay_terms_idx ON party_year_data (reporting_year, pay_terms);
CREATE INDEX pyd_year_regional_idx  ON party_year_data (reporting_year, regional_head);
CREATE INDEX pyd_year_group_idx     ON party_year_data (reporting_year, group_head);
CREATE INDEX pyd_year_sales_rep_idx ON party_year_data (reporting_year, sales_representative_name);

-- ── Copy existing monthly rows ──────────────────────────────────────────────

WITH coded AS (
  SELECT *, btrim(party_code) AS code,
         array_position(ARRAY['January','February','March','April','May','June','July',
                              'August','September','October','November','December'], reporting_month) AS month_no
  FROM party_month_data
  WHERE NULLIF(btrim(party_code), '') IS NOT NULL
),
-- One value per party-month: a valid VAN code beats "No", which beats invalid/missing (same rule as before).
per_month AS (
  SELECT DISTINCT ON (reporting_year, code, reporting_month)
         reporting_year, code, reporting_month, COALESCE(btrim(monthly_van_usage), '') AS usage
  FROM coded
  ORDER BY reporting_year, code, reporting_month,
           CASE WHEN van_classification LIKE 'USING_%' THEN 3
                WHEN van_classification = 'NOT_USING' THEN 2 ELSE 1 END DESC,
           id
),
pivot AS (
  SELECT reporting_year, code,
         max(usage) FILTER (WHERE reporting_month = 'January')   AS jan,
         max(usage) FILTER (WHERE reporting_month = 'February')  AS feb,
         max(usage) FILTER (WHERE reporting_month = 'March')     AS mar,
         max(usage) FILTER (WHERE reporting_month = 'April')     AS apr,
         max(usage) FILTER (WHERE reporting_month = 'May')       AS may,
         max(usage) FILTER (WHERE reporting_month = 'June')      AS jun,
         max(usage) FILTER (WHERE reporting_month = 'July')      AS jul,
         max(usage) FILTER (WHERE reporting_month = 'August')    AS aug,
         max(usage) FILTER (WHERE reporting_month = 'September') AS sep,
         max(usage) FILTER (WHERE reporting_month = 'October')   AS oct,
         max(usage) FILTER (WHERE reporting_month = 'November')  AS nov,
         max(usage) FILTER (WHERE reporting_month = 'December')  AS dec
  FROM per_month
  GROUP BY reporting_year, code
),
-- Master fields come from the party's most recent month.
latest AS (
  SELECT DISTINCT ON (reporting_year, code) *
  FROM coded
  ORDER BY reporting_year, code, month_no DESC, id DESC
)
INSERT INTO party_year_data (
  reporting_year, party_code, party_name, sales_representative_name, group_head, regional_head,
  nos, category_frequency_purchase,
  van_usage_jan, van_usage_feb, van_usage_mar, van_usage_apr, van_usage_may, van_usage_jun,
  van_usage_jul, van_usage_aug, van_usage_sep, van_usage_oct, van_usage_nov, van_usage_dec,
  pay_terms, van_nos, months_van_used, van_status, conversion_wave, van_no, upi
)
SELECT l.reporting_year, l.code, l.party_name, l.sales_representative_name, l.group_head, l.regional_head,
       l.nos, l.category_frequency_purchase,
       COALESCE(p.jan, 'No'), COALESCE(p.feb, 'No'), COALESCE(p.mar, 'No'), COALESCE(p.apr, 'No'),
       COALESCE(p.may, 'No'), COALESCE(p.jun, 'No'), COALESCE(p.jul, 'No'), COALESCE(p.aug, 'No'),
       COALESCE(p.sep, 'No'), COALESCE(p.oct, 'No'), COALESCE(p.nov, 'No'), COALESCE(p.dec, 'No'),
       l.pay_terms, l.van_nos, l.months_van_used, l.van_status, l.conversion_wave, l.van_no, l.upi
FROM latest l
JOIN pivot p ON p.reporting_year = l.reporting_year AND p.code = l.code;

DO $$
DECLARE skipped BIGINT;
BEGIN
  SELECT count(*) INTO skipped FROM party_month_data WHERE NULLIF(btrim(party_code), '') IS NULL;
  IF skipped > 0 THEN
    RAISE NOTICE '% row(s) without a PARTY CODE were not copied; they remain in party_month_data_legacy.', skipped;
  END IF;
END $$;

-- ── Retire the monthly table (kept as a backup unless empty) ────────────────

ALTER TABLE party_month_data DROP CONSTRAINT party_month_data_upload_id_fkey;
ALTER TABLE party_month_data RENAME TO party_month_data_legacy;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM party_month_data_legacy) THEN
    DROP TABLE party_month_data_legacy;
  END IF;
END $$;

-- ── uploads: one row per (year, month), latest import wins ──────────────────

ALTER TABLE uploads RENAME COLUMN year TO reporting_year;

DELETE FROM uploads u
USING uploads newer
WHERE newer.reporting_year = u.reporting_year
  AND newer.month = u.month
  AND newer.id > u.id;

DROP INDEX uploads_year_month_idx;
ALTER TABLE uploads ADD CONSTRAINT uploads_year_month_key UNIQUE (reporting_year, month);
