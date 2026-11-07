CREATE OR REPLACE PROCEDURE "billing".close_period(p_period integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE periods SET closed = true WHERE id = p_period;
END;
$$;

CREATE OR REPLACE PROCEDURE close_period(p_period integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE periods SET archived = true WHERE id = p_period;
END;
$$;

CREATE OR REPLACE PROCEDURE "audit".reopen_period(p_period integer)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE periods SET closed = false WHERE id = p_period;
END;
$$;
