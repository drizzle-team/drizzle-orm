CREATE OR REPLACE PROCEDURE grade_report(p_score integer, p_retries integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_attempts integer;
BEGIN
  IF p_score >= 90 THEN
    RAISE NOTICE 'excellent';
  ELSIF p_score >= 50 THEN
    RAISE NOTICE 'pass';
  ELSIF p_retries = 0 THEN
    RAISE NOTICE 'failed with no retries left';
    RETURN;
  ELSE
    RAISE NOTICE 'failed';
  END IF;
  v_attempts := p_retries;
  WHILE v_attempts > 0 LOOP
    RAISE NOTICE 'retry available';
    v_attempts := v_attempts - 1;
  END LOOP;
END;
$$;
