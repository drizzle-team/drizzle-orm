CREATE OR REPLACE PROCEDURE bigint_modes(p_seq bigint, p_account bigint)
LANGUAGE plpgsql
AS $$
DECLARE
  v_touched__count bigint;
BEGIN
  IF p_seq = 0 THEN
    RAISE NOTICE 'fresh sequence';
  END IF;
  UPDATE accounts SET seq = p_seq WHERE id = p_account;
  GET DIAGNOSTICS v_touched__count = ROW_COUNT;
  IF v_touched__count = 0 THEN
    RAISE NOTICE 'no such account';
  END IF;
END;
$$;
