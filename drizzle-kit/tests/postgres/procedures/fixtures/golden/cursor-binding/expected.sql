CREATE OR REPLACE PROCEDURE review_holds(p_account bigint, p_threshold numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_hold record;
BEGIN
  UPDATE accounts SET reviewed = true WHERE id = p_account;
  FOR v_hold IN SELECT amount FROM holds WHERE account_id = p_account LOOP
    IF v_hold.amount > p_threshold THEN
      RAISE NOTICE '%', v_hold.amount;
    END IF;
  END LOOP;
END;
$$;
