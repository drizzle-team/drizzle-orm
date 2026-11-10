CREATE OR REPLACE PROCEDURE withdraw(p_account bigint, p_amount numeric, p_currency text DEFAULT 'EUR', INOUT "new_balance" numeric DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_wallet record;
  v_wallet__count bigint;
  v_balance numeric;
  v_used numeric;
BEGIN
  SELECT balance, daily_limit FROM wallets WHERE account_id = p_account AND currency = p_currency FOR UPDATE INTO v_wallet;
  GET DIAGNOSTICS v_wallet__count = ROW_COUNT;
  IF v_wallet__count > 0 THEN
    v_balance := v_wallet.balance;
    IF v_balance < p_amount THEN
      RAISE EXCEPTION 'insufficient funds on account %', p_account USING ERRCODE = 'P0001', DETAIL = format('balance %s %s, requested %s %s', v_balance, p_currency, p_amount, p_currency), HINT = 'top up the wallet or lower the amount (fees are 2% of the amount)';
    END IF;
    v_used := p_amount * 100 / v_wallet.daily_limit;
    IF v_used > 100 THEN
      RAISE WARNING '%', format('withdrawal uses %s%% of the daily limit on account %s', v_used, p_account);
    END IF;
    UPDATE wallets SET balance = balance - p_amount WHERE account_id = p_account AND currency = p_currency;
    "new_balance" := v_balance - p_amount;
    RETURN;
  ELSE
    RAISE EXCEPTION 'account % has no % wallet', p_account, p_currency USING ERRCODE = 'P0002';
  END IF;
END;
$$;
