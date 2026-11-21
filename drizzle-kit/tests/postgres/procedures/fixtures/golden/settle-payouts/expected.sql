CREATE OR REPLACE PROCEDURE settle_payouts(p_batch_size integer, p_max_payouts integer, INOUT "processed" integer DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_processed integer;
  v_in_batch integer;
  v_next record;
  v_next__count bigint;
  v_payout_id bigint;
  v_merchant_id bigint;
  v_amount numeric;
  v_parked__count bigint;
BEGIN
  v_processed := 0;
  v_in_batch := 0;
  WHILE v_processed < p_max_payouts LOOP
    SELECT id, merchant_id, amount FROM payouts WHERE status = 'pending' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED INTO v_next;
    GET DIAGNOSTICS v_next__count = ROW_COUNT;
    IF v_next__count > 0 THEN
      v_payout_id := v_next.id;
      v_merchant_id := v_next.merchant_id;
      v_amount := v_next.amount;
      UPDATE payouts SET status = 'held' WHERE id = v_payout_id AND EXISTS (SELECT 1 FROM merchant_holds h WHERE h.merchant_id = v_merchant_id);
      GET DIAGNOSTICS v_parked__count = ROW_COUNT;
      IF v_parked__count > 0 THEN
        CONTINUE;
      END IF;
      UPDATE merchants SET balance = balance - v_amount WHERE id = v_merchant_id;
      UPDATE payouts SET status = 'paid' WHERE id = v_payout_id;
      v_processed := v_processed + 1;
      v_in_batch := v_in_batch + 1;
      IF v_in_batch >= p_batch_size THEN
        COMMIT;
        v_in_batch := 0;
      END IF;
    ELSE
      EXIT;
    END IF;
  END LOOP;
  "processed" := v_processed;
  RETURN;
END;
$$;
