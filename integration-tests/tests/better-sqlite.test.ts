import anyTest, { TestFn } from 'ava';
import Database from 'better-sqlite3';
import { DefaultLogger, sql } from 'drizzle-orm';
import { alias, blob, integer, SQLiteConnector, SQLiteDatabase, sqliteTable, text } from 'drizzle-orm-sqlite';
import { asc, eq } from 'drizzle-orm/expressions';
import { placeholder } from 'drizzle-orm/sql';

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	json: blob<string[]>('json', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

interface Context {
	db: SQLiteDatabase;
	client: Database.Database;
}

const test = anyTest as TestFn<Context>;

test.before((t) => {
	const ctx = t.context;
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	ctx.client = new Database(dbPath);
	ctx.db = new SQLiteConnector(ctx.client /* , { logger: new DefaultLogger() } */).connect();
});

test.beforeEach((t) => {
	const ctx = t.context;
	ctx.db.run(sql`drop table if exists ${usersTable}`);
	ctx.db.run(sql`
		create table ${usersTable} (
			id integer primary key,
			name text not null,
			verified integer not null default 0,
			json blob,
			created_at integer not null default (floor((julianday('now') - 2440587.5)*86400000))
		)`);
});

test.serial('select all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select(usersTable).all();

	t.assert(result[0]!.createdAt instanceof Date);
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select(usersTable).fields({ name: usersTable.name }).all();

	t.deepEqual(result, [{ name: 'John' }]);
});

test.serial('select sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.select(usersTable).fields({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.select(usersTable).fields({
		name: sql`upper(${usersTable.name})`.as<string>(),
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('insert returning sql', (t) => {
	const { db } = t.context;

	const users = db.insert(usersTable).values({ name: 'John' }).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('delete returning sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('update returning sql', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		name: sql`upper(${usersTable.name})`,
	}).all();

	t.deepEqual(users, [{ name: 'JANE' }]);
});

test.serial('insert with auto increment', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values(
		{ name: 'John' },
		{ name: 'Jane' },
		{ name: 'George' },
		{ name: 'Austin' },
	).run();
	const result = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
		{ id: 2, name: 'Jane' },
		{ id: 3, name: 'George' },
		{ id: 4, name: 'Austin' },
	]);
});

test.serial('insert with default values', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0 }]);
});

test.serial('insert with overridden default values', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John', verified: 1 }).run();
	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).all();

	t.deepEqual(result, [{ id: 1, name: 'John', verified: 1 }]);
});

test.serial('update with returning all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', (t) => {
	const { db } = t.context;

	const now = Date.now();

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().all();

	t.assert(users[0]!.createdAt instanceof Date);
	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(users, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
});

test.serial('delete with returning partial', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
		id: usersTable.id,
		name: usersTable.name,
	}).all();

	t.deepEqual(users, [{ id: 1, name: 'John' }]);
});

test.serial('insert + select', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const result = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	db.insert(usersTable).values({ name: 'Jane' }).run();
	const result2 = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).all();

	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).run();
	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
	}).all();

	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
});

test.serial('insert many', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values(
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: 1 },
	).run();
	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
		verified: usersTable.verified,
	}).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: 0 },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
		{ id: 3, name: 'Jane', json: null, verified: 0 },
		{ id: 4, name: 'Austin', json: null, verified: 1 },
	]);
});

test.serial('insert many with returning', (t) => {
	const { db } = t.context;

	const result = db.insert(usersTable).values(
		{ name: 'John' },
		{ name: 'Bruce', json: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: 1 },
	)
		.returning({
			id: usersTable.id,
			name: usersTable.name,
			json: usersTable.json,
			verified: usersTable.verified,
		})
		.all();

	t.deepEqual(result, [
		{ id: 1, name: 'John', json: null, verified: 0 },
		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
		{ id: 3, name: 'Jane', json: null, verified: 0 },
		{ id: 4, name: 'Austin', json: null, verified: 1 },
	]);
});

test.serial('partial join with alias', (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	db.insert(usersTable).values({ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }).run();
	const result = db
		.select(usersTable)
		.fields({
			user: {
				id: usersTable.id,
				name: usersTable.name,
			},
			customer: {
				id: customerAlias.id,
				name: customerAlias.name,
			},
		})
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10))
		.all();

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	db.insert(usersTable).values({ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }).run();
	const result = db
		.select(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10))
		.all();

	t.deepEqual(result, [{
		users: {
			id: 10,
			name: 'Ivan',
			verified: 0,
			json: null,
			createdAt: result[0]!.users.createdAt,
		},
		customer: {
			id: 11,
			name: 'Hans',
			verified: 0,
			json: null,
			createdAt: result[0]!.customer!.createdAt,
		},
	}]);
});

test.serial('insert with spaces', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).run();
	const result = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).all();

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const statement = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).prepare();
	const result = statement.all();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: 1,
		name: placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		stmt.run({ name: `John ${i}` });
	}

	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).all();

	t.deepEqual(result, [
		{ id: 1, name: 'John 0', verified: 1 },
		{ id: 2, name: 'John 1', verified: 1 },
		{ id: 3, name: 'John 2', verified: 1 },
		{ id: 4, name: 'John 3', verified: 1 },
		{ id: 5, name: 'John 4', verified: 1 },
		{ id: 6, name: 'John 5', verified: 1 },
		{ id: 7, name: 'John 6', verified: 1 },
		{ id: 8, name: 'John 7', verified: 1 },
		{ id: 9, name: 'John 8', verified: 1 },
		{ id: 10, name: 'John 9', verified: 1 },
	]);
});

test.serial('prepared statement with placeholder in .where', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).run();
	const stmt = db.select(usersTable)
		.fields({
			id: usersTable.id,
			name: usersTable.name,
		})
		.where(eq(usersTable.id, placeholder('id')))
		.prepare();
	const result = stmt.all({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }).run();

	const result = db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(usersTable.name)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }).run();

	const result = db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }, { name: 'John' }]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }).run();

	const result = db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(sql`${usersTable.name}`, usersTable.id)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }).run();

	const result = db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.all();

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }).run();

	const result = db.select(usersTable)
		.fields({ name: usersTable.name })
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1)
		.all();

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select(usersTable)
		.fields({ id: usersTable.id, name: usersTable.name })
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: 'select "id", "name" from "users" group by "users"."id", "users"."name"',
		params: [],
	});
});

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});
