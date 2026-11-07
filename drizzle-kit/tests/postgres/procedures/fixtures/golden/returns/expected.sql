CREATE OR REPLACE PROCEDURE apply_fee(p_account bigint, p_fee numeric, INOUT "status" text DEFAULT NULL, INOUT "charged" numeric DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_hit__count bigint;
  v_row record;
BEGIN
  UPDATE "accounts" SET "balance" = "balance" - p_fee WHERE "id" = p_account AND "balance" >= p_fee;
  GET DIAGNOSTICS v_hit__count = ROW_COUNT;
  IF v_hit__count = 0 THEN
    "status" := 'skipped';
    "charged" := 0;
    RETURN;
  END IF;
  SELECT "balance" FROM "accounts" WHERE "id" = p_account INTO STRICT v_row;
  "status" := 'charged';
  "charged" := v_row.balance;
  RETURN;
END;
$$;
