// @drizzle-team/postgres/compat-kysely under Kysely's own PostgresDialect: queries, results and errors as
// Kysely expects them; standalone queries shared across the pool; transactions, savepoints, streams and the
// abort strategies on one held connection.
import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { AbortedTransactionError, type Generated, Kysely, PostgresDialect, sql } from 'kysely';
import { type Migration, Migrator } from 'kysely/migration';
import { createPool, Cursor, type KyselyPool, type KyselyPoolOptions } from '../../src/compat/kysely-node.ts';
import { TEST_CONFIG, VARIANT, withConn } from '../helpers/db.ts';

const T = `kysely_${process.pid}`;
interface DB {
	[T]: {
		id: Generated<number>;
		name: string;
		n8: string | null;
		amount: string | null;
		at: Date | null;
		tags: string[] | null;
		data: unknown;
	};
}

const appName = () => `kysely-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const backends = async (app: string) =>
	withConn(async (c) =>
		Number(
			((await c.query('select count(*) from pg_stat_activity where application_name = $1', [app]))
				.rows[0] as unknown[])[0],
		)
	);
const kysely = (o: Parameters<typeof createPool>[0] & object = {}, options?: KyselyPoolOptions) => {
	const pool = createPool({ ...TEST_CONFIG, decode: VARIANT, ...o }, options);
	return { pool, db: new Kysely<DB>({ dialect: new PostgresDialect({ pool, cursor: Cursor }) }) };
};

describe('compat-kysely', () => {
	let pool: KyselyPool;
	let db: Kysely<DB>;
	beforeAll(async () => {
		({ pool, db } = kysely({ max: 4 }));
		await db.schema.createTable(T)
			.addColumn('id', 'serial', (c) => c.primaryKey())
			.addColumn('name', 'text', (c) => c.notNull())
			.addColumn('n8', 'int8')
			.addColumn('amount', 'numeric')
			.addColumn('at', 'timestamptz')
			.addColumn('tags', sql`text[]`)
			.addColumn('data', 'jsonb')
			.execute();
		await db.insertInto(T).values([
			{
				name: 'a',
				n8: '9007199254740993',
				amount: '12.50',
				at: new Date('2024-02-03T12:34:56.789Z'),
				tags: ['x'],
				data: { k: [1] },
			},
			{ name: 'b' },
		]).execute();
	});
	afterAll(async () => {
		await db?.schema.dropTable(T).ifExists().execute();
		await db?.destroy();
	});

	test('rows are objects, int8 is a string, other types as the driver decodes them', async () => {
		const r = await db.selectFrom(T).selectAll().where('name', '=', 'a').executeTakeFirstOrThrow();
		expect(r).toEqual({
			id: 1,
			name: 'a',
			n8: '9007199254740993',
			amount: '12.50',
			at: new Date('2024-02-03T12:34:56.789Z'),
			tags: ['x'],
			data: { k: [1] },
		});
	});

	test('the int8 config wins over the string default', async () => {
		const { db: big } = kysely({ int8: 'bigint' });
		try {
			const r = await big.selectFrom(T).select('n8').where('name', '=', 'a').executeTakeFirstOrThrow();
			expect(r.n8 as unknown).toBe(9007199254740993n);
		} finally {
			await big.destroy();
		}
	});

	test('affected rows and returning', async () => {
		const ins = await db.insertInto(T).values({ name: 'c' }).returning('id').executeTakeFirstOrThrow();
		const up = await db.updateTable(T).set({ name: 'c2' }).where('id', '=', ins.id).executeTakeFirstOrThrow();
		expect(up.numUpdatedRows).toBe(1n);
		const del = await db.deleteFrom(T).where('id', '=', ins.id).executeTakeFirstOrThrow();
		expect(del.numDeletedRows).toBe(1n);
	});

	test('errors keep their SQLSTATE', async () => {
		const e = await sql`select * from missing_${sql.raw(T)}`.execute(db).catch((x) => x);
		expect((e as { code?: string }).code).toBe('42P01');
	});

	test('standalone queries share connections: no checkout per query', async () => {
		const app = appName();
		const { pool: p, db: k } = kysely({ max: 2, applicationName: app });
		try {
			const rs = await Promise.all(
				Array.from({ length: 200 }, (_, i) => sql<{ v: number }>`select ${i}::int4 v`.execute(k)),
			);
			expect(rs.map((r) => r.rows[0]!.v)).toEqual(Array.from({ length: 200 }, (_, i) => i));
			expect(await backends(app)).toBe(2);
			const held = [await p.pool.connect(), await p.pool.connect()];
			expect(Math.max(...held.map((h) => h.client.stats.maxInflight))).toBeGreaterThan(1);
			for (const h of held) h.release();
		} finally {
			await k.destroy();
		}
	});

	test('a transaction holds one backend from begin to commit, alongside shared queries', async () => {
		const pids = await db.transaction().execute(async (tx) => {
			const a = await sql<{ pid: number; x: string }>`select pg_backend_pid() pid, txid_current()::text x`.execute(tx);
			await Promise.all(Array.from({ length: 20 }, () => sql`select 1`.execute(db))); // shared, meanwhile
			await tx.insertInto(T).values({ name: 'tx' }).execute();
			const b = await sql<{ pid: number; x: string }>`select pg_backend_pid() pid, txid_current()::text x`.execute(tx);
			return [a.rows[0], b.rows[0]];
		});
		expect(pids[1]).toEqual(pids[0]);
		expect(await db.selectFrom(T).select('name').where('name', '=', 'tx').execute()).toEqual([{ name: 'tx' }]);
		await db.deleteFrom(T).where('name', '=', 'tx').execute();
	});

	test('rollback on throw, isolation level and access mode', async () => {
		await db.transaction().execute(async (tx) => {
			await tx.insertInto(T).values({ name: 'gone' }).execute();
			throw new Error('boom');
		}).catch(() => {});
		expect(await db.selectFrom(T).select('name').where('name', '=', 'gone').execute()).toEqual([]);
		const iso = await db.transaction().setIsolationLevel('serializable').setAccessMode('read only').execute((tx) =>
			sql<
				{ i: string; ro: string }
			>`select current_setting('transaction_isolation') i, current_setting('transaction_read_only') ro`
				.execute(tx)
		);
		expect(iso.rows[0]).toEqual({ i: 'serializable', ro: 'on' });
	});

	test('controlled transaction with a savepoint rolled back', async () => {
		const tx = await db.startTransaction().execute();
		await tx.insertInto(T).values({ name: 'sp1' }).execute();
		const sp = await tx.savepoint('s1').execute();
		await sp.insertInto(T).values({ name: 'sp2' }).execute();
		await sp.rollbackToSavepoint('s1').execute();
		await tx.commit().execute();
		expect((await db.selectFrom(T).select('name').where('name', 'in', ['sp1', 'sp2']).execute()).map((r) => r.name))
			.toEqual(['sp1']);
		await db.deleteFrom(T).where('name', '=', 'sp1').execute();
	});

	test('committing an aborted transaction throws AbortedTransactionError', async () => {
		const tx = await db.startTransaction().execute();
		await sql`select 1/0`.execute(tx).catch(() => {});
		expect(await tx.commit().execute().catch((e) => e)).toBeInstanceOf(AbortedTransactionError);
	});

	test('stream outside a transaction', async () => {
		const ids: number[] = [];
		for await (const r of db.selectFrom(T).select('id').orderBy('id').stream(1)) ids.push(r.id);
		expect(ids).toEqual([1, 2]);
	});

	test('stream inside a transaction sees its uncommitted rows', async () => {
		const names = await db.transaction().execute(async (tx) => {
			await tx.insertInto(T).values({ name: 'uncommitted' }).execute();
			const out: string[] = [];
			for await (const r of tx.selectFrom(T).select('name').orderBy('id').stream(2)) out.push(r.name);
			throw Object.assign(new Error('rollback'), { out });
		}).catch((e: { out: string[] }) => e.out);
		expect(names).toEqual(['a', 'b', 'uncommitted']);
	});

	// Kysely's 'cancel query' / 'kill session' read the lease's backend pid, then signal that backend from another
	// lease. The pid query pins the lease, so the pid is the backend its next query runs on.
	test('pg_backend_pid() pins the lease to the backend it reports', async () => {
		const client = await pool.connect();
		try {
			const r = await client.query('select pg_backend_pid() pid');
			const pid = (r.rows[0] as { pid: number }).pid;
			expect(client._conn?.backendKey?.pid).toBe(pid);
			await Promise.all(Array.from({ length: 20 }, () => sql`select 1`.execute(db))); // shared, meanwhile
			expect(((await client.query('select pg_backend_pid() pid')).rows[0] as { pid: number }).pid).toBe(pid);
		} finally {
			client.release();
		}
	});

	test("'cancel query' stops the query on the server", async () => {
		const ac = new AbortController();
		setTimeout(() => ac.abort(), 200);
		const err = await sql`select pg_sleep(5) /* cancel-me */`
			.execute(db, { signal: ac.signal, inflightQueryAbortStrategy: 'cancel query' })
			.catch((e) => e as Error);
		expect(err).toBeInstanceOf(Error);
		let running = 1;
		for (let i = 0; i < 50 && running; i++) {
			await new Promise((r) => setTimeout(r, 20));
			running = (await sql<{ n: number }>`
				select count(*)::int4 n from pg_stat_activity where query like '%cancel-me%' and state = 'active' and pid <> pg_backend_pid()`
				.execute(db)).rows[0]!.n;
		}
		expect(running).toBe(0);
	});

	test("'cancel query' twice in a row cancels the right query both times", async () => {
		for (let round = 0; round < 2; round++) {
			const ac = new AbortController();
			setTimeout(() => ac.abort(), 150);
			const tag = `twice-${round}`;
			await sql`select pg_sleep(5), ${tag}::text`
				.execute(db, { signal: ac.signal, inflightQueryAbortStrategy: 'cancel query' })
				.catch(() => {});
			let running = 1;
			for (let i = 0; i < 50 && running; i++) {
				await new Promise((r) => setTimeout(r, 20));
				running = (await sql<{ n: number }>`
					select count(*)::int4 n from pg_stat_activity
					where query like 'select pg_sleep(5), $1%' and state = 'active' and pid <> pg_backend_pid()`
					.execute(db)).rows[0]!.n;
			}
			expect(running).toBe(0);
		}
	});

	// autoName: each distinct SQL gets a statement name, so the server keeps it prepared on the connection.
	test('autoName (the default) prepares each distinct SQL once per connection', async () => {
		const text = db.selectFrom(T).select(['name', 'n8']).where('id', '=', 0).compile().sql; // only this test runs it
		const prepared = await db.transaction().execute(async (tx) => {
			for (let i = 1; i <= 3; i++) await tx.selectFrom(T).select(['name', 'n8']).where('id', '=', i).execute();
			return sql<{ name: string }>`select name from pg_prepared_statements where statement = ${text}`.execute(tx);
		});
		expect(prepared.rows).toHaveLength(1); // three executions, one statement
		expect(prepared.rows[0]!.name).toMatch(/^_k/);
	});

	test('autoName: false sends every query unnamed', async () => {
		const { db: k } = kysely({}, { autoName: false });
		try {
			const prepared = await k.transaction().execute(async (tx) => {
				await tx.selectFrom(T).select('name').where('id', '=', 1).execute();
				return sql<{ n: number }>`select count(*)::int4 n from pg_prepared_statements`.execute(tx);
			});
			expect(prepared.rows[0]!.n).toBe(0);
		} finally {
			await k.destroy();
		}
	});

	// autoName's default is the pool's own `prepare`: behind a pooler no names are attached at all (not
	// attached and then dropped by the driver), and a pooled URL with an explicit prepare: true names again.
	test('autoName follows pool.prepare', async () => {
		const url =
			`postgres://${TEST_CONFIG.user}:${TEST_CONFIG.password}@${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}?pgbouncer=true`;
		for (const [extra, wantNamed] of [[{}, false], [{ prepare: true }, true]] as const) {
			const pool = createPool({ url, decode: VARIANT, ...extra });
			expect([pool.pool.behindPooler, pool.pool.prepare]).toEqual([true, wantNamed]);
			const names: Array<string | undefined> = [];
			const query = pool.pool.query.bind(pool.pool);
			pool.pool.query = ((sql: string, params: unknown[], opts?: { name?: string }) => {
				names.push(opts?.name);
				return query(sql, params, opts as never);
			}) as typeof pool.pool.query;
			const k = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
			try {
				await k.selectFrom(T).select('name').where('id', '=', 1).execute();
				expect(names).toHaveLength(1);
				expect(names[0] === undefined).toBe(!wantNamed);
			} finally {
				await k.destroy();
			}
		}
	});

	test('a pooled URL (?pgbouncer=true) sends every query unnamed, autoName or not', async () => {
		const url =
			`postgres://${TEST_CONFIG.user}:${TEST_CONFIG.password}@${TEST_CONFIG.host}:${TEST_CONFIG.port}/${TEST_CONFIG.database}?pgbouncer=true`;
		const k = new Kysely<DB>({ dialect: new PostgresDialect({ pool: createPool({ url, decode: VARIANT }) }) });
		try {
			const prepared = await k.transaction().execute(async (tx) => {
				await tx.selectFrom(T).select('name').where('id', '=', 1).execute();
				return sql<{ n: number }>`select count(*)::int4 n from pg_prepared_statements`.execute(tx);
			});
			expect(prepared.rows[0]!.n).toBe(0);
		} finally {
			await k.destroy();
		}
	});

	test('introspection', async () => {
		const t = (await db.introspection.getTables()).find((x) => x.name === T)!;
		expect(t.columns.map((c) => `${c.name}:${c.dataType}`)).toEqual([
			'id:int4',
			'name:text',
			'n8:int8',
			'amount:numeric',
			'at:timestamptz',
			'tags:_text',
			'data:jsonb',
		]);
	});

	test('migrator', async () => {
		const migrations: Record<string, Migration> = {
			'001': {
				up: (k) => k.schema.createTable(`${T}_m`).addColumn('id', 'integer').execute(),
				down: (k) => k.schema.dropTable(`${T}_m`).execute(),
			},
		};
		const m = new Migrator({
			db,
			provider: { getMigrations: async () => migrations },
			migrationTableName: `${T}_migrations`,
			migrationLockTableName: `${T}_lock`,
		});
		const up = await m.migrateToLatest();
		expect(up.error).toBeUndefined();
		expect(up.results?.map((r) => r.status)).toEqual(['Success']);
		expect((await m.migrateDown()).error).toBeUndefined();
		await db.schema.dropTable(`${T}_migrations`).execute();
		await db.schema.dropTable(`${T}_lock`).execute();
	});

	test('a lease released with destroy closes its held connection', async () => {
		const client = await pool.connect();
		await client.query('begin');
		const conn = client._conn!;
		client.release(true);
		for (let i = 0; i < 50 && conn.state !== 'closed'; i++) await new Promise((r) => setTimeout(r, 10));
		expect(conn.state).toBe('closed');
		expect(await sql<{ one: number }>`select 1 one`.execute(db).then((r) => r.rows)).toEqual([{ one: 1 }]);
	});
});
