-- A valid VAN code is now 1-7 letters/digits (was exactly 6). "No" = Not Using; "Yes" is never Using VAN.
CREATE OR REPLACE FUNCTION van_classification(usage TEXT, pay_terms TEXT) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN lower(btrim(usage)) = 'no' THEN 'NOT_USING'
    WHEN lower(btrim(usage)) = 'yes' THEN 'INVALID_MISSING'
    WHEN btrim(usage) ~ '^[A-Za-z0-9]{1,7}$' THEN
      CASE
        WHEN lower(btrim(pay_terms)) = 'credit' THEN 'USING_CREDIT'
        WHEN lower(btrim(pay_terms)) IN ('100% adv', '100% advance') THEN 'USING_ADVANCE'
        ELSE 'USING_OTHER'
      END
    ELSE 'INVALID_MISSING'
  END
$$;
