CREATE OR REPLACE PROCEDURE close_account(p_account bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_closed__count bigint;
BEGIN
  UPDATE accounts SET closed = true WHERE id = p_account;
  GET DIAGNOSTICS v_closed__count = ROW_COUNT;
  IF v_closed__count = 0 THEN
    RAISE EXCEPTION 'no such account' USING ERRCODE = 'P0002';
  END IF;
END;
$$;
