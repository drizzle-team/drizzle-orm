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
- [x] Add MSSQL native column builders: `uniqueidentifier`, `xml`, `money`, `smallmoney`, `rowversion`, `geography`, `geometry`
- [x] Add MSSQL index key ordering via `.asc()` / `.desc()` in table extra config
- [x] Add MSSQL index `INCLUDE` support
- [x] Add MSSQL index `WITH (FILLFACTOR = ..., ONLINE = ...)` SQL emission
- [x] Add drizzle-kit MSSQL snapshot v3 migration for index metadata
- [x] Add drizzle-kit MSSQL pull/codegen metadata for descending keys, included columns, and fill factor
- [x] Implement existing MSSQL `FOR XML` / `FOR BROWSE` select modes in the dialect
- [x] Add dedicated MSSQL full-text index DSL, SQL emission, pull metadata, and codegen
- [x] Add dedicated MSSQL columnstore index DSL, SQL emission, pull metadata, and codegen
- [x] Add opt-in WKT/point codecs for MSSQL `geography` and `geometry`
- [x] Expand internal MSSQL `FOR XML` modes and options (`RAW`, `AUTO`, `EXPLICIT`, `PATH`, `ROOT`, `ELEMENTS`, `BINARY BASE64`, `TYPE`)

## Verification
- [x] Manual SQL compile smoke check
- [x] SQL snapshot tests pass
- [x] MSSQL integration tests added
- [x] MSSQL integration tests pass
- [x] V1 `_query` regression test passes
- [x] Type tests pass
- [x] Pothos schema/query-shape smoke passes
- [x] Pothos live SQL Server acceptance test passes
- [x] ORM type tests cover native MSSQL types and index DSL
- [ ] Focused drizzle-kit MSSQL index/native-type tests pass locally
- [ ] Full ORM build completes locally

## Current Blockers
- Local `pnpm --filter drizzle-orm build` hangs in `bun --bun run scripts/build.ts`; ORM type tests pass, but kit type tests still depend on rebuilt `drizzle-orm/dist`.
- Focused drizzle-kit MSSQL tests currently fail in setup before assertions because the local SQL Server connection uses `127.0.0.1` with TLS SNI, which tedious rejects.

## PR Notes
- [x] Document SQL Server 2016+ requirement
- [x] Document `offset` fallback ordering: PK-backed tables are deterministic; views/no-PK sources use all exposed columns as a best-effort SQL Server fallback and should pass explicit `orderBy` for production pagination semantics
- [x] Document `ONLINE = ON` as a create/rebuild execution option; SQL Server does not expose it as durable index metadata for pull round trips
- [x] Document full-text and columnstore indexes as separate SQL Server index families
- [x] Document SQL Server limitations: no `refreshMaterializedView`; indexed views are the MSSQL analogue; schema rename remains unsupported in kit
- [x] Call out beta churn and recommend upstreaming over patching node_modules
