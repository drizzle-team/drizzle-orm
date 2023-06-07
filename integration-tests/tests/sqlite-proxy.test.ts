import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import type BetterSqlite3 from 'better-sqlite3';
import Database from 'better-sqlite3';
import { asc, eq, Name, placeholder, sql } from 'drizzle-orm';
import { alias, blob, integer, primaryKey, sqliteTable, sqliteTableCreator, text } from 'drizzle-orm/sqlite-core';
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { drizzle as proxyDrizzle } from 'drizzle-orm/sqlite-proxy';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';

class ServerSimulator {
	constructor(private db: BetterSqlite3.Database) {}

	async query(sql: string, params: any[], method: string) {
		if (method === 'run') {
			try {
				const result = this.db.prepare(sql).run(params);
				return { data: result as any };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'all' || method === 'values') {
			try {
				const rows = this.db.prepare(sql).raw().all(params);
				return { data: rows };
			} catch (e: any) {
				return { error: e.message };
			}
		} else if (method === 'get') {
			try {
				const row = this.db.prepare(sql).raw().get(params);
				return { data: row };
			} catch (e: any) {
				return { error: e.message };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	migrations(queries: string[]) {
		this.db.exec('BEGIN');
		try {
			for (const query of queries) {
				this.db.exec(query);
			}
			this.db.exec('COMMIT');
		} catch {
			this.db.exec('ROLLBACK');
		}

		return {};
	}
}

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
	json: blob('json', { mode: 'json' }).$type<string[]>(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().default(sql`strftime('%s', 'now')`),
});

const usersMigratorTable = sqliteTable('users12', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

const anotherUsersMigratorTable = sqliteTable('another_users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

const pkExampleTable = sqliteTable('pk_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => ({
	compositePk: primaryKey(table.id, table.name),
}));

const bigIntExample = sqliteTable('big_int_example', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	bigInt: blob('big_int', { mode: 'bigint' }).notNull(),
});

interface Context {
	db: SqliteRemoteDatabase;
	client: Database.Database;
	serverSimulator: ServerSimulator;
}

const test = anyTest as TestFn<Context>;

test.before((t) => {
	const ctx = t.context;
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	ctx.client = new Database(dbPath);

	ctx.serverSimulator = new ServerSimulator(ctx.client);

	ctx.db = proxyDrizzle(async (sql, params, method) => {
		try {
			const rows = await ctx.serverSimulator.query(sql, params, method);

			if (rows.error !== undefined) {
				throw new Error(rows.error);
			}

			return { rows: rows.data };
		} catch (e: any) {
			console.error('Error from sqlite proxy server:', e.response.data);
			throw e;
		}
	});
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.run(sql`drop table if exists ${usersTable}`);
	await ctx.db.run(sql`drop table if exists ${pkExampleTable}`);
	await ctx.db.run(sql`drop table if exists ${bigIntExample}`);

	await ctx.db.run(sql`
		create table ${usersTable} (
			id integer primary key,
			name text not null,
			verified integer not null default 0,
			json blob,
			created_at integer not null default (strftime('%s', 'now'))
		)
	`);
	await ctx.db.run(sql`
		create table ${pkExampleTable} (
			id integer not null,
			name text not null,
			email text not null,
			primary key (id, name)
		)
	`);
	await ctx.db.run(sql`
		create table ${bigIntExample} (
			id integer primary key,
			name text not null,
			big_int blob not null
		 )
	`);
});

test.serial('insert bigint values', async (t) => {
	const { db } = t.context;

	await db.insert(bigIntExample).values({ name: 'one', bigInt: BigInt('0') }).run();
	await db.insert(bigIntExample).values({ name: 'two', bigInt: BigInt('127') }).run();
	await db.insert(bigIntExample).values({ name: 'three', bigInt: BigInt('32767') }).run();
	await db.insert(bigIntExample).values({ name: 'four', bigInt: BigInt('1234567890') }).run();
	await db.insert(bigIntExample).values({ name: 'five', bigInt: BigInt('12345678900987654321') }).run();

	const result = await db.select().from(bigIntExample).all();
	t.deepEqual(result, [
		{ id: 1, name: 'one', bigInt: BigInt('0') },
		{ id: 2, name: 'two', bigInt: BigInt('127') },
		{ id: 3, name: 'three', bigInt: BigInt('32767') },
		{ id: 4, name: 'four', bigInt: BigInt('1234567890') },
		{ id: 5, name: 'five', bigInt: BigInt('12345678900987654321') },
	]);
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select().from(usersTable).all();

	t.assert(result[0]!.createdAt instanceof Date);
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select({ name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ name: 'John' }]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql + get()', async (t) => {
	const { db } = t.context;

	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).get();

	t.deepEqual(users, { name: 'JOHN' });
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('update returning sql + get()', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).get();

	t.deepEqual(users, { name: 'JANE' });
});

test.serial('insert with auto increment', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'George' },
		{ name: 'Austin' },
	]).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'George' },
		{ id: 4, name: 'Austin' },
	]);
});

test.serial('insert with default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true }).run();
	const result = await db.select().from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning all fields + get()', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().get();

	t.assert(users.createdAt instanceof Date);
	t.assert(Math.abs(users.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, { id: 1, name: 'Jane', verified: false, json: null, createdAt: users.createdAt });
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, [{ id: 1, name: 'John', verified: false, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('delete with returning all fields + get()', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().get();

	t.assert(users!.createdAt instanceof Date);
	t.assert(Math.abs(users!.createdAt.getTime() - now) < 5000);
	t.deepEqual(users, { id: 1, name: 'John', verified: false, json: null, createdAt: users!.createdAt });
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('delete with returning partial + get()', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).get();

	t.deepEqual(users, { id: 1, name: 'John' });
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.insert(usersTable).values({ name: 'Jane' }).run();
	const result2 = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).run();
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
	}).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]).run();
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
		verified: usersTable.verified,
	}).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	])
		.returning({
			id: usersTable.id,
			name: usersTable.name,
			json: usersTable.json,
			verified: usersTable.verified,
		})
		.all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: false },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', json: null, verified: false },
		{ id: 4, name: 'Austin', json: null, verified: true },
	]);
});

test.serial('partial join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = await db
		.select({
			user: {
				id: usersTable.id,
				name: usersTable.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		}).from(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10))
		.all();

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = await db
		.select().from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10))
		.all();

	t.deepEqual(result, [{
		users: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);

	await db.run(sql`drop table ${users}`);
});

test.serial('select from alias', async (t) => {
	const { db } = t.context;

	const sqliteTable = sqliteTableCreator((name) => `prefixed_${name}`);

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.run(sql`drop table if exists ${users}`);
	await db.run(sql`create table ${users} (id integer primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]).run();
	const result = await db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10))
		.all();

	t.deepEqual(result, [{
		user: {
			id: 10,
			name: 'Ivan',
		},
		customer: {
			id: 11,
			name: 'Hans',
		},
	}]);

	await db.run(sql`drop table ${users}`);
});

test.serial('insert with spaces', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).run();
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).all();

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const statement = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).prepare();
	const result = await statement.all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		await stmt.run({ name: `John ${i}` });
	}

	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John 0', verified: true },
		{ id: 2, name: 'John 1', verified: true },
		{ id: 3, name: 'John 2', verified: true },
		{ id: 4, name: 'John 3', verified: true },
		{ id: 5, name: 'John 4', verified: true },
		{ id: 6, name: 'John 5', verified: true },
		{ id: 7, name: 'John 6', verified: true },
		{ id: 8, name: 'John 7', verified: true },
		{ id: 9, name: 'John 8', verified: true },
		{ id: 10, name: 'John 9', verified: true },
	]);
});

test.serial('prepared statement with placeholder in .where', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' }).run();
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare();
	const result = await stmt.all({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]).run();

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.serial('migrator', async (t) => {
	const { db, serverSimulator } = t.context;

	await db.run(sql`drop table if exists another_users`);
	await db.run(sql`drop table if exists users12`);
	await db.run(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, async (queries) => {
		try {
			serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: 'drizzle2/sqlite' });

	await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result = await db.select().from(usersMigratorTable).all();

	await db.insert(anotherUsersMigratorTable).values({ name: 'John', email: 'email' }).run();
	const result2 = await db.select().from(usersMigratorTable).all();

	t.deepEqual(result, [{ id: 1, name: 'John', email: 'email' }]);
	t.deepEqual(result2, [{ id: 1, name: 'John', email: 'email' }]);

	await db.run(sql`drop table another_users`);
	await db.run(sql`drop table users12`);
	await db.run(sql`drop table __drizzle_migrations`);
});

test.serial('insert via db.run + select via db.all', async (t) => {
	const { db } = t.context;

	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.all(sql`select id, name from "users"`);
	t.deepEqual(result, [[1, 'John']]);
});

test.serial('insert via db.get', async (t) => {
	const { db } = t.context;

	const inserted = await db.get(
		sql`insert into ${usersTable} (${new Name(
			usersTable.name.name,
		)}) values (${'John'}) returning ${usersTable.id}, ${usersTable.name}`,
	);
	t.deepEqual(inserted, [1, 'John']);
});

test.serial('insert via db.run + select via db.get', async (t) => {
	const { db } = t.context;

	await db.run(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.get(
		sql`select ${usersTable.id}, ${usersTable.name} from ${usersTable}`,
	);
	t.deepEqual(result, [1, 'John']);
});

test.serial('insert via db.get w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.get(
		db.insert(usersTable).values({ name: 'John' }).returning({ id: usersTable.id, name: usersTable.name }),
	);
	t.deepEqual(inserted, [1, 'John']);
});

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});

test.serial('insert with onConflict do nothing', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing()
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk', async (t) => {
	const { db } = t.context;

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing()
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do nothing using target', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoNothing({ target: usersTable.id })
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert with onConflict do nothing using composite pk as target', async (t) => {
	const { db } = t.context;

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john1@example.com' })
		.onConflictDoNothing({ target: [pkExampleTable.id, pkExampleTable.name] })
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john@example.com' }]);
});

test.serial('insert with onConflict do update', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ id: 1, name: 'John' }).run();

	await db
		.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onConflictDoUpdate({ target: usersTable.id, set: { name: 'John1' } })
		.run();

	const res = await db
		.select({ id: usersTable.id, name: usersTable.name })
		.from(usersTable)
		.where(eq(usersTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert with onConflict do update using composite pk', async (t) => {
	const { db } = t.context;

	await db.insert(pkExampleTable).values({ id: 1, name: 'John', email: 'john@example.com' }).run();

	await db
		.insert(pkExampleTable)
		.values({ id: 1, name: 'John', email: 'john@example.com' })
		.onConflictDoUpdate({ target: [pkExampleTable.id, pkExampleTable.name], set: { email: 'john1@example.com' } })
		.run();

	const res = await db
		.select({ id: pkExampleTable.id, name: pkExampleTable.name, email: pkExampleTable.email })
		.from(pkExampleTable)
		.where(eq(pkExampleTable.id, 1))
		.all();

	t.deepEqual(res, [{ id: 1, name: 'John', email: 'john1@example.com' }]);
});

test.serial('insert undefined', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	await t.notThrowsAsync(async () => await db.insert(users).values({ name: undefined }).run());

	await db.run(sql`drop table ${users}`);
});

test.serial('update undefined', async (t) => {
	const { db } = t.context;

	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});

	await db.run(sql`drop table if exists ${users}`);

	await db.run(
		sql`create table ${users} (id integer primary key, name text)`,
	);

	await t.throwsAsync(async () => await db.update(users).set({ name: undefined }).run());
	await t.notThrowsAsync(async () => await db.update(users).set({ id: 1, name: undefined }).run());

	await db.run(sql`drop table ${users}`);
});
