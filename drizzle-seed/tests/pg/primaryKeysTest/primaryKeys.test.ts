import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, primaryKey, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import { expect, test } from 'vitest';
import { seed } from '../../../src/index.ts';

// A table level `primaryKey({ columns })` never marks its columns as primary, so nothing about it reaches the
// generators on its own. These cover what drizzle-seed does make of one.

test('a composite primary key holding a column with no unique generator still seeds', async () => {
	const readings = pgTable('readings', {
		a: integer().notNull(),
		at: timestamp('at').notNull(),
		v: text(),
	}, (t) => [primaryKey({ columns: [t.a, t.at] })]);

	const db = drizzle({ client: new PGlite() });
	await db.execute(sql`create table readings (a integer not null, at timestamp not null, v text, primary key (a, at))`);
	await seed(db, { readings }, { count: 5 });
	expect((await db.select().from(readings)).length).toBe(5);
});

test('a composite primary key over a narrow domain column still seeds', async () => {
	const flags = pgTable('flags', {
		a: integer().notNull(),
		b: boolean().notNull(),
	}, (t) => [primaryKey({ columns: [t.a, t.b] })]);

	const db = drizzle({ client: new PGlite() });
	await db.execute(sql`create table flags (a integer not null, b boolean not null, primary key (a, b))`);
	await seed(db, { flags }, { count: 2 });
	expect((await db.select().from(flags)).length).toBe(2);
});

test('a generator the user gave isUnique false keeps it, even on a primary key', async () => {
	const users = pgTable('u2', { id: integer().primaryKey(), name: text() });
	const db = drizzle({ client: new PGlite() });
	await db.execute(sql`create table u2 (id integer primary key, name text)`);

	await seed(db, { users }, { count: 3 }).refine((f) => ({
		users: { columns: { id: f.int({ minValue: 100, maxValue: 200, isUnique: false }) } },
	}));
	expect((await db.select().from(users)).length).toBe(3);
});

test('a composite primary key sharing a column with a unique constraint gives way to it', async () => {
	const t = pgTable('ov', {
		a: integer().notNull(),
		b: integer().notNull(),
	}, (tb) => [primaryKey({ columns: [tb.a, tb.b] }), unique('ov_uq').on(tb.b)]);

	const db = drizzle({ client: new PGlite() });
	await db.execute(
		sql`create table ov (a integer not null, b integer not null, primary key (a, b), constraint ov_uq unique (b))`,
	);
	await seed(db, { t }, { count: 20 });

	const rows = await db.select().from(t);
	expect(rows.length).toBe(20);
	// only b must be distinct; a is free to repeat
	expect(new Set(rows.map((r) => r.b)).size).toBe(20);
});

test('a junction table keyed on its two foreign keys generates distinct pairs', async () => {
	const users = pgTable('ju', { id: integer().primaryKey(), name: text() });
	const groups = pgTable('jg', { id: integer().primaryKey(), name: text() });
	const usersToGroups = pgTable('jug', {
		userId: integer('user_id').notNull().references(() => users.id),
		groupId: integer('group_id').notNull().references(() => groups.id),
	}, (t) => [primaryKey({ columns: [t.userId, t.groupId] })]);

	const db = drizzle({ client: new PGlite() });
	await db.execute(sql`create table ju (id integer primary key, name text)`);
	await db.execute(sql`create table jg (id integer primary key, name text)`);
	await db.execute(
		sql`create table jug (user_id integer not null references ju(id), group_id integer not null references jg(id), primary key (user_id, group_id))`,
	);

	await seed(db, { users, groups, usersToGroups }, { count: 5 }).refine(() => ({
		usersToGroups: { count: 20 },
	}));

	const rows = await db.select().from(usersToGroups);
	expect(rows.length).toBe(20);
	expect(new Set(rows.map((r) => `${r.userId}-${r.groupId}`)).size).toBe(20);
});
