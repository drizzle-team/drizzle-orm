import 'dotenv/config';
import type { Pool } from '@drizzle-team/minipg';
import { eq, sql } from 'drizzle-orm';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core';
import { drizzle as drizzlePostgres, type PostgresDatabase } from 'drizzle-orm/postgres';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

const { Client } = pg;

const users = pgTable('pg18_returning_users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	note: text(),
	updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

const nullableRows = pgTable('pg18_returning_nullable_rows', {
	note: text(),
});

let client: pg.Client;
let db: NodePgDatabase;
let postgresDb: PostgresDatabase & { $client: Pool };

beforeAll(async () => {
	const connectionString = process.env['PG18_URL']
		?? 'postgres://postgres:postgres@localhost:54325/drizzle';
	const sleep = 250;
	let timeLeft = 5000;
	let connected = false;
	let lastError: unknown;

	do {
		try {
			client = new Client(connectionString);
			await client.connect();
			connected = true;
			break;
		} catch (error) {
			lastError = error;
			await client?.end().catch(() => {});
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);

	if (!connected) {
		throw lastError;
	}

	db = drizzle({ client });
	postgresDb = drizzlePostgres(connectionString);
	await postgresDb.execute(sql`select 1`);
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await postgresDb?.$client.end().catch(console.error);
});

beforeEach(async () => {
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${nullableRows}`);
	await db.execute(sql`
		create table ${users} (
			id integer primary key,
			name text not null,
			note text,
			updated_at timestamptz not null
		)
	`);
});

test('insert and upsert return the correct OLD/NEW row versions', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	const inserted = await db.insert(users).values({
		id: 1,
		name: 'Jane',
		note: null,
		updatedAt: insertedAt,
	}).returning({ old: true, new: true });

	expect(inserted).toEqual([{
		old: null,
		new: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
	}]);

	const updatedAt = new Date('2026-01-02T00:00:00Z');
	const upserted = await db.insert(users).values({
		id: 1,
		name: 'Janet',
		note: 'updated',
		updatedAt,
	}).onConflictDoUpdate({
		target: users.id,
		set: { name: 'Janet', note: 'updated', updatedAt },
	}).returning({ old: true, new: true });

	expect(upserted).toEqual([{
		old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
		new: { id: 1, name: 'Janet', note: 'updated', updatedAt },
	}]);
});

test('maps mixed insert and conflict rows independently', async () => {
	const originalAt = new Date('2026-01-01T00:00:00Z');
	await db.insert(users).values({ id: 1, name: 'Jane', note: null, updatedAt: originalAt });

	const changedAt = new Date('2026-01-02T00:00:00Z');
	const result = await db.insert(users).values([
		{ id: 1, name: 'Janet', note: 'updated', updatedAt: changedAt },
		{ id: 2, name: 'John', note: null, updatedAt: changedAt },
	]).onConflictDoUpdate({
		target: users.id,
		set: {
			name: sql`excluded.name`,
			note: sql`excluded.note`,
			updatedAt: sql`excluded.updated_at`,
		},
	}).returning({ old: true, new: true });

	expect(result).toEqual([
		{
			old: { id: 1, name: 'Jane', note: null, updatedAt: originalAt },
			new: { id: 1, name: 'Janet', note: 'updated', updatedAt: changedAt },
		},
		{
			old: null,
			new: { id: 2, name: 'John', note: null, updatedAt: changedAt },
		},
	]);
});

test('update returns decoded OLD/NEW row versions', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	await db.insert(users).values({ id: 1, name: 'Jane', note: null, updatedAt: insertedAt });

	const updatedAt = new Date('2026-01-02T00:00:00Z');
	const result = await db.update(users)
		.set({ name: 'Janet', updatedAt })
		.where(eq(users.id, 1))
		.returning({ old: true, new: true });

	expect(result).toEqual([{
		old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
		new: { id: 1, name: 'Janet', note: null, updatedAt },
	}]);
});

test('delete returns OLD and a null NEW row', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	await db.insert(users).values({ id: 1, name: 'Jane', note: null, updatedAt: insertedAt });

	const result = await db.delete(users).where(eq(users.id, 1)).returning({ old: true, new: true });

	expect(result).toEqual([{
		old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
		new: null,
	}]);
});

test('returns only the requested row version', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	const inserted = await db.insert(users).values({
		id: 1,
		name: 'Jane',
		note: null,
		updatedAt: insertedAt,
	}).returning({ new: true });

	expect(inserted).toEqual([{
		new: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
	}]);

	const previous = await db.update(users)
		.set({ name: 'Janet' })
		.where(eq(users.id, 1))
		.returning({ old: true });

	expect(previous).toEqual([{
		old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
	}]);
});

test('works with prepared mutation queries', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	await db.insert(users).values({ id: 1, name: 'Jane', note: null, updatedAt: insertedAt });

	const prepared = db.update(users)
		.set({ name: 'Janet' })
		.where(eq(users.id, 1))
		.returning({ old: true, new: true })
		.prepare('pg18_returning_old_new');

	const result = await prepared.execute();

	expect(result).toEqual([{
		old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
		new: { id: 1, name: 'Janet', note: null, updatedAt: insertedAt },
	}]);
});

test('works with the postgres driver-side shape mapper', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	const result = await postgresDb.insert(users).values({
		id: 1,
		name: 'Jane',
		note: null,
		updatedAt: insertedAt,
	}).returning({ old: true, new: true });

	expect(result).toEqual([{
		old: null,
		new: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
	}]);
});

test('distinguishes a present all-null row from an unavailable row version', async () => {
	await db.execute(sql`create table ${nullableRows} (note text)`);

	const result = await db.insert(nullableRows).values({ note: null }).returning({ old: true, new: true });

	expect(result).toEqual([{
		old: null,
		new: { note: null },
	}]);

	const updated = await db.update(nullableRows).set({ note: null }).returning({ old: true, new: true });
	expect(updated).toEqual([{ old: { note: null }, new: { note: null } }]);

	const deleted = await db.delete(nullableRows).returning({ old: true, new: true });
	expect(deleted).toEqual([{ old: { note: null }, new: null }]);
});

test('works with column-level privileges without access to system columns', async () => {
	const role = sql.identifier(`pg18_returning_${randomUUID().replaceAll('-', '')}`);
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	await db.execute(sql`create role ${role}`);
	try {
		await db.execute(sql`grant usage on schema public to ${role}`);
		await db.execute(sql`
			grant select(id, name, note, updated_at), insert(id, name, note, updated_at),
			update(name, note, updated_at), delete on ${users} to ${role}
		`);
		await db.execute(sql`set role ${role}`);

		const ordinary = await db.insert(users).values({
			id: 1,
			name: 'Jane',
			note: null,
			updatedAt: insertedAt,
		}).returning();
		expect(ordinary).toEqual([{ id: 1, name: 'Jane', note: null, updatedAt: insertedAt }]);

		const updated = await db.update(users).set({ name: 'Janet' }).returning({ old: true, new: true });
		expect(updated).toEqual([{
			old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt },
			new: { id: 1, name: 'Janet', note: null, updatedAt: insertedAt },
		}]);

		const inserted = await db.insert(users).values({
			id: 2,
			name: 'John',
			note: null,
			updatedAt: insertedAt,
		}).returning({ old: true, new: true });
		expect(inserted).toEqual([{
			old: null,
			new: { id: 2, name: 'John', note: null, updatedAt: insertedAt },
		}]);

		const deleted = await db.delete(users).where(eq(users.id, 2)).returning({ old: true, new: true });
		expect(deleted).toEqual([{
			old: { id: 2, name: 'John', note: null, updatedAt: insertedAt },
			new: null,
		}]);
	} finally {
		await db.execute(sql`reset role`);
		await db.execute(sql`drop owned by ${role}`);
		await db.execute(sql`drop role ${role}`);
	}
});

test('omits undefined optional row versions from mutation results', async () => {
	const insertedAt = new Date('2026-01-01T00:00:00Z');
	const inserted = await db.insert(users).values({
		id: 1,
		name: 'Jane',
		note: null,
		updatedAt: insertedAt,
	}).returning({ old: undefined, new: true });
	expect(inserted).toEqual([{ new: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt } }]);

	const updated = await db.update(users).set({ name: 'Janet' }).returning({ old: true, new: undefined });
	expect(updated).toEqual([{ old: { id: 1, name: 'Jane', note: null, updatedAt: insertedAt } }]);

	const deleted = await db.delete(users).returning({ old: undefined, new: true });
	expect(deleted).toEqual([{ new: null }]);
});
