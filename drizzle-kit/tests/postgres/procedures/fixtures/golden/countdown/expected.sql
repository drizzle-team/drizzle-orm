CREATE OR REPLACE PROCEDURE countdown(p_start integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_remaining integer;
  v_label text;
BEGIN
  v_remaining := p_start;
  WHILE v_remaining > 0 LOOP
    v_label := CASE WHEN v_remaining % 2 = 0 THEN 'even' ELSE 'odd' END;
    RAISE NOTICE '%', 'tick ' || v_label;
    v_remaining := v_remaining - 1;
  END LOOP;
  RAISE NOTICE 'liftoff';
END;
$$;
