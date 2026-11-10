CREATE OR REPLACE PROCEDURE mark_reviewed(p_account bigint)
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE "accounts" SET "reviewed" = true WHERE "id" = p_account;
END;
$$;
