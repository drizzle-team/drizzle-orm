# minipg/aurora — test infrastructure

Two ways to run the live suite (`bun run test:aurora:live`) for `minipg/aurora`. The test file
(`test/integration/aurora.test.ts`) is endpoint-agnostic, so it runs unchanged against either.

## A) No AWS — local emulator (fastest, free)

Emulates the RDS Data API locally with [`koxudaxi/local-data-api`](https://github.com/koxudaxi/local-data-api)
over a throwaway Postgres container. Validates the full request/decode/transaction/batch flow (not SigV4 —
that's proven in the unit test — and it doesn't honor `longReturnType=STRING`, so >2^53 int8 exactness stays
covered by the unit test).

```sh
docker compose -f docker-compose.local-data-api.yml up -d

AURORA_DATA_API_ENDPOINT=http://localhost:8080 \
AURORA_RESOURCE_ARN='arn:aws:rds:us-east-1:123456789012:cluster:dummy' \
AURORA_SECRET_ARN='arn:aws:secretsmanager:us-east-1:123456789012:secret:dummy' \
AURORA_DATABASE=test AWS_ACCESS_KEY_ID=local AWS_SECRET_ACCESS_KEY=local \
bun run test:aurora:live

docker compose -f docker-compose.local-data-api.yml down -v   # tear down
```

## B) Real AWS — SST (authoritative)

Provisions a scale-to-zero Aurora Serverless v2 Postgres cluster with the Data API enabled. Uses the
account's **default VPC** (free) — no NAT, no new VPC. Idle cost ≈ $0 (`min: "0 ACU"` auto-pauses after
5 min).

1. Put AWS creds in the repo-root `.env` (gitignored): `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
   (+ `AWS_SESSION_TOKEN` if temporary), `AWS_REGION`.
   - Get a key: AWS Console → IAM → your user → Security credentials → Create access key → "CLI".
   - Needs perms to create RDS/Aurora + Secrets Manager + read the default VPC, and `rds-data:*` +
     `secretsmanager:GetSecretValue` to query.
2. Deploy:
   ```sh
   bun install
   set -a; source ../../.env; set +a
   bunx sst deploy
   ```
3. Copy the printed `AURORA_RESOURCE_ARN` / `AURORA_SECRET_ARN` / `AURORA_DATABASE` into the root `.env`
   (leave `AURORA_DATA_API_ENDPOINT` blank for real AWS), then from the repo root: `bun run test:aurora:live`.
4. Tear down: `bunx sst remove`.
