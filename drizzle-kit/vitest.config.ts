import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Postgres tests whose result does not depend on PG_VERSION: pure logic, or their own in-process PGlite (the
// migration-folder flows, merge-pairs alone takes ~2 min). They run once, in the PGlite shard (kit:postgres), not
// again in kit:postgres16/17/18, which select a real Postgres server through PG_VERSION. A test that uses that
// server (prepareTestDatabase) must not be listed here; a version-independent one that is missing only runs more often.
const versionIndependentPostgresTests = [
	'tests/postgres/api-format9.test.ts',
	'tests/postgres/check-branches.test.ts',
	'tests/postgres/check-schema.test.ts',
	'tests/postgres/commutativity.footprint-invariants.test.ts',
	'tests/postgres/commutativity.footprint.test.ts',
	'tests/postgres/commutativity.integration.test.ts',
	'tests/postgres/commutativity.matrix-gen.test.ts',
	'tests/postgres/ddl-refs.test.ts',
	'tests/postgres/delta-rules.test.ts',
	'tests/postgres/fix-conflicts.test.ts',
	'tests/postgres/folder-flow.test.ts',
	'tests/postgres/folder-integrity.test.ts',
	'tests/postgres/fuzz.test.ts',
	'tests/postgres/grammar.test.ts',
	'tests/postgres/merge-flow.test.ts',
	'tests/postgres/merge-pairs.test.ts',
	'tests/postgres/pg-view-dependencies.test.ts',
	'tests/postgres/postgres-client-pool.test.ts',
	'tests/postgres/procedures/compile.test.ts',
	'tests/postgres/rename-flow.test.ts',
	'tests/postgres/snapshot.test.ts',
	'tests/postgres/structural-delta.test.ts',
	'tests/postgres/up-format9.test.ts',
];

// CI runs the commutativity suite once, in its own shard (kit:postgres:commutativity) against the latest stable
// Postgres, instead of in every kit:postgres shard. .github/ci/run-shard.sh sets KIT_POSTGRES_SUITE for those
// shards; without it (local runs) the postgres suite is complete.
const commutativityTests = ['tests/postgres/commutativity*.test.ts'];
const postgresSuite = process.env['KIT_POSTGRES_SUITE'];

export default defineConfig({
	test: {
		include: [
			'tests/**/*.test.ts',
			'tests/**/*.test-d.ts',
			// Need to test it first before pushing changes
			// 'tests/singlestore-schemas.test.ts',
			// 'tests/singlestore-views.test.ts',
			// 'tests/push/singlestore-push.test.ts',
			// 'tests/push/singlestore.test.ts',
		],

		// This one was excluded because we need to modify an API for SingleStore-generated columns.
		// It’s in the backlog.
		exclude: [
			// 'tests/mssql/**/*.test.ts',
			// 'tests/cockroach/**/*.test.ts',
			'tests/**/singlestore-generated.test.ts',
			'tests/singlestore/**/*.test.ts',
			'tests/gel/**/*.test.ts',
			// 'tests/cockroach/',
			...(postgresSuite === 'main' ? commutativityTests : []),
			...(process.env['PG_VERSION'] && postgresSuite !== 'commutativity' ? versionIndependentPostgresTests : []),
		],

		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		maxConcurrency: 5,
		// Test files run one after another, unless a CI shard whose files each have a database of their own sets
		// KIT_FILE_PARALLELISM=1 (.github/ci/run-shard.sh): PGlite in-process, a database per worker (PostGIS), or a
		// server per worker (cockroach-many). Not with one shared server: the setups drop and recreate a database
		// named drizzle, and drop every role. At most 4 workers on CI (KIT_MAX_WORKERS), so a job leaves CPU to the
		// other runner instances on the machine.
		fileParallelism: process.env['KIT_FILE_PARALLELISM'] === '1',
		maxWorkers: process.env['KIT_MAX_WORKERS']
			? Number(process.env['KIT_MAX_WORKERS'])
			: process.env['CI']
			? 4
			: undefined,
	},
	plugins: [tsconfigPaths()],
});
