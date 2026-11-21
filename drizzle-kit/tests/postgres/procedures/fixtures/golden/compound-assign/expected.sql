CREATE OR REPLACE PROCEDURE build_label(p_suffix text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_s text;
  v_i integer;
BEGIN
  v_s := 'a';
  v_s := v_s || p_suffix;
  v_i := 0;
  v_i := v_i + 1;
  RAISE NOTICE '%', v_s;
  RAISE NOTICE '%', v_i;
END;
$$;
