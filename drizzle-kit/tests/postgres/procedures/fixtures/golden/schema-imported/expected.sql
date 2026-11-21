CREATE OR REPLACE PROCEDURE "tenant".bump(p_id bigint, INOUT "n" bigint DEFAULT NULL)
LANGUAGE plpgsql
AS $$
#variable_conflict use_column
DECLARE
  v_row record;
BEGIN
  SELECT count(*) AS n FROM counters WHERE id = p_id INTO STRICT v_row;
  "n" := v_row.n;
  RETURN;
END;
$$;
