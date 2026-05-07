import { RDSDataClient } from '@aws-sdk/client-rds-data';
import crypto from 'crypto';
import { expect, test } from 'vitest';

import { AwsPgDialect, drizzle } from '~/aws-data-api/pg';
import {
	boolean,
	customType,
	integer,
	json,
	PgDialect,
	pgEnum,
	pgSchema,
	pgTable,
	text,
	timestamp,
	uuid,
	varchar,
} from '~/pg-core';
import { eq, inArray } from '~/sql/expressions/conditions';
import { sql } from '~/sql/sql';

const db = drizzle(new RDSDataClient(), {
	database: '',
	resourceArn: '',
	secretArn: '',
});

test('type hints - case #1', () => {
	const t = pgTable('t', {
		id: varchar('id', { length: 255 }).primaryKey(),
		workspaceID: varchar('workspace_id', { length: 255 }).notNull(),
		description: text('description').notNull(),
		enrichment: json('enrichment').notNull(),
		category: text('category'),
		tags: text('tags').array().notNull(),
		counterpartyName: text('counterparty_name'),
		timePlaced: timestamp('time_placed').notNull(),
		timeSynced: timestamp('time_synced').notNull(),
	});

	const q = db.insert(t).values({
		id: 'id',
		tags: [],
		workspaceID: 'workspaceID',
		enrichment: {},
		category: 'category',
		description: 'description',
		timePlaced: new Date(),
		timeSynced: sql<string>`CURRENT_TIMESTAMP(6)`,
		counterpartyName: 'counterpartyName',
	});

	const query = new PgDialect().sqlToQuery(q.getSQL());

	expect(query.typings).toEqual(['none', 'none', 'none', 'json', 'none', 'none', 'none', 'timestamp']);
});

test('AwsPgDialect wraps enum params in WHERE with explicit cast', () => {
	const status = pgEnum('agent_status', ['idle', 'running', 'stopped']);
	const tasks = pgTable('tasks', {
		id: uuid('id').primaryKey(),
		status: status('status').notNull(),
	});

	const q = db.select().from(tasks).where(eq(tasks.status, 'running'));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	// enums have no typeHint in AWS Data API — must be cast explicitly
	expect(query.sql).toContain(`cast(:1 as "agent_status")`);
});

test('AwsPgDialect wraps schema-qualified enum with quoted schema', () => {
	const app = pgSchema('app');
	const status = app.enum('agent_status', ['idle', 'running']);
	const tasks = app.table('tasks', {
		id: uuid('id').primaryKey(),
		status: status('status').notNull(),
	});

	const q = db.update(tasks).set({ status: 'idle' }).where(eq(tasks.id, '00000000-0000-0000-0000-000000000000'));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`cast(:1 as "app"."agent_status")`);
	expect(query.sql).toContain(`cast(:2 as uuid)`);
});

test('AwsPgDialect wraps array params with element type', () => {
	const t = pgTable('t', {
		id: uuid('id').primaryKey(),
		tags: text('tags').array().notNull(),
	});

	const q = db.insert(t).values({
		id: '00000000-0000-0000-0000-000000000000',
		tags: ['a', 'b'],
	});
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toMatch(/cast\(:\d+ as text\[\]\)/);
});

test('AwsPgDialect wraps INSERT params: enum + uuid + array + customType', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const ulid = customType<{ data: string; driverData: string }>({
		dataType: () => 'citext',
		toDriver: (v) => v,
	});
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
		tags: text('tags').array().notNull(),
		handle: ulid('handle').notNull(),
		name: text('name').notNull(),
	});

	const q = db.insert(users).values({
		id: '00000000-0000-0000-0000-000000000000',
		role: 'admin',
		tags: ['x', 'y'],
		handle: 'abc',
		name: 'Ada',
	});
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	// Every column-bound INSERT VALUES param is wrapped in cast()
	expect(query.sql).toMatch(/cast\(:\d+ as uuid\)/);
	expect(query.sql).toMatch(/cast\(:\d+ as "user_role"\)/);
	expect(query.sql).toMatch(/cast\(:\d+ as text\[\]\)/);
	expect(query.sql).toMatch(/cast\(:\d+ as citext\)/);
	expect(query.sql).toMatch(/cast\(:\d+ as text\)/);
});

test('AwsPgDialect wraps SELECT/WHERE params for enum, uuid, varchar, numeric', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
		login: varchar('login', { length: 64 }).notNull(),
	});

	const q = db.select().from(users).where(
		sql`${eq(users.id, '00000000-0000-0000-0000-000000000000')} and ${eq(users.role, 'admin')} and ${
			eq(users.login, 'ada')
		}`,
	);
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`cast(:1 as uuid)`);
	expect(query.sql).toContain(`cast(:2 as "user_role")`);
	expect(query.sql).toContain(`cast(:3 as varchar(64))`);
});

test('AwsPgDialect wraps UPDATE/SET and WHERE simultaneously', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
	});

	const q = db.update(users).set({ role: 'member' }).where(eq(users.id, '00000000-0000-0000-0000-000000000000'));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`cast(:1 as "user_role")`);
	expect(query.sql).toContain(`cast(:2 as uuid)`);
});

test('AwsPgDialect wraps DELETE/WHERE enum predicate', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
	});

	const q = db.delete(users).where(eq(users.role, 'member'));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`cast(:1 as "user_role")`);
});

test('AwsPgDialect: bare sql.placeholder() does NOT auto-wrap (known limitation)', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
	});

	// `bindIfParam` (sql/expressions/conditions.ts) skips wrapping when the value is a
	// Placeholder, so the column encoder is never attached. The placeholder reaches
	// sql.ts as a bare `Placeholder` chunk, which doesn't carry the column it's bound to,
	// so wrapParam can't fire. Users hitting this with AWS Data API need to cast
	// explicitly: `eq(col, sql\`${sql.placeholder('x')}::user_role\`)`.
	const q = db.select().from(users).where(eq(users.role, sql.placeholder('role')));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).not.toContain('cast(:1');
	expect(query.sql).toContain(`"users"."role" = :1`);
});

test('AwsPgDialect wraps every param in IN (...) clauses with the column type', () => {
	const role = pgEnum('user_role', ['admin', 'member', 'guest']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
	});

	const q = db.select().from(users).where(inArray(users.role, ['admin', 'member', 'guest']));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	// All three params must be cast — partial casting would still hit the error
	expect(query.sql).toContain(`cast(:1 as "user_role")`);
	expect(query.sql).toContain(`cast(:2 as "user_role")`);
	expect(query.sql).toContain(`cast(:3 as "user_role")`);
});

test('AwsPgDialect wraps NULL values bound to column with cast(NULL as <type>)', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role'),
	});

	// `cast(NULL as <enum>)` is valid Postgres and required for AWS Data API since
	// there's no implicit text→enum cast even for NULL values
	const q = db.insert(users).values({ id: '00000000-0000-0000-0000-000000000000', role: null });
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`cast(:1 as uuid)`);
	expect(query.sql).toContain(`cast(:2 as "user_role")`);
});

test('AwsPgDialect leaves user-written explicit ::cast literals untouched', () => {
	const tasks = pgTable('tasks', { id: uuid('id').primaryKey() });

	// User wrote their own ::uuid cast on a primitive (not bound to a column)
	const q = db.select().from(tasks).where(sql`${tasks.id} = ${'00000000-0000-0000-0000-000000000000'}::uuid`);
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	// :1 is a primitive without a column encoder → no auto-wrap, the user's ::uuid stands
	expect(query.sql).toContain(`= :1::uuid`);
	expect(query.sql).not.toContain(`cast(:1`);
});

test('AwsPgDialect: explicit cast on left side disables auto-wrap on right', () => {
	const role = pgEnum('user_role', ['admin', 'member']);
	const users = pgTable('users', {
		id: uuid('id').primaryKey(),
		role: role('role').notNull(),
	});

	// User wraps the column with a manual ::text cast — eq's right side is bound
	// to a SQL fragment (not a column), so it stays a plain :1 with no wrapper
	const q = db.select().from(users).where(eq(sql`${users.role}::text`, 'admin'));
	const query = new AwsPgDialect().sqlToQuery(q.getSQL());

	expect(query.sql).toContain(`"users"."role"::text = :1`);
	expect(query.sql).not.toContain(`cast(:1`);
});

test('AwsPgDialect leaves no-encoder sql.raw fragments unchanged', () => {
	const q = sql`select 1 where ${sql.raw('true')}`;
	const query = new AwsPgDialect().sqlToQuery(q);
	expect(query.sql).not.toContain('cast(');
});

test('PgDialect wrapParam is a no-op (default)', () => {
	const status = pgEnum('agent_status', ['idle', 'running']);
	const tasks = pgTable('tasks', {
		id: uuid('id').primaryKey(),
		status: status('status').notNull(),
		ready: boolean('ready').notNull(),
		count: integer('count').notNull(),
	});

	const q = db.select().from(tasks).where(eq(tasks.status, 'running'));
	const query = new PgDialect().sqlToQuery(q.getSQL());

	// non-AWS dialects must not insert casts — pg/postgres-js negotiate parameter types
	expect(query.sql).not.toContain('cast(');
});

test('type hints - case #2', () => {
	const prefixedUlid = <Prefix extends string, PrefixedUlid = `${Prefix}_${string}`>(
		name: string,
		opts: { prefix: Prefix },
	) =>
		customType<{ data: PrefixedUlid; driverData: string }>({
			dataType: () => 'uuid',
			toDriver: (value) => {
				return value as string;
			},
			fromDriver: (value) => {
				return `${opts.prefix}_${value}` as PrefixedUlid;
			},
		})(name);

	const calendars = pgTable('calendars', {
		id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
		orgMembershipId: prefixedUlid('om_id', { prefix: 'om' }).notNull(),
		platform: text('platform').notNull(),
		externalId: text('external_id').notNull(),
		externalData: json('external_data').notNull(),
		updatedAt: timestamp('updated_at').notNull().default(sql`now()`),
		createdAt: timestamp('created_at').notNull().default(sql`now()`),
	});

	const q = db
		.insert(calendars)
		.values({
			id: crypto.randomUUID(),
			orgMembershipId: 'om_id',
			platform: 'platform',
			externalId: 'externalId',
			externalData: {},
		})
		.returning();

	const query = new PgDialect().sqlToQuery(q.getSQL());

	expect(query.typings).toEqual(['uuid', 'none', 'none', 'none', 'json']);
});
