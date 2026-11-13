CREATE OR REPLACE PROCEDURE book_slot(p_slot bigint, p_guest bigint, p_idem_key text, INOUT "booking" bigint DEFAULT NULL, INOUT "status" text DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_s record;
  v_b record;
  v_res__id bigint;
  v_err__code text;
  v_existing record;
  v_err__message text;
BEGIN
  v_err__code := NULL;
  BEGIN
    SELECT capacity, booked FROM slots WHERE id = p_slot FOR UPDATE INTO STRICT v_s;
    IF v_s.booked >= v_s.capacity THEN
      RAISE EXCEPTION 'slot % is full', p_slot USING ERRCODE = 'P0409';
    END IF;
    UPDATE slots SET booked = booked + 1 WHERE id = p_slot;
    INSERT INTO bookings (slot_id, guest_id, idem_key) VALUES (p_slot, p_guest, p_idem_key) RETURNING id INTO STRICT v_b;
    v_res__id := v_b.id;
  EXCEPTION
    WHEN unique_violation THEN
      v_err__code := 'unique_violation';
      GET STACKED DIAGNOSTICS v_err__message = MESSAGE_TEXT;
    WHEN SQLSTATE 'P0409' THEN
      v_err__code := 'P0409';
      GET STACKED DIAGNOSTICS v_err__message = MESSAGE_TEXT;
  END;
  IF NOT v_err__code IS NULL THEN
    IF v_err__code = 'unique_violation' THEN
      SELECT id FROM bookings WHERE idem_key = p_idem_key INTO STRICT v_existing;
      "booking" := v_existing.id;
      "status" := 'duplicate';
      RETURN;
    END IF;
    RAISE EXCEPTION 'cannot book slot %', p_slot USING ERRCODE = 'P0409', DETAIL = format('%s', v_err__message);
  END IF;
  "booking" := v_res__id;
  "status" := 'created';
  RETURN;
END;
$$;

CREATE OR REPLACE PROCEDURE import_guests(p_batch bigint, INOUT "skipped" integer DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_skipped integer;
  v_g record;
  v_email text;
  v_name text;
  v_err__code text;
BEGIN
  v_skipped := 0;
  FOR v_g IN SELECT email, name FROM guest_imports WHERE batch_id = p_batch ORDER BY email LOOP
    v_email := v_g.email;
    v_name := v_g.name;
    v_err__code := NULL;
    BEGIN
      INSERT INTO guests (email, name) VALUES (v_email, v_name);
    EXCEPTION
      WHEN unique_violation THEN
        v_err__code := 'unique_violation';
    END;
    IF NOT v_err__code IS NULL THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
  END LOOP;
  BEGIN
    UPDATE import_batches SET done = true WHERE id = p_batch;
  EXCEPTION
    WHEN lock_not_available THEN
      NULL;
  END;
  "skipped" := v_skipped;
  RETURN;
END;
$$;
