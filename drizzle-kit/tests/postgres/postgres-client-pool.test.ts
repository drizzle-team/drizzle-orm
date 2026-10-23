import { sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	check,
	date,
	index,
	jsonb,
	numeric,
	pgMaterializedView,
	pgSequence,
	pgTable,
	pgView,
	time,
	timestamp,
} from 'drizzle-orm/pg-core';
import { createPool } from 'drizzle-orm/postgres/client';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'fs';
import { tmpdir } from 'os';
import { join, relative } from 'path';
import { afterAll, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';
import { handle as pull } from '../../src/cli/commands/pull-postgres';
import { handle as push } from '../../src/cli/commands/push-postgres';
import { preparePostgresDB } from '../../src/cli/connections';
import { runWithCliContext } from '../../src/cli/context';
import { HintsHandler } from '../../src/cli/hints';
import { fromExports, SchemaSource } from '../../src/dialects/postgres/drizzle';

// Drizzle Kit creates its own Drizzle Postgres pool only when no other Postgres driver is installed. These
// drivers are dev dependencies of the package, so the test hides them to reach that pool.
for (const driver of ['pg', 'postgres', '@vercel/postgres', '@neondatabase/serverless']) {
	vi.doMock(driver, () => {
		throw new Error('The driver is not installed.');
	});
}

const big = '9007199254740993';
const int8Min = '-9223372036854775808';
const int8Max = '9223372036854775807';

const records = pgTable('records', {
	id: bigserial({ mode: 'bigint' }).primaryKey(),
	counter: bigint({ mode: 'bigint' }).default(BigInt(big)).notNull(),
	ascending: bigint({ mode: 'bigint' }).generatedAlwaysAsIdentity({
		startWith: big,
		minValue: big,
		maxValue: int8Max,
		increment: big,
		cache: 3000000000,
	}),
	descending: bigint({ mode: 'bigint' }).generatedByDefaultAsIdentity({
		startWith: '-' + big,
		minValue: int8Min,
		maxValue: '-1',
		increment: '-' + big,
		cache: 3000000000,
		cycle: true,
	}),
	createdAt: timestamp({ precision: 6 }).default(sql`'2024-01-02 03:04:05.123456'`),
	updatedAt: timestamp({ precision: 6, withTimezone: true }).defaultNow(),
	endsAt: timestamp().default(sql`'infinity'`),
	day: date().default('2024-01-02'),
	today: date().defaultNow(),
	clock: time({ precision: 6 }).default('12:34:56.123456'),
	clockNow: time().defaultNow(),
	amount: numeric({ precision: 38, scale: 10 }).default('12345678901234567890.1234567890'),
	ids: bigint({ mode: 'bigint' }).array().default([BigInt(big), BigInt(int8Min)]),
	payload: jsonb().default({ name: 'value', list: [1, 2] }),
	bigPayload: jsonb().default(sql`'{"id": ${sql.raw(big)}}'::jsonb`),
}, (table) => [
	check('counter_check', sql`${table.counter} > ${sql.raw(big)} AND ${table.createdAt} > '2024-01-01 00:00:00.000001'`),
	index('records_counter_index').on(table.counter.desc(), sql`(${table.counter} + 1)`).where(
		sql`${table.counter} > ${sql.raw(big)}`,
	),
]);

const ascendingSequence = pgSequence('ascending_sequence', {
	startWith: big,
	minValue: big,
	maxValue: int8Max,
	increment: big,
	cache: 3000000000,
});

const descendingSequence = pgSequence('descending_sequence', {
	startWith: '-' + big,
	minValue: int8Min,
	maxValue: '-1',
	increment: '-' + big,
	cycle: true,
});

const recordsView = pgView('records_view').as((qb) =>
	qb.select({ counter: records.counter, createdAt: records.createdAt, ids: records.ids, payload: records.payload })
		.from(records).where(sql`${records.counter} > ${sql.raw(big)}`)
);

const recordsMaterializedView = pgMaterializedView('records_materialized_view').as((qb) =>
	qb.select({ day: records.day, amount: records.amount }).from(records).where(
		sql`${records.createdAt} > '2024-01-01 00:00:00.000001'`,
	)
);

const schema = { records, ascendingSequence, descendingSequence, recordsView, recordsMaterializedView };

const baseUrl = process.env.PG_CONNECTION_STRING;

describe.skipIf(!baseUrl)('a Drizzle Postgres pool passed as dbCredentials.client', () => {
	const databaseName = `postgres_client_pool_${process.pid}`;
	const filters = { schemas: [], tables: [], entities: undefined, extensions: [] } as never;
	const migrations = { table: '__drizzle_migrations', schema: 'drizzle' };
	let url: string;
	let admin: ReturnType<typeof createPool>;
	let userPool: ReturnType<typeof createPool>;
	let outDir: string;

	beforeAll(async () => {
		admin = createPool({ url: baseUrl! });
		await admin.query(`DROP DATABASE IF EXISTS ${databaseName}`);
		await admin.query(`CREATE DATABASE ${databaseName}`);
		const parsed = new URL(baseUrl!);
		parsed.pathname = `/${databaseName}`;
		url = parsed.toString();
		userPool = createPool({ url });
		outDir = mkdtempSync(join(tmpdir(), 'postgres-client-pool-'));
	});

	afterAll(async () => {
		await userPool?.end();
		await admin?.query(`DROP DATABASE IF EXISTS ${databaseName} WITH (FORCE)`);
		await admin?.end();
		if (outDir) rmSync(outDir, { recursive: true, force: true });
	});

	beforeEach(async () => {
		await userPool.query('DROP SCHEMA IF EXISTS public CASCADE');
		await userPool.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
		await userPool.query('CREATE SCHEMA public');
	});

	const runPush = (credentials: { url: string } | { client: typeof userPool }, explain: boolean) =>
		runWithCliContext({ output: 'json', interactive: false }, () =>
			push(
				SchemaSource.fromSchema(fromExports(schema)),
				false,
				credentials as never,
				filters,
				false,
				explain,
				migrations,
				new HintsHandler(),
			));

	const readFolder = (dir: string): Record<string, unknown> => {
		const files: Record<string, unknown> = {};
		const walk = (current: string) => {
			for (const name of readdirSync(current)) {
				const file = join(current, name);
				if (statSync(file).isDirectory()) {
					walk(file);
					continue;
				}
				const key = relative(dir, file).replace(/^\d+_[^/]+\//, 'migration/');
				const text = readFileSync(file, 'utf8');
				if (!name.endsWith('.json')) {
					files[key] = text;
					continue;
				}
				const { id: _id, ...snapshot } = JSON.parse(text);
				files[key] = snapshot;
			}
		};
		walk(dir);
		return files;
	};

	const runPull = async (credentials: { url: string } | { client: typeof userPool }, name: string) => {
		const out = join(outDir, name);
		mkdirSync(out);
		const db = await preparePostgresDB(credentials as never);
		expect(db.packageName).toBe('@drizzle-team/postgres');
		await runWithCliContext(
			{ output: 'json', interactive: false },
			() => pull('camel', out, true, credentials as never, filters, migrations, false, db),
		);
		return readFolder(out);
	};

	test('push plans the same statements as through the own pool and then reports no changes', async () => {
		const ownPlan = await runPush({ url }, true);
		await runPush({ url }, false);
		const ownSecond = await runPush({ url }, false);

		await userPool.query('DROP SCHEMA public CASCADE');
		await userPool.query('CREATE SCHEMA public');

		const userPlan = await runPush({ client: userPool }, true);
		await runPush({ client: userPool }, false);
		const userSecond = await runPush({ client: userPool }, false);

		expect(ownPlan).toMatchObject({ status: 'ok' });
		expect(JSON.stringify(ownPlan)).toContain(big);
		expect(userPlan).toStrictEqual(ownPlan);
		expect(ownSecond).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
		expect(userSecond).toStrictEqual({ status: 'no_changes', dialect: 'postgresql' });
	});

	test('pull writes the same schema files and snapshot as through the own pool', async () => {
		await runPush({ url }, false);

		const own = await runPull({ url }, 'own');
		const user = await runPull({ client: userPool }, 'user');

		expect(Object.keys(own).sort()).toStrictEqual([
			'migration/migration.sql',
			'migration/snapshot.json',
			'relations.ts',
			'schema.ts',
		]);
		expect(own['schema.ts']).toContain(big);
		expect(own['schema.ts']).toContain(int8Min);
		expect(user).toStrictEqual(own);
	});
});
