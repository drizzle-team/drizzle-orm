CREATE OR REPLACE PROCEDURE transfer(p_from bigint, p_to bigint, p_amount numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit__count bigint;
BEGIN
  PERFORM 1 FROM accounts WHERE id IN (p_from, p_to) ORDER BY id FOR UPDATE;
  UPDATE accounts SET balance = balance - p_amount WHERE id = p_from AND balance >= p_amount;
  GET DIAGNOSTICS v_debit__count = ROW_COUNT;
  IF v_debit__count = 0 THEN
    RAISE EXCEPTION 'insufficient funds' USING ERRCODE = 'P0001';
  END IF;
  UPDATE accounts SET balance = balance + p_amount WHERE id = p_to;
  INSERT INTO ledger (from_account, to_account, amount) VALUES (p_from, p_to, p_amount);
END;
$$;
