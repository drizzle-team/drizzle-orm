CREATE OR REPLACE PROCEDURE ctx_styles(p_account bigint, p_fee numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_bill__count bigint;
BEGIN
  RAISE NOTICE '%', p_fee;
  UPDATE accounts SET balance = balance - p_fee WHERE id = p_account;
  GET DIAGNOSTICS v_bill__count = ROW_COUNT;
  IF v_bill__count = 0 THEN
    RAISE NOTICE 'missing account';
  END IF;
END;
$$;
