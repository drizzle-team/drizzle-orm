CREATE OR REPLACE PROCEDURE report_progress(p_pct integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_pct > 100 THEN
    RAISE EXCEPTION 'can''t exceed 100%%' USING ERRCODE = 'P0001';
  END IF;
  v_status := 'it''s going well';
  RAISE NOTICE '50%% done, don''t stop';
  RAISE NOTICE '%', v_status;
END;
$$;
