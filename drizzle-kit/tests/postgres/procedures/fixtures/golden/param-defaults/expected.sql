CREATE OR REPLACE PROCEDURE hold_slot(p_slot bigint, p_guest bigint, p_minutes integer DEFAULT 15, p_promo text DEFAULT NULL, INOUT "hold_id" bigint DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_hold record;
  v_hold_id bigint;
BEGIN
  INSERT INTO holds (slot_id, guest_id, expires_at) VALUES (p_slot, p_guest, now() + make_interval(mins => p_minutes)) RETURNING id INTO STRICT v_hold;
  v_hold_id := v_hold.id;
  IF NOT p_promo IS NULL THEN
    UPDATE holds SET promo_code = p_promo WHERE id = v_hold_id;
  END IF;
  "hold_id" := v_hold_id;
  RETURN;
END;
$$;

CREATE OR REPLACE PROCEDURE expire_holds(p_grace_minutes integer DEFAULT 0, p_dry_run boolean DEFAULT FALSE)
LANGUAGE plpgsql
AS $$
DECLARE
  v_expired__count bigint;
BEGIN
  DELETE FROM holds WHERE expires_at < now() - make_interval(mins => p_grace_minutes);
  GET DIAGNOSTICS v_expired__count = ROW_COUNT;
  RAISE NOTICE 'expired % holds', v_expired__count;
  IF p_dry_run THEN
    ROLLBACK;
  END IF;
END;
$$;
