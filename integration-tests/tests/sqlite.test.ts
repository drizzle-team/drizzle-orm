import anyTest, { TestFn } from 'ava';
import Database from 'better-sqlite3';
import { DefaultLogger, sql } from 'drizzle-orm';
import { alias, blob, integer, SQLiteConnector, SQLiteDatabase, sqliteTable, text } from 'drizzle-orm-sqlite';
import { eq } from 'drizzle-orm/expressions';

const usersTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
	json: blob<string[]>('json', { mode: 'json' }),
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
	ctx.db.run(sql`create table ${usersTable} (id integer primary key, name text not null, json blob)`);
});

test.serial('update with returning', (t) => {
	const ctx = t.context;
	const { db } = ctx;

	db.insert(usersTable).values({ name: 'John' }).execute();
	const users = db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John')).returning().execute();
	t.deepEqual(users, [{ id: 1, name: 'Jane', json: null }]);
});

test.serial('delete with returning', (t) => {
	const ctx = t.context;
	const { db } = ctx;

	db.insert(usersTable).values({ name: 'John' }).execute();
	const users = db.delete(usersTable).where(eq(usersTable.name, 'John')).returning().execute();
	t.deepEqual(users, [{ id: 1, name: 'John', json: null }]);
});

test.serial('insert + select', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).execute();
	const result = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();
	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	db.insert(usersTable).values({ name: 'Jane' }).execute();
	const result2 = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();
	t.deepEqual(result2, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('json insert', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John', json: ['foo', 'bar'] }).execute();
	const result = db.select(usersTable).fields({
		id: usersTable.id,
		name: usersTable.name,
		json: usersTable.json,
	}).execute();

	t.deepEqual(result, [{ id: 1, name: 'John', json: ['foo', 'bar'] }]);
});

test.serial('insert many', (t) => {
	const { db } = t.context;

	db.insert(usersTable).values({ name: 'John' }).execute();
	db.insert(usersTable).values({ name: 'Jane' }).execute();
	const result = db.select(usersTable).fields({ id: usersTable.id, name: usersTable.name }).execute();
	t.deepEqual(result, [{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
});

test.serial('join with alias', (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	db.insert(usersTable).values({ id: 10, name: 'Ivan' }).execute();
	db.insert(usersTable).values({ id: 11, name: 'Hans' }).execute();
	const result = db
		.select(usersTable)
		.leftJoin(customerAlias, eq(customerAlias.id, 11))
		.where(eq(usersTable.id, 10))
		.execute();

	t.deepEqual(result, [{
		users: { id: 10, name: 'Ivan', json: null },
		customer: { id: 11, name: 'Hans', json: null },
	}]);
});

test.after.always((t) => {
	const ctx = t.context;
	ctx.client?.close();
});
