CREATE OR REPLACE PROCEDURE actual_name(p_account bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE '%', p_account;
END;
$$;
