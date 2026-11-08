-- initdb hashes POSTGRES_PASSWORD with the default 4096 SCRAM iterations, before the server's
-- scram_iterations=1 applies; re-hash it, so the proxy's per-request password check is a single HMAC.
SET scram_iterations = 1;
ALTER ROLE postgres PASSWORD 'postgres';
