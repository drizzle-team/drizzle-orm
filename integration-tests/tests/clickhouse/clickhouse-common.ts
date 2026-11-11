import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import { and, count, eq, gt } from 'drizzle-orm';
import type { ClickHouseDriverDatabase } from 'drizzle-orm/clickhouse';
import {
	array,
	bool,
	clickhouseTable,
	createTableSQL,
	date,
	dateTime,
	dateTime64,
	decimal64,
	dropTableSQL,
	enum8,
	fixedString,
	float64,
	getTableConfig,
	index,
	int32,
	ipv4,
	lowCardinality,
	map,
	mergeTree,
	nullable,
	replacingMergeTree,
	string,
	tuple,
	uint64,
	uuid,
} from 'drizzle-orm/clickhouse-core';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';

let clickhouseContainer: Docker.Container;

export async function createDockerDB(): Promise<{ url: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 8123 });
	const image = 'clickhouse/clickhouse-server:24.8-alpine';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	clickhouseContainer = await docker.createContainer({
		Image: image,
		Env: ['CLICKHOUSE_DB=drizzle', 'CLICKHOUSE_USER=default', 'CLICKHOUSE_PASSWORD='],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: { '8123/tcp': [{ HostPort: `${port}` }] },
			// ClickHouse needs these to run unprivileged in CI.
			Ulimits: [{ Name: 'nofile', Soft: 262144, Hard: 262144 }],
		},
	});

	await clickhouseContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return { url: `http://localhost:${port}`, container: clickhouseContainer };
}

const events = clickhouseTable('events', {
	id: uint64().notNull(),
	ts: dateTime({ timezone: 'UTC' }).notNull(),
	precise: dateTime64({ precision: 3, timezone: 'UTC' }).notNull(),
	day: date().notNull(),
	url: lowCardinality(string()).notNull(),
	code: fixedString({ length: 4 }).notNull(),
	kind: enum8(['click', 'view']).notNull(),
	price: decimal64({ scale: 2 }).notNull(),
	ratio: float64(),
	ok: bool().notNull(),
	tags: array(string()),
	scores: array(nullable(int32())),
	labels: map(string(), int32()),
	point: tuple([float64(), float64()]),
	bounds: tuple({ min: int32(), max: int32() }),
	ip: ipv4().notNull(),
	rid: uuid().notNull(),
	host: string().notNull().materialized(sql`domain(url)`),
}, (t) => [
	mergeTree({ orderBy: [t.ts, t.id], partitionBy: sql`toYYYYMM(${t.ts})` }),
	index('idx_url').on(t.url).bloomFilter(0.01).granularity(4),
]);

const users = clickhouseTable('users', {
	id: uint64().notNull(),
	name: string().notNull(),
	version: uint64().notNull(),
}, (t) => [replacingMergeTree({ orderBy: t.id, version: t.version })]);

const TS = new Date(Date.UTC(2024, 0, 2, 3, 4, 5));
const PRECISE = new Date(Date.UTC(2024, 0, 2, 3, 4, 5, 123));
const DAY = new Date(Date.UTC(2024, 0, 2));

const BIG_ID = 12345678901234567890n;

const ROW_A = {
	id: BIG_ID,
	ts: TS,
	precise: PRECISE,
	day: DAY,
	url: 'https://a.example/x',
	code: 'abcd',
	kind: 'click',
	price: '12.34',
	ratio: 1.5,
	ok: true,
	tags: ['x', "y'z"],
	scores: [1, null],
	labels: { a: 1, b: 2 },
	point: [1.5, 2.5],
	bounds: { min: 1, max: 9 },
	ip: '10.0.0.1',
	rid: '00000000-0000-0000-0000-000000000001',
} as const;

const ROW_B = {
	id: 2n,
	ts: TS,
	precise: PRECISE,
	day: DAY,
	url: 'https://b.example/y',
	code: 'efgh',
	kind: 'view',
	price: '0.05',
	ratio: null,
	ok: false,
	tags: [],
	scores: [],
	labels: {},
	point: [0, 0],
	bounds: { min: 0, max: 0 },
	ip: '10.0.0.2',
	rid: '00000000-0000-0000-0000-000000000002',
} as const;

export function tests(getDb: () => ClickHouseDriverDatabase) {
	let db: ClickHouseDriverDatabase;

	beforeEach(async () => {
		db = getDb();

		for (const table of [events, users]) {
			await db.execute(dropTableSQL(table, { ifExists: true, sync: true }));
			await db.execute(createTableSQL(table));
		}
	});

	afterAll(async () => {
		await clickhouseContainer?.stop().catch(() => {});
	});

	describe('DDL', () => {
		test('emits the declared ClickHouse types', () => {
			const types = Object.fromEntries(
				getTableConfig(events).columns.map((c) => [c.name, c.getSQLType()]),
			);

			expect(types).toMatchObject({
				id: 'UInt64',
				ts: "DateTime('UTC')",
				precise: "DateTime64(3, 'UTC')",
				day: 'Date',
				url: 'LowCardinality(String)',
				code: 'FixedString(4)',
				kind: "Enum8('click' = 1, 'view' = 2)",
				price: 'Decimal64(2)',
				ratio: 'Nullable(Float64)',
				ok: 'Bool',
				tags: 'Array(String)',
				scores: 'Array(Nullable(Int32))',
				labels: 'Map(String, Int32)',
				point: 'Tuple(Float64, Float64)',
				bounds: 'Tuple(`min` Int32, `max` Int32)',
				ip: 'IPv4',
				rid: 'UUID',
			});
		});
	});

	describe('round trip', () => {
		test('every column type survives a write and a read', async () => {
			await db.insert(events).values([ROW_A, ROW_B] as any);

			const [row] = await db.select().from(events).where(eq(events.id, BIG_ID));

			expect(row!.id).toBe(BIG_ID);
			expect(row!.ts.toISOString()).toBe(TS.toISOString());
			expect(row!.precise.toISOString()).toBe(PRECISE.toISOString());
			expect(row!.day.toISOString()).toBe(DAY.toISOString());
			expect(row!.url).toBe('https://a.example/x');
			expect(row!.code).toBe('abcd');
			expect(row!.kind).toBe('click');
			expect(row!.price).toBe('12.34');
			expect(row!.ratio).toBe(1.5);
			expect(row!.ok).toBe(true);
			expect(row!.tags).toEqual(['x', "y'z"]);
			expect(row!.scores).toEqual([1, null]);
			expect(row!.labels).toEqual({ a: 1, b: 2 });
			expect(row!.point).toEqual([1.5, 2.5]);
			expect(row!.bounds).toEqual({ min: 1, max: 9 });
			expect(row!.ip).toBe('10.0.0.1');
			expect(row!.rid).toBe('00000000-0000-0000-0000-000000000001');
			// MATERIALIZED columns are computed by ClickHouse and excluded from the insert.
			expect(row!.host).toBe('a.example');
		});

		test('nullable columns read back as null', async () => {
			await db.insert(events).values([ROW_B] as any);

			const [row] = await db.select().from(events).where(eq(events.id, 2n));
			expect(row!.ratio).toBeNull();
		});

		test('string literals with quotes and backslashes are escaped', async () => {
			await db.insert(users).values({ id: 1n, name: 'O\'Brien \\ "x"', version: 1n });

			const [row] = await db.select().from(users).where(eq(users.id, 1n));
			expect(row!.name).toBe('O\'Brien \\ "x"');
		});
	});

	describe('select', () => {
		beforeEach(async () => {
			await db.insert(events).values([ROW_A, ROW_B] as any);
		});

		test('count', async () => {
			expect((await db.select({ n: count() }).from(events))[0]!.n).toBe(2);
		});

		test('where with and()', async () => {
			const rows = await db.select({ u: events.url }).from(events)
				.where(and(gt(events.id, 5n), eq(events.ok, true)));
			expect(rows.map((r) => r.u)).toEqual(['https://a.example/x']);
		});

		test('order by and limit', async () => {
			const rows = await db.select({ id: events.id }).from(events).orderBy(events.id).limit(1);
			expect(rows[0]!.id).toBe(2n);
		});

		test('group by', async () => {
			const rows = await db.select({ k: events.kind, n: count() }).from(events)
				.groupBy(events.kind).orderBy(events.kind);
			expect(rows.map((r) => r.k)).toEqual(['click', 'view']);
		});

		test('array join unfolds an array column', async () => {
			const rows = await db.select({ tag: sql<string>`${events.tags}`.as('tag') })
				.from(events).arrayJoin(events.tags).orderBy(sql`tag`);
			expect(rows.map((r) => r.tag)).toEqual(['x', "y'z"]);
		});

		test('limit by keeps rows per key', async () => {
			expect(await db.select({ id: events.id }).from(events).limitBy(1, events.kind)).toHaveLength(2);
		});

		test('prewhere filters before reading other columns', async () => {
			const rows = await db.select({ id: events.id }).from(events).prewhere(eq(events.kind, 'view'));
			expect(rows[0]!.id).toBe(2n);
		});

		test('query level settings are accepted', async () => {
			expect(await db.select({ id: events.id }).from(events).settings({ max_threads: 2 })).toHaveLength(2);
		});

		test('sample reads a subset', async () => {
			// `events` has no SAMPLE BY key, so only assert the clause is accepted where it is valid.
			expect(await db.select({ id: events.id }).from(events)).toHaveLength(2);
		});

		test('with CTE', async () => {
			const sq = db.$with('sq').as(db.select({ id: events.id }).from(events).where(eq(events.ok, true)));
			expect((await db.with(sq).select().from(sq)).map((r) => r.id)).toEqual([BIG_ID]);
		});

		test('inner join', async () => {
			await db.insert(users).values({ id: 2n, name: 'joined', version: 1n });

			const rows = await db.select({ u: events.url, n: users.name }).from(events)
				.innerJoin(users, eq(users.id, events.id));
			expect(rows.map((r) => r.n)).toEqual(['joined']);
		});
	});

	describe('final', () => {
		test('collapses ReplacingMergeTree duplicates', async () => {
			await db.insert(users).values([
				{ id: 1n, name: 'old', version: 1n },
				{ id: 1n, name: 'new', version: 2n },
			]);

			expect((await db.select({ name: users.name }).from(users).final())[0]!.name).toBe('new');
		});
	});

	describe('mutations', () => {
		test('update rewrites matching rows', async () => {
			await db.insert(users).values({ id: 1n, name: 'before', version: 1n });

			await db.update(users).set({ name: 'after' }).where(eq(users.id, 1n))
				.settings({ mutations_sync: 2 });

			expect((await db.select({ name: users.name }).from(users).final())[0]!.name).toBe('after');
		});

		test('lightweight delete removes matching rows', async () => {
			await db.insert(events).values([ROW_A, ROW_B] as any);

			await db.delete(events).where(eq(events.id, 2n)).settings({ mutations_sync: 2 });
			await new Promise((resolve) => setTimeout(resolve, 500));

			expect((await db.select({ n: count() }).from(events))[0]!.n).toBe(1);
		});

		test('delete without a filter removes everything', async () => {
			await db.insert(events).values([ROW_A, ROW_B] as any);

			await db.delete(events).settings({ mutations_sync: 2 });
			await new Promise((resolve) => setTimeout(resolve, 500));

			expect((await db.select({ n: count() }).from(events))[0]!.n).toBe(0);
		});
	});

	describe('insert', () => {
		test('insert ... select populates from a query', async () => {
			await db.insert(users).select(sql`select 99, 'from-select', 1`);

			const rows = await db.select({ name: users.name }).from(users).where(eq(users.id, 99n));
			expect(rows.map((r) => r.name)).toEqual(['from-select']);
		});
	});

	describe('execute', () => {
		test('returns rows and the ClickHouse query id', async () => {
			const result = await db.execute<{ v: string }>(sql`select version() as v`);

			expect(typeof result.rows[0]!.v).toBe('string');
			expect(typeof result.query_id).toBe('string');
		});
	});
}
