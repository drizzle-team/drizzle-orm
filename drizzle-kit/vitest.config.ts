import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// With PG_VERSION, only the postgres test files named *.versions.test.ts run, against the server of that version
// (see tests/postgres/README.md). No such file exists today, so CI runs the postgres tests on PGlite only.
const versionedPostgresTests = ['tests/postgres/*.versions.test.ts'];

// CI runs the commutativity suite in its own shard (kit:postgres:commutativity), beside kit:postgres.
// .github/ci/run-shard.sh sets KIT_POSTGRES_SUITE for those shards. Without it (local runs), the postgres suite is
// complete.
const commutativityTests = ['tests/postgres/commutativity*.test.ts'];
const postgresSuite = process.env['KIT_POSTGRES_SUITE'];

export default defineConfig({
	test: {
		include: process.env['PG_VERSION'] && postgresSuite !== 'commutativity' ? versionedPostgresTests : [
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
		],

		typecheck: {
			tsconfig: 'tsconfig.json',
		},
		testTimeout: 100000,
		hookTimeout: 100000,
		maxConcurrency: 5,
		// Test files run one after another. KIT_FILE_PARALLELISM=1 runs them side by side, for a run whose files each
		// have a database of their own: PGlite in-process, a database per worker (PostGIS), or a server per worker
		// (several ;-separated COCKROACH_CONNECTION_STRINGs, as cockroach-many serves). Not with one shared server: the
		// setups drop and recreate a database named drizzle, and drop every role. kit:cockroach sets it on CI, where
		// its DDL mostly waits on CockroachDB. kit:postgres sets it on GitHub-hosted runners only: PGlite is CPU work, and
		// on the self-hosted machine, whose CPUs the jobs of every runner instance keep busy, its workers only competed.
		// At most 2 workers on CI unless KIT_MAX_WORKERS is set.
		fileParallelism: process.env['KIT_FILE_PARALLELISM'] === '1',
		maxWorkers: process.env['KIT_MAX_WORKERS']
			? Number(process.env['KIT_MAX_WORKERS'])
			: process.env['CI']
			? 2
			: undefined,
	},
	plugins: [tsconfigPaths()],
});
