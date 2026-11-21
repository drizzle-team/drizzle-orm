import Docker from 'dockerode';
import { eq, relations, sql, TransactionRollbackError } from 'drizzle-orm';
import {
	bigint,
	blob,
	boolean,
	char,
	date,
	doublePrecision,
	firebirdTable,
	firebirdView,
	integer,
	numeric,
	real,
	smallint,
	text,
	time,
	timestamp,
	varchar,
} from 'drizzle-orm/firebird-core';
import type { NodeFirebirdDatabase } from 'drizzle-orm/node-firebird';
import { drizzle } from 'drizzle-orm/node-firebird';
import { migrate } from 'drizzle-orm/node-firebird/migrator';
import getPort from 'get-port';
import Firebird from 'node-firebird';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';

const ENABLE_LOGGING = false;

const allTypes = firebirdTable('FB_ALL_TYPES', {
	id: integer('ID').primaryKey().generatedByDefaultAsIdentity(),
	smallValue: smallint('SMALL_VALUE'),
	intValue: integer('INT_VALUE'),
	bigNumber: bigint('BIG_NUMBER', { mode: 'number' }),
	bigValue: bigint('BIG_VALUE', { mode: 'bigint' }),
	numericText: numeric('NUMERIC_TEXT', { precision: 12, scale: 2 }),
	numericNumber: numeric('NUMERIC_NUMBER', { precision: 12, scale: 2, mode: 'number' }),
	numericBig: numeric('NUMERIC_BIG', { precision: 18, scale: 0, mode: 'bigint' }),
	realValue: real('REAL_VALUE'),
	doubleValue: doublePrecision('DOUBLE_VALUE'),
	booleanValue: boolean('BOOLEAN_VALUE'),
	charValue: char('CHAR_VALUE', { length: 5 }),
	varcharValue: varchar('VARCHAR_VALUE', { length: 40 }),
	textValue: text('TEXT_VALUE', { length: 1000 }),
	jsonValue: text('JSON_VALUE', { mode: 'json' }).$type<{ role: string; count: number }>(),
	dateText: date('DATE_TEXT'),
	dateValue: date('DATE_VALUE', { mode: 'date' }),
	timeValue: time('TIME_VALUE'),
	timestampValue: timestamp('TIMESTAMP_VALUE'),
	timestampText: timestamp('TIMESTAMP_TEXT', { mode: 'string' }),
	blobValue: blob('BLOB_VALUE', { mode: 'buffer' }),
	blobJson: blob('BLOB_JSON', { mode: 'json' }).$type<{ kind: string; enabled: boolean }>(),
	blobBigInt: blob('BLOB_BIGINT', { mode: 'bigint' }),
});

const users = firebirdTable('FB_USERS', {
	id: integer('ID').primaryKey(),
	name: varchar('NAME', { length: 80 }).notNull(),
	active: boolean('ACTIVE').notNull(),
});

const posts = firebirdTable('FB_POSTS', {
	id: integer('ID').primaryKey(),
	userId: integer('USER_ID').notNull().references(() => users.id, { onDelete: 'cascade' }),
	title: varchar('TITLE', { length: 80 }).notNull(),
});

const usersRelations = relations(users, ({ many }) => ({
	posts: many(posts),
}));

const postsRelations = relations(posts, ({ one }) => ({
	author: one(users, {
		fields: [posts.userId],
		references: [users.id],
	}),
}));

const userPostCounts = firebirdView('FB_USER_POST_COUNTS', {
	userId: integer('USER_ID'),
	name: varchar('NAME', { length: 80 }),
	postsCount: integer('POSTS_COUNT'),
}).existing();

const migratedUsers = firebirdTable('FB_MIGRATED_USERS', {
	id: integer('ID').primaryKey(),
	name: varchar('NAME', { length: 80 }).notNull(),
});

type FirebirdDb = NodeFirebirdDatabase<{
	allTypes: typeof allTypes;
	users: typeof users;
	posts: typeof posts;
	usersRelations: typeof usersRelations;
	postsRelations: typeof postsRelations;
	userPostCounts: typeof userPostCounts;
	migratedUsers: typeof migratedUsers;
}>;

let container: Docker.Container | undefined;
let client: Firebird.Database;
let db: FirebirdDb;

beforeAll(async () => {
	const connectionOptions = await createFirebirdConnectionOptions();
	client = await attachWithRetry(connectionOptions);
	db = drizzle(client, {
		logger: ENABLE_LOGGING,
		schema: {
			allTypes,
			users,
			posts,
			usersRelations,
			postsRelations,
			userPostCounts,
			migratedUsers,
		},
	});
});

afterAll(async () => {
	await detach(client);
	await container?.stop().catch(console.error);
});

beforeEach(async () => {
	await dropView('FB_USER_POST_COUNTS');
	await dropView('FB_MIGRATED_USER_NAMES');
	await dropTable('FB_POSTS');
	await dropTable('FB_ALL_TYPES');
	await dropTable('FB_USERS');
	await dropTable('FB_MIGRATED_USERS');
	await dropTable('__drizzle_migrations');
});

describe('firebird runtime', () => {
	test('maps Firebird column types through insert/select', async () => {
		await createAllTypesTable();

		const inserted = await db.insert(allTypes).values({
			smallValue: 7,
			intValue: 42,
			bigNumber: 9007199254740991,
			bigValue: 9007199254740993n,
			numericText: '1234.56',
			numericNumber: 9876.54,
			numericBig: 123456789012345678n,
			realValue: 1.25,
			doubleValue: 2.5,
			booleanValue: true,
			charValue: 'ABCDE',
			varcharValue: 'firebird',
			textValue: 'Drizzle Firebird text',
			jsonValue: { role: 'admin', count: 2 },
			dateText: '2026-04-08',
			dateValue: new Date('2026-04-08T00:00:00.000Z'),
			timeValue: '12:34:56.789',
			timestampValue: new Date('2026-04-08T12:34:56.789Z'),
			timestampText: '2026-04-08 12:34:56.789',
		}).returning({ id: allTypes.id });

		expect(inserted).toEqual([{ id: 1 }]);

		await db.update(allTypes).set({ blobValue: Buffer.from('firebird-blob') }).where(eq(allTypes.id, inserted[0]!.id));
		await db.update(allTypes).set({ blobJson: { kind: 'json-blob', enabled: true } }).where(eq(allTypes.id, inserted[0]!.id));
		await db.update(allTypes).set({ blobBigInt: 987654321098765432n }).where(eq(allTypes.id, inserted[0]!.id));

		const [row] = await db.select().from(allTypes).where(eq(allTypes.id, inserted[0]!.id));
		expect(row).toBeDefined();
		expect(row!.smallValue).toBe(7);
		expect(row!.intValue).toBe(42);
		expect(row!.bigNumber).toBe(9007199254740991);
		expect(row!.bigValue).toBe(9007199254740993n);
		expect(row!.numericText).toBe('1234.56');
		expect(row!.numericNumber).toBe(9876.54);
		expect(row!.numericBig).toBe(123456789012345678n);
		expect(row!.realValue).toBeCloseTo(1.25);
		expect(row!.doubleValue).toBe(2.5);
		expect(row!.booleanValue).toBe(true);
		expect((row!.charValue as string | null)?.trimEnd()).toBe('ABCDE');
		expect(row!.varcharValue).toBe('firebird');
		expect(row!.textValue).toBe('Drizzle Firebird text');
		expect(row!.jsonValue).toEqual({ role: 'admin', count: 2 });
		expect(row!.dateText).toBe('2026-04-08');
		expect((row!.dateValue as Date | null)?.toISOString().slice(0, 10)).toBe('2026-04-08');
		expect(row!.timeValue).toBe('12:34:56.7890');
		expect((row!.timestampValue as Date | null)?.toISOString()).toBe('2026-04-08T12:34:56.789Z');
		expect(row!.timestampText).toBe('2026-04-08 12:34:56.789');
		expect((row!.blobValue as Buffer | null)?.toString()).toBe('firebird-blob');
		expect(row!.blobJson).toEqual({ kind: 'json-blob', enabled: true });
		expect(row!.blobBigInt).toBe(987654321098765432n);
	});

	test('supports multi-row insert and upsert', async () => {
		await createUsersTables();

		await db.insert(users).values([
			{ id: 1, name: 'Ada', active: true },
			{ id: 2, name: 'Bob', active: false },
		]);

		const updated = await db.insert(users)
			.values({ id: 1, name: 'Ada updated', active: true })
			.onConflictDoUpdate({ target: users.id, set: { name: 'Ada updated' } })
			.returning({ id: users.id, name: users.name });

		const inserted = await db.insert(users)
			.values({ id: 3, name: 'Cora', active: true })
			.onConflictDoNothing({ target: users.id })
			.returning({ id: users.id });

		expect(updated).toEqual([{ id: 1, name: 'Ada updated' }]);
		expect(inserted).toEqual([{ id: 3 }]);
		expect(await db.select({ id: users.id, name: users.name }).from(users).orderBy(users.id)).toEqual([
			{ id: 1, name: 'Ada updated' },
			{ id: 2, name: 'Bob' },
			{ id: 3, name: 'Cora' },
		]);
	});

	test('supports relational queries with nested with', async () => {
		await createUsersTables();
		await seedUsersAndPosts();

		const result = await db.query.users.findMany({
			orderBy: (users, { asc }) => [asc(users.id)],
			with: {
				posts: {
					orderBy: (posts, { asc }) => [asc(posts.id)],
					with: {
						author: true,
					},
				},
			},
		});

		expect(result).toEqual([
			{
				id: 1,
				name: 'Ada',
				active: true,
				posts: [
					{ id: 10, userId: 1, title: 'A1', author: { id: 1, name: 'Ada', active: true } },
					{ id: 11, userId: 1, title: 'A2', author: { id: 1, name: 'Ada', active: true } },
				],
			},
			{ id: 2, name: 'Bob', active: false, posts: [] },
		]);
	});

	test('supports transactions and nested rollback', async () => {
		await createUsersTables();

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ id: 1, name: 'Ada', active: true });
			await tx.transaction(async (tx) => {
				await tx.insert(users).values({ id: 2, name: 'Nested', active: false });
				tx.rollback();
			}).catch((error) => {
				expect(error).toBeInstanceOf(TransactionRollbackError);
			});
		});

		expect(await db.select({ id: users.id, name: users.name }).from(users)).toEqual([{ id: 1, name: 'Ada' }]);
	});

	test('selects from Firebird views', async () => {
		await createUsersTables();
		await seedUsersAndPosts();
		await db.run(sql.raw(`
			create view FB_USER_POST_COUNTS as
			select
				u.ID as USER_ID,
				u.NAME as NAME,
				cast(count(p.ID) as integer) as POSTS_COUNT
			from FB_USERS u
			left join FB_POSTS p on p.USER_ID = u.ID
			group by u.ID, u.NAME
		`));

		expect(await db.select().from(userPostCounts).orderBy(userPostCounts.userId)).toEqual([
			{ userId: 1, name: 'Ada', postsCount: 2 },
			{ userId: 2, name: 'Bob', postsCount: 0 },
		]);
	});

	test('guards BLOB columns in returning', async () => {
		await createAllTypesTable();

		await expect(
			db.insert(allTypes).values({
				blobValue: Buffer.from('returning'),
			}).returning(),
		).rejects.toThrow('node-firebird does not support BLOB columns in RETURNING');
	});

	test('runs Firebird migrations', async () => {
		await migrate(db, { migrationsFolder: './drizzle2/firebird' });

		await db.insert(migratedUsers).values({ id: 1, name: 'Migrated' });

		expect(await db.select().from(migratedUsers)).toEqual([{ id: 1, name: 'Migrated' }]);
		expect(
			await db.all<{ NAME: string }>(
				sql`select trim(NAME) as NAME from FB_MIGRATED_USER_NAMES order by ID`,
			),
		).toEqual([{ NAME: 'Migrated' }]);
	});
});

async function createFirebirdConnectionOptions(): Promise<Firebird.Options> {
	const host = process.env['FIREBIRD_HOST'];
	const envPort = process.env['FIREBIRD_PORT'];
	const database = process.env['FIREBIRD_DATABASE'];
	const user = process.env['FIREBIRD_USER'];
	const password = process.env['FIREBIRD_PASSWORD'];

	if (host || envPort || database) {
		return {
			host: host?.trim() || '127.0.0.1',
			port: Number(envPort?.trim() || '3051'),
			database: database?.trim() || '/var/lib/firebird/data/BASEDADOS.fdb',
			user: user?.trim() || 'SYSDBA',
			password: password?.trim() || 'masterkey',
		};
	}

	const docker = new Docker();
	const image = process.env['FIREBIRD_TEST_IMAGE']?.trim() || 'ghcr.io/fdcastel/firebird:latest';
	const port = await getPort({ port: 3050 });

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (error) => error ? reject(error) : resolve(undefined))
	);

	container = await docker.createContainer({
		Image: image,
		Env: [
			'FIREBIRD_ROOT_PASSWORD=masterkey',
			'FIREBIRD_USER=SYSDBA',
			'FIREBIRD_PASSWORD=masterkey',
			'FIREBIRD_DATABASE=drizzle.fdb',
			'FIREBIRD_DATABASE_DEFAULT_CHARSET=UTF8',
		],
		name: `drizzle-integration-tests-firebird-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3050/tcp': [{ HostPort: String(port) }],
			},
		},
	});
	await container.start();

	return {
		host: '127.0.0.1',
		port,
		database: '/var/lib/firebird/data/drizzle.fdb',
		user: 'SYSDBA',
		password: 'masterkey',
	};
}

async function attachWithRetry(options: Firebird.Options): Promise<Firebird.Database> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			return await attach(options);
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	throw lastError;
}

function attach(options: Firebird.Options, timeoutMs = 2000): Promise<Firebird.Database> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			settled = true;
			reject(new Error(`Timed out connecting to Firebird after ${timeoutMs}ms`));
		}, timeoutMs);

		Firebird.attach(options, (error, database) => {
			if (settled) {
				database?.detach(() => undefined);
				return;
			}

			settled = true;
			clearTimeout(timeout);
			error ? reject(error) : resolve(database);
		});
	});
}

function detach(database: Firebird.Database | undefined): Promise<void> {
	return new Promise((resolve) => {
		if (!database) {
			resolve();
			return;
		}
		database.detach(() => resolve());
	});
}

async function dropTable(name: string) {
	await tryRun(`drop table "${name}"`);
}

async function dropView(name: string) {
	await tryRun(`drop view "${name}"`);
}

async function tryRun(query: string) {
	try {
		await db.run(sql.raw(query));
	} catch {
		// Firebird doesn't support IF EXISTS for all DDL used in these tests.
	}
}

async function createAllTypesTable() {
	await db.run(sql.raw(`
		create table FB_ALL_TYPES (
			ID integer generated by default as identity primary key,
			SMALL_VALUE smallint,
			INT_VALUE integer,
			BIG_NUMBER bigint,
			BIG_VALUE bigint,
			NUMERIC_TEXT numeric(12, 2),
			NUMERIC_NUMBER numeric(12, 2),
			NUMERIC_BIG numeric(18, 0),
			REAL_VALUE real,
			DOUBLE_VALUE double precision,
			BOOLEAN_VALUE boolean,
			CHAR_VALUE char(5),
			VARCHAR_VALUE varchar(40),
			TEXT_VALUE varchar(1000),
			JSON_VALUE varchar(8191),
			DATE_TEXT date,
			DATE_VALUE date,
			TIME_VALUE time,
			TIMESTAMP_VALUE timestamp,
			TIMESTAMP_TEXT timestamp,
			BLOB_VALUE blob sub_type binary,
			BLOB_JSON blob sub_type text,
			BLOB_BIGINT blob sub_type text
		)
	`));
}

async function createUsersTables() {
	await db.run(sql.raw(`
		create table FB_USERS (
			ID integer primary key,
			NAME varchar(80) not null,
			ACTIVE boolean not null
		)
	`));
	await db.run(sql.raw(`
		create table FB_POSTS (
			ID integer primary key,
			USER_ID integer not null references FB_USERS(ID) on delete cascade,
			TITLE varchar(80) not null
		)
	`));
}

async function seedUsersAndPosts() {
	await db.insert(users).values([
		{ id: 1, name: 'Ada', active: true },
		{ id: 2, name: 'Bob', active: false },
	]);
	await db.insert(posts).values([
		{ id: 10, userId: 1, title: 'A1' },
		{ id: 11, userId: 1, title: 'A2' },
	]);
}
