// Preloaded for every test file (bunfig.toml). In `bun test --parallel=N` each worker process runs its files against
// a database of its own on the one server, as drizzle's suites do (@drizzle/test-utils workerDatabaseName): files in
// different workers then can't see or drop each other's tables. The worker's database is made from scratch once per
// run, seeded as test/setup-pg.sh seeds testdb. A serial run, or a remote target, keeps using the base database.
import type { PGlite as PGliteInstance } from '@electric-sql/pglite';
import { afterAll } from 'bun:test';
import { connect } from '../../src/index.ts';
import { BASE_DATABASE, PGLITE, REMOTE, TEST_CONFIG, TEST_DATABASE, type TestPGlites, WORKER_ID } from './db.ts';

const FIXTURES = [
	'CREATE TABLE t(id serial primary key, name text, n8 bigint, amount numeric, ok bool, data jsonb, blob bytea)',
	`INSERT INTO t(name, n8, amount, ok, data, blob) VALUES
		('alice', 9007199254740993, 1234.56, true, '{"a":1}', '\\xdeadbeef'),
		('bob', 42, 0.1, false, '[1,2,3]', '\\x00ff'),
		(NULL, NULL, NULL, NULL, NULL, NULL)`,
];

// The run's id: every worker of one `bun test` is a child of it. With --parallel each file runs in a fresh global, so
// this preload runs again for every file of a worker; the database's comment tells the first file from the rest.
const RUN = `drizzle test run ${process.ppid}`;

const ident = (name: string) => `"${name.replaceAll('"', '""')}"`;
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

async function prepareWorkerDatabase(): Promise<void> {
	const admin = await connect({ ...TEST_CONFIG, database: BASE_DATABASE });
	try {
		const comment = await admin.query(
			`select shobj_description(oid, 'pg_database') from pg_database where datname = $1`,
			[TEST_DATABASE],
			{ mode: 'array' },
		);
		if ((comment.rows[0] as unknown[] | undefined)?.[0] === RUN) return;
		await admin.query(`drop database if exists ${ident(TEST_DATABASE)} with (force)`);
		await admin.query(`create database ${ident(TEST_DATABASE)}`);
	} finally {
		await admin.end();
	}
	const db = await connect({ ...TEST_CONFIG, database: TEST_DATABASE });
	try {
		for (const statement of FIXTURES) await db.query(statement);
		// last, so a worker that died while seeding makes the next file start over
		await db.query(`comment on database ${ident(TEST_DATABASE)} is ${literal(RUN)}`);
	} finally {
		await db.end();
	}
}

// A connection opened while the file's own PGlite is in use gets a spare (test/helpers/db.ts borrowPGlite): this many
// are cloned when the file starts, and each one taken is replaced in the background.
const SPARES = 3;

// A PGlite run: each file gets a PGlite of its own, seeded the same way, so with --parallel=N about N are in use at
// once, plus their spares. A file runs in a fresh global (--parallel implies --isolate), which is where the helpers
// find them. Starting a PGlite takes ~430 ms and cloning one ~100 ms, so the spares are clones of a seeded template.
async function preparePGlites(): Promise<void> {
	const { PGlite } = await import('@electric-sql/pglite');
	const template = await PGlite.create();
	for (const statement of FIXTURES) await template.query(statement);
	const clone = () => template.clone() as unknown as Promise<PGliteInstance>;
	const [own, ...spares] = await Promise.all(Array.from({ length: 1 + SPARES }, clone));
	const pglites: TestPGlites = {
		own: own!,
		ownInUse: false,
		spares,
		refill: () => void clone().then((spare) => pglites.spares.push(spare)),
		clone,
	};
	(globalThis as { drizzleTestPGlites?: TestPGlites }).drizzleTestPGlites = pglites;
	afterAll(async () => {
		await Promise.all([pglites.own, ...pglites.spares, template].map((pg) => pg.close().catch(() => {})));
	});
}

if (PGLITE) {
	await preparePGlites();
} else if (WORKER_ID !== undefined && !REMOTE) {
	// Without a server the integration tests fail on their own; the unit tests don't need one.
	await prepareWorkerDatabase().catch((e: unknown) => {
		console.warn(`test/helpers/worker-db.ts: could not prepare ${TEST_DATABASE}: ${(e as Error).message}`);
	});
}
