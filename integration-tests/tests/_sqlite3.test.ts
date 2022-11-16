import anyTest, { TestFn } from 'ava';
import { DefaultLogger, sql } from 'drizzle-orm';
import { alias, blob, integer, sqliteTable, text } from 'drizzle-orm-sqlite';
import { SQLite3Connector, SQLite3Database } from 'drizzle-orm-sqlite/async';
import { eq } from 'drizzle-orm/expressions';
import { placeholder } from 'drizzle-orm/sql';
import { Database } from 'sqlite3';

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	verified: integer('verified').notNull().default(0),
	json: blob<string[]>('json', { mode: 'json' }),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull().defaultNow(),
});

interface Context {
	db: SQLite3Database;
	client: Database;
}

const test = anyTest as TestFn<Context>;

test.before(async (t) => {
	const ctx = t.context;
	const dbPath = process.env['SQLITE_DB_PATH'] ?? ':memory:';

	ctx.client = await new Promise((resolve, reject) => {
		const client = new Database(dbPath, (err) => {
			if (err) {
				reject(err);
			} else {
				resolve(client);
			}
		});
	});

	ctx.db = new SQLite3Connector(ctx.client, { logger: new DefaultLogger() }).connect();
});

test.beforeEach(async (t) => {
	const ctx = t.context;
	await ctx.db.run(sql`drop table if exists ${usersTable}`);
	await ctx.db.run(sql`
		create table ${usersTable} (
			id integer primary key,
			name text not null,
			verified integer not null default 0,
			json blob,
			created_at integer not null default (floor((julianday('now') - 2440587.5)*86400000))
		)`);
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	const now = Date.now();

	await db.insert(usersTable).values({ name: 'John' }).execute();
	const result = await db.select(usersTable).execute();

	t.assert(result[0]!.createdAt instanceof Date);
	t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 100);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: result[0]!.createdAt }]);
});

// test.serial('select partial', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = await db.select(usersTable).fields({ name: usersTable.name }).execute();

// 	t.deepEqual(result, [{ name: 'John' }]);
// });

// test.serial('select sql', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.select(usersTable).fields({
// 		name: sql`upper(${usersTable.name})`,
// 	}).execute();

// 	t.deepEqual(users, [{ name: 'JOHN' }]);
// });

// test.serial('select typed sql', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.select(usersTable).fields({
// 		name: sql`upper(${usersTable.name})`.as<string>(),
// 	}).execute();

// 	t.deepEqual(users, [{ name: 'JOHN' }]);
// });

// test.serial('insert returning sql', async (t) => {
// 	const { db } = t.context;

// 	const users = await db.insert(usersTable).values({ name: 'John' }).returning({
// 		name: sql`upper(${usersTable.name})`,
// 	}).execute();

// 	t.deepEqual(users, [{ name: 'JOHN' }]);
// });

// test.serial('delete returning sql', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
// 		name: sql`upper(${usersTable.name})`,
// 	}).execute();

// 	t.deepEqual(users, [{ name: 'JOHN' }]);
// });

// test.serial('update returning sql', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
// 		name: sql`upper(${usersTable.name})`,
// 	}).execute();

// 	t.deepEqual(users, [{ name: 'JANE' }]);
// });

// test.serial('insert with auto increment', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Jane' },
// 		{ name: 'George' },
// 		{ name: 'Austin' },
// 	).execute();
// 	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John' },
// 		{ id: 2, name: 'Jane' },
// 		{ id: 3, name: 'George' },
// 		{ id: 4, name: 'Austin' },
// 	]);
// });

// test.serial('insert with default values', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = await db.select(usersTable).fields({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 0 }]);
// });

// test.serial('insert with overridden default values', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John', verified: 1 }).execute();
// 	const result = await db.select(usersTable).fields({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', verified: 1 }]);
// });

// test.serial('update with returning all fields', async (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning()
// 		.execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('update with returning partial', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
// });

// test.serial('delete with returning all fields', async (t) => {
// 	const { db } = t.context;

// 	const now = Date.now();

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().execute();

// 	t.assert(users[0]!.createdAt instanceof Date);
// 	t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 100);
// 	t.deepEqual(users, [{ id: 1, name: 'John', verified: 0, json: null, createdAt: users[0]!.createdAt }]);
// });

// test.serial('delete with returning partial', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John')).returning({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 	}).execute();

// 	t.deepEqual(users, [{ id: 1, name: 'John' }]);
// });

// test.serial('insert + select', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John' }]);

// 	await db.insert(usersTable).values({ name: 'Jane' }).execute();
// 	const result2 = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();

// 	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
// });

// test.serial('json insert', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).execute();
// 	const result = await db.select(usersTable).fields({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 	}).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
// });

// test.serial('insert many', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	).execute();
// 	const result = await db.select(usersTable).fields({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		json: usersTable.json,
// 		verified: usersTable.verified,
// 	}).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('insert many with returning', async (t) => {
// 	const { db } = t.context;

// 	const result = await db.insert(usersTable).values(
// 		{ name: 'John' },
// 		{ name: 'Bruce', json: ['foo', 'bar'] },
// 		{ name: 'Jane' },
// 		{ name: 'Austin', verified: 1 },
// 	)
// 		.returning({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 			json: usersTable.json,
// 			verified: usersTable.verified,
// 		})
// 		.execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John', json: null, verified: 0 },
// 		{ id: 2, name: 'Bruce', json: ['foo', 'bar'], verified: 0 },
// 		{ id: 3, name: 'Jane', json: null, verified: 0 },
// 		{ id: 4, name: 'Austin', json: null, verified: 1 },
// 	]);
// });

// test.serial('join with alias', async (t) => {
// 	const { db } = t.context;
// 	const customerAlias = alias(usersTable, 'customer');

// 	await db.insert(usersTable).values({ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }).execute();
// 	const result = db
// 		.select(usersTable)
// 		.fields({ id: usersTable.id, name: usersTable.name })
// 		.leftJoin(customerAlias, eq(customerAlias.id, 11), { id: customerAlias.id, name: customerAlias.name })
// 		.where(eq(usersTable.id, 10))
// 		.execute();

// 	t.deepEqual(result, [{
// 		users: { id: 10, name: 'Ivan' },
// 		customer: { id: 11, name: 'Hans' },
// 	}]);
// });

// test.serial('insert with spaces', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` }).execute();
// 	const result = await db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();

// 	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
// });

// test.serial('prepared statement', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const statement = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).prepare();
// 	const result = await statement.execute();

// 	t.deepEqual(result, [{ id: 1, name: 'John' }]);
// });

// test.serial('prepared statement reuse', async (t) => {
// 	const { db } = t.context;

// 	const stmt = db.insert(usersTable).values({
// 		verified: 1,
// 		name: placeholder('name'),
// 	}).prepare();

// 	for (let i = 0; i < 10; i++) {
// 		await stmt.execute({ name: `John ${i}` });
// 	}

// 	const result = await db.select(usersTable).fields({
// 		id: usersTable.id,
// 		name: usersTable.name,
// 		verified: usersTable.verified,
// 	}).execute();

// 	t.deepEqual(result, [
// 		{ id: 1, name: 'John 0', verified: 1 },
// 		{ id: 2, name: 'John 1', verified: 1 },
// 		{ id: 3, name: 'John 2', verified: 1 },
// 		{ id: 4, name: 'John 3', verified: 1 },
// 		{ id: 5, name: 'John 4', verified: 1 },
// 		{ id: 6, name: 'John 5', verified: 1 },
// 		{ id: 7, name: 'John 6', verified: 1 },
// 		{ id: 8, name: 'John 7', verified: 1 },
// 		{ id: 9, name: 'John 8', verified: 1 },
// 		{ id: 10, name: 'John 9', verified: 1 },
// 	]);
// });

// test.serial('prepared statement with placeholder in .where', async (t) => {
// 	const { db } = t.context;

// 	await db.insert(usersTable).values({ name: 'John' }).execute();
// 	const stmt = db.select(usersTable)
// 		.fields({
// 			id: usersTable.id,
// 			name: usersTable.name,
// 		})
// 		.where(eq(usersTable.id, placeholder('id')))
// 		.prepare();
// 	const result = await stmt.execute({ id: 1 });

// 	t.deepEqual(result, [{ id: 1, name: 'John' }]);
// });

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});
