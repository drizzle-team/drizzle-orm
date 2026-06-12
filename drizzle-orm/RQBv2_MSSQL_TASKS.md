# MSSQL RQBv2 Task Tracker

## Baseline
- [x] Work branch is based on `origin/beta`
- [x] Confirm MSSQL `_query` V1 still imports `~/_relations.ts`
- [x] Confirm MySQL/PG V2 helpers and signatures from `~/relations.ts`

## Implementation
- [x] Preserve V1 `_query` via `buildRelationalQueryV1`
- [x] Add MSSQL V2 `buildRelationalQuery`
- [x] Add MSSQL V2 column JSON selection helpers
- [x] Rewrite shared relation-filter `limit 1` probes to MSSQL `top(1)`
- [x] Add MSSQL JSON value mappers for binary and object date/time columns
- [x] Add `query-builders/query-v2.ts`
- [x] Add `db.query` while retaining `db._query`
- [x] Wire V2 session mapper and JSON chunk concatenation
- [x] Forward `relations` through node-mssql drizzle config
- [x] Thread relation generics through node-mssql mock and migrator APIs
- [x] Update MSSQL exports

## Verification
- [x] Manual SQL compile smoke check
- [x] SQL snapshot tests pass
- [x] MSSQL integration tests added
- [x] MSSQL integration tests pass
- [x] V1 `_query` regression test passes
- [x] Type tests pass
- [x] Pothos schema/query-shape smoke passes
- [x] Pothos live SQL Server acceptance test passes

## Current Blockers
- None.

## PR Notes
- [x] Document SQL Server 2016+ requirement
- [x] Call out beta churn and recommend upstreaming over patching node_modules
