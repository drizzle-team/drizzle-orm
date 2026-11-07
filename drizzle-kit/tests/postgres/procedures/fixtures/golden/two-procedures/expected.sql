CREATE OR REPLACE PROCEDURE greet_owner(p_name text)
LANGUAGE plpgsql
AS $$
DECLARE
  v_greeting text;
BEGIN
  v_greeting := 'hello ' || p_name;
  RAISE NOTICE '%', v_greeting;
END;
$$;

CREATE OR REPLACE PROCEDURE reset_score(p_player integer, p_base integer)
LANGUAGE plpgsql
AS $$
DECLARE
  v_next integer;
BEGIN
  v_next := p_base + 1;
  UPDATE scores SET score = v_next WHERE player_id = p_player;
  RAISE NOTICE '%', v_next;
END;
$$;
