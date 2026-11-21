import { bigint_, int, numeric, procedure, text } from 'drizzle-orm/pg-core'

procedure(
  'audit_account',
  { account: 'bigint', threshold: 'numeric' },
  (ctx) => {
    const { sql, notice, isNull, coalesce } = ctx
    const { account, threshold } = ctx.args
    const owner = sql`SELECT id, name FROM owners WHERE account_id = ${account}`.one<{ id: bigint_; name: text }>()
    notice(owner.name)

    const hold = sql`SELECT amount FROM holds WHERE account_id = ${account}`.maybeOne<{ amount: numeric | null }>()
    if (hold.found) {
      if (isNull(hold.row.amount)) {
        notice('hold with no amount')
      }
      const held: numeric = coalesce(hold.row.amount, 0)
      if (held > threshold) {
        notice('held over threshold')
      }
    }

    let flagged: int = 0
    for (const entry of sql`SELECT amount FROM ledger WHERE account_id = ${account}`.many<{ amount: numeric }>()) {
      if (entry.amount > threshold) {
        flagged = flagged + 1
      }
    }
    notice(flagged)
  },
)

/*sql
CREATE OR REPLACE PROCEDURE audit_account(p_account bigint, p_threshold numeric)
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner record;
  v_hold record;
  v_hold__count bigint;
  v_held numeric;
  v_flagged integer;
  v_entry record;
BEGIN
  SELECT id, name FROM owners WHERE account_id = p_account INTO STRICT v_owner;
  RAISE NOTICE '%', v_owner.name;
  SELECT amount FROM holds WHERE account_id = p_account INTO v_hold;
  GET DIAGNOSTICS v_hold__count = ROW_COUNT;
  IF v_hold__count > 0 THEN
    IF v_hold.amount IS NULL THEN
      RAISE NOTICE 'hold with no amount';
    END IF;
    v_held := coalesce(v_hold.amount, 0);
    IF v_held > p_threshold THEN
      RAISE NOTICE 'held over threshold';
    END IF;
  END IF;
  v_flagged := 0;
  FOR v_entry IN SELECT amount FROM ledger WHERE account_id = p_account LOOP
    IF v_entry.amount > p_threshold THEN
      v_flagged := v_flagged + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '%', v_flagged;
END;
$$;

 */
