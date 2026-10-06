-- One row per successful Excel import. The file itself is never stored.
CREATE TABLE uploads (
  id            BIGSERIAL PRIMARY KEY,
  year          INTEGER     NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month         TEXT        NOT NULL CHECK (month IN (
                  'January','February','March','April','May','June',
                  'July','August','September','October','November','December')),
  file_name     TEXT        NOT NULL,
  record_count  INTEGER     NOT NULL CHECK (record_count >= 0),
  uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX uploads_year_month_idx ON uploads (year, month, id DESC);

-- One row per source Excel row, tagged with the year/month chosen at upload time.
CREATE TABLE party_month_data (
  id                          BIGSERIAL PRIMARY KEY,
  upload_id                   BIGINT  NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,

  reporting_year              INTEGER NOT NULL,
  reporting_month             TEXT    NOT NULL,

  sr_no                       TEXT,
  party_code                  TEXT,
  party_name                  TEXT,
  sales_representative_name   TEXT,
  group_head                  TEXT,
  regional_head               TEXT,
  nos                         NUMERIC,
  category_frequency_purchase TEXT,
  van_usage_apr_26            TEXT,
  van_usage_may_26            TEXT,
  van_usage_jun_26            TEXT,
  van_usage_jul_26            TEXT,
  van_nos                     TEXT,
  pay_terms                   TEXT,
  months_van_used             TEXT,
  van_status                  TEXT,
  conversion_wave             TEXT,
  van_no                      TEXT,
  upi                         TEXT,

  -- Every VAN_Usage_<MON>_<YY> column in the source row, so future months need no schema change.
  van_usage                   JSONB   NOT NULL DEFAULT '{}'::jsonb,
  -- Any other source columns, preserved as-is.
  extra_fields                JSONB   NOT NULL DEFAULT '{}'::jsonb,

  -- Value of the VAN_Usage column that matches this row's reporting month (e.g. April 2026 -> VAN_Usage_APR_26).
  monthly_van_usage           TEXT,

  party_key TEXT GENERATED ALWAYS AS (
    COALESCE(NULLIF(btrim(party_code), ''), 'NAME:' || NULLIF(btrim(party_name), ''))
  ) STORED,

  -- Monthly VAN classification. "van nos" is deliberately not used.
  van_classification TEXT GENERATED ALWAYS AS (
    CASE
      WHEN lower(btrim(monthly_van_usage)) = 'no' THEN 'NOT_USING'
      WHEN btrim(monthly_van_usage) ~ '^[A-Za-z0-9]{6}$' THEN
        CASE
          WHEN lower(btrim(pay_terms)) = 'credit' THEN 'USING_CREDIT'
          WHEN lower(btrim(pay_terms)) IN ('100% adv', '100% advance') THEN 'USING_ADVANCE'
          ELSE 'USING_OTHER'
        END
      ELSE 'INVALID_MISSING'
    END
  ) STORED,

  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),

  CHECK (party_key IS NOT NULL)
);

CREATE INDEX pmd_upload_idx           ON party_month_data (upload_id);
CREATE INDEX pmd_year_month_idx       ON party_month_data (reporting_year, reporting_month, party_key);
CREATE INDEX pmd_year_month_pay_idx   ON party_month_data (reporting_year, reporting_month, pay_terms);
CREATE INDEX pmd_year_month_cat_idx   ON party_month_data (reporting_year, reporting_month, category_frequency_purchase);
CREATE INDEX pmd_party_code_idx       ON party_month_data (party_code);
CREATE INDEX pmd_regional_head_idx    ON party_month_data (regional_head);
CREATE INDEX pmd_group_head_idx       ON party_month_data (group_head);
CREATE INDEX pmd_sales_rep_idx        ON party_month_data (sales_representative_name);
