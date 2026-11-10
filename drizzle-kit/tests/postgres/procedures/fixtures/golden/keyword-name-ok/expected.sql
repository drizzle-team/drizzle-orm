CREATE OR REPLACE PROCEDURE left()
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE NOTICE 'left is a type_func_name keyword, legal as a routine name';
END;
$$;
