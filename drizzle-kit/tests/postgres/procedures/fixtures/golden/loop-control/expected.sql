CREATE OR REPLACE PROCEDURE first_free_slot(p_room bigint, p_day text, INOUT "slot" bigint DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_free bigint;
  v_slot record;
  v_slot_id bigint;
  v_taken record;
BEGIN
  v_free := NULL;
  FOR v_slot IN SELECT id, blocked FROM slots WHERE room_id = p_room AND day = p_day::date ORDER BY starts_at LOOP
    IF v_slot.blocked THEN
      CONTINUE;
    END IF;
    v_slot_id := v_slot.id;
    SELECT count(*) AS n FROM bookings WHERE slot_id = v_slot_id INTO STRICT v_taken;
    IF v_taken.n > 0 THEN
      CONTINUE;
    END IF;
    v_free := v_slot_id;
    EXIT;
  END LOOP;
  "slot" := v_free;
  RETURN;
END;
$$;

CREATE OR REPLACE PROCEDURE preview_reprice(p_room bigint, p_price numeric, INOUT "affected" bigint DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_touched__count bigint;
BEGIN
  UPDATE bookings SET price = p_price WHERE room_id = p_room AND status = 'pending';
  GET DIAGNOSTICS v_touched__count = ROW_COUNT;
  ROLLBACK;
  "affected" := v_touched__count;
  RETURN;
END;
$$;
