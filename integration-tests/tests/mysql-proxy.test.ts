import 'dotenv/config';

import type { TestFn } from 'ava';
import anyTest from 'ava';
import Docker from 'dockerode';
import { asc, eq, gt, inArray, Name, placeholder, sql } from 'drizzle-orm';
import {
	alias,
	boolean,
	date,
	datetime,
	getTableConfig,
	getViewConfig,
	int,
	json,
	mysqlEnum,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	serial,
	text,
	time,
	timestamp,
	unique,
	uniqueIndex,
	uniqueKeyName,
	year,
} from 'drizzle-orm/mysql-core';
import { drizzle as proxyDrizzle } from 'drizzle-orm/mysql-proxy';
import type { MySqlRemoteDatabase } from 'drizzle-orm/mysql-proxy';
import { migrate } from 'drizzle-orm/mysql-proxy/migrator';
import getPort from 'get-port';
import * as mysql from 'mysql2/promise';
import { v4 as uuid } from 'uuid';
import { type Equal, Expect, toLocalDate } from './utils.ts';

const ENABLE_LOGGING = false;

const usersTable = mysqlTable('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const users2Table = mysqlTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesTable = mysqlTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const datesTable = mysqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { fsp: 1 }),
	datetime: datetime('datetime', { fsp: 2 }),
	datetimeAsString: datetime('datetime_as_string', { fsp: 2, mode: 'string' }),
	timestamp: timestamp('timestamp', { fsp: 3 }),
	timestampAsString: timestamp('timestamp_as_string', { fsp: 3, mode: 'string' }),
	year: year('year'),
});

const coursesTable = mysqlTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = mysqlTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = mysqlTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

const usersMigratorTable = mysqlTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => {
	return {
		name: uniqueIndex('').on(table.name).using('btree'),
	};
});

// eslint-disable-next-line drizzle/require-entity-kind
class ServerSimulator {
	constructor(private db: mysql.Connection) { }

	async query(sql: string, params: any[], method: 'all' | 'execute') {
		if (method === 'all') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					rowsAsArray: true,
					typeCast: function (field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
				});

				return { data: result[0] as any };
			} catch (e: any) {
				return { error: e };
			}
		} else if (method === 'execute') {
			try {
				const result = await this.db.query({
					sql,
					values: params,
					typeCast: function (field: any, next: any) {
						if (field.type === 'TIMESTAMP' || field.type === 'DATETIME' || field.type === 'DATE') {
							return field.string();
						}
						return next();
					},
				});

				return { data: result as any };
			} catch (e: any) {
				return { error: e };
			}
		} else {
			return { error: 'Unknown method value' };
		}
	}

	async migrations(queries: string[]) {
		await this.db.query('START TRANSACTION');
		try {
			for (const query of queries) {
				await this.db.query(query);
			}
			await this.db.query('COMMIT');
		} catch (e) {
			await this.db.query('ROLLBACK');
			throw e;
		}

		return {};
	}
}

interface Context {
	docker: Docker;
	mysqlContainer: Docker.Container;
	db: MySqlRemoteDatabase;
	client: mysql.Connection;
	serverSimulator: ServerSimulator;
}

const test = anyTest as TestFn<Context>;

async function createDockerDB(ctx: Context): Promise<string> {
	const docker = (ctx.docker = new Docker());
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	ctx.mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await ctx.mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

test.before(async (t) => {
	const ctx = t.context;
	const connectionString = process.env['MYSQL_CONNECTION_STRING'] ?? await createDockerDB(ctx);

	const sleep = 1000;
	let timeLeft = 20000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			ctx.client = await mysql.createConnection(connectionString);
			await ctx.client.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MySQL');
		await ctx.client?.end().catch(console.error);
		await ctx.mysqlContainer?.stop().catch(console.error);
		throw lastError;
	}

	ctx.serverSimulator = new ServerSimulator(ctx.client);

	ctx.db = proxyDrizzle(async (sql, params, method) => {
		try {
			const response = await ctx.serverSimulator.query(sql, params, method);

			if (response.error !== undefined) {
				throw response.error;
			}

			return { rows: response.data };
		} catch (e: any) {
			console.error('Error from mysql proxy server:', e.message);
			throw e;
		}
	}, { logger: ENABLE_LOGGING });
});

test.after.always(async (t) => {
	const ctx = t.context;
	await ctx.client?.end().catch(console.error);
	await ctx.mysqlContainer?.stop().catch(console.error);
});

test.beforeEach(async (t) => {
	try {
		const ctx = t.context;
		await ctx.db.execute(sql`drop table if exists \`userstest\``);
		await ctx.db.execute(sql`drop table if exists \`users2\``);
		await ctx.db.execute(sql`drop table if exists \`cities\``);

		await ctx.db.execute(
			sql`
				create table \`userstest\` (
				    \`id\` serial primary key,
				    \`name\` text not null,
				    \`verified\` boolean not null default false,
				    \`jsonb\` json,
				    \`created_at\` timestamp not null default now()
				)
			`,
		);

		await ctx.db.execute(
			sql`
				create table \`users2\` (
				    \`id\` serial primary key,
				    \`name\` text not null,
				    \`city_id\` int references \`cities\`(\`id\`)
				)
			`,
		);

		await ctx.db.execute(
			sql`
				create table \`cities\` (
				    \`id\` serial primary key,
				    \`name\` text not null
				)
			`,
		);
	} catch (error) {
		console.log('error', error);
		throw error;
	}
});

test.serial('table configs: unique third param', async (t) => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		state: text('state'),
	}, (t) => ({
		f: unique('custom_name').on(t.name, t.state),
		f1: unique('custom_name1').on(t.name, t.state),
	}));

	const tableConfig = getTableConfig(cities1Table);

	t.assert(tableConfig.uniqueConstraints.length === 2);

	t.assert(tableConfig.uniqueConstraints[0]?.name === 'custom_name');
	t.deepEqual(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name), ['name', 'state']);

	t.assert(tableConfig.uniqueConstraints[1]?.name, 'custom_name1');
	t.deepEqual(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name), ['name', 'state']);
});

test.serial('table configs: unique in column', async (t) => {
	const cities1Table = mysqlTable('cities1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull().unique(),
		state: text('state').unique('custom'),
		field: text('field').unique('custom_field'),
	});

	const tableConfig = getTableConfig(cities1Table);

	const columnName = tableConfig.columns.find((it) => it.name === 'name');
	t.assert(columnName?.uniqueName === uniqueKeyName(cities1Table, [columnName!.name]));
	t.assert(columnName?.isUnique);

	const columnState = tableConfig.columns.find((it) => it.name === 'state');
	t.assert(columnState?.uniqueName === 'custom');
	t.assert(columnState?.isUnique);

	const columnField = tableConfig.columns.find((it) => it.name === 'field');
	t.assert(columnField?.uniqueName === 'custom_field');
	t.assert(columnField?.isUnique);
});

test.serial('select all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);

	t.assert(result[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('select sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql`upper(${usersTable.name})`,
	}).from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select typed sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.select({
		name: sql<string>`upper(${usersTable.name})`,
	}).from(usersTable);

	t.deepEqual(users, [{ name: 'JOHN' }]);
});

test.serial('select distinct', async (t) => {
	const { db } = t.context;

	const usersDistinctTable = mysqlTable('users_distinct', {
		id: int('id').notNull(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${usersDistinctTable}`);
	await db.execute(sql`create table ${usersDistinctTable} (id int, name text)`);

	await db.insert(usersDistinctTable).values([
		{ id: 1, name: 'John' },
		{ id: 1, name: 'John' },
		{ id: 2, name: 'John' },
		{ id: 1, name: 'Jane' },
	]);
	const users = await db.selectDistinct().from(usersDistinctTable).orderBy(
		usersDistinctTable.id,
		usersDistinctTable.name,
	);

	await db.execute(sql`drop table ${usersDistinctTable}`);

	t.deepEqual(users, [{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
});

test.serial('insert returning sql', async (t) => {
	const { db } = t.context;

	const [result, _] = await db.insert(usersTable).values({ name: 'John' });

	t.deepEqual(result.insertId, 1);
});

test.serial('delete returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(users[0].affectedRows, 1);
});

test.serial('update returning sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	t.is(users[0].changedRows, 1);
});

test.serial('update with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

	t.is(updatedUsers[0].changedRows, 1);

	t.assert(users[0]!.createdAt instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	// not timezone based timestamp, thats why it should not work here
	// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
	t.deepEqual(users, [{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
});

test.serial('update with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

	const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(updatedUsers[0].changedRows, 1);

	t.deepEqual(users, [{ id: 1, name: 'Jane' }]);
});

test.serial('delete with returning all fields', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(deletedUser[0].affectedRows, 1);
});

test.serial('delete with returning partial', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

	t.is(deletedUser[0].affectedRows, 1);
});

test.serial('insert + select', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const result = await db.select().from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

	await db.insert(usersTable).values({ name: 'Jane' });
	const result2 = await db.select().from(usersTable);
	t.deepEqual(result2, [
		{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
		{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
	]);
});

test.serial('json insert', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
	}).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
});

test.serial('insert with overridden default values', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John', verified: true });
	const result = await db.select().from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
});

test.serial('insert many', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);
	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		jsonb: usersTable.jsonb,
		verified: usersTable.verified,
	}).from(usersTable);

	t.deepEqual(result, [
		{ id: 1, name: 'John', jsonb: null, verified: false },
		{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
		{ id: 3, name: 'Jane', jsonb: null, verified: false },
		{ id: 4, name: 'Austin', jsonb: null, verified: true },
	]);
});

test.serial('insert many with returning', async (t) => {
	const { db } = t.context;

	const result = await db.insert(usersTable).values([
		{ name: 'John' },
		{ name: 'Bruce', jsonb: ['foo', 'bar'] },
		{ name: 'Jane' },
		{ name: 'Austin', verified: true },
	]);

	t.is(result[0].affectedRows, 4);
});

test.serial('select with group by as field', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.name);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }]);
});

test.serial('select with group by as sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }]);
});

test.serial('$default function', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`orders\``);
	await db.execute(
		sql`
			create table \`orders\` (
				\`id\` serial primary key,
				\`region\` text not null,
				\`product\` text not null,
				\`amount\` int not null,
				\`quantity\` int not null
			)
		`,
	);

	await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
	const selectedOrder = await db.select().from(orders);

	t.deepEqual(selectedOrder, [{
		id: 1,
		amount: 1,
		quantity: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test.serial('$default with empty array', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`s_orders\``);
	await db.execute(
		sql`
			create table \`s_orders\` (
				\`id\` serial primary key,
				\`region\` text default ('Ukraine'),
				\`product\` text not null
			)
		`,
	);

	const users = mysqlTable('s_orders', {
		id: serial('id').primaryKey(),
		region: text('region').default('Ukraine'),
		product: text('product').$defaultFn(() => 'random_string'),
	});

	await db.insert(users).values({});
	const selectedOrder = await db.select().from(users);

	t.deepEqual(selectedOrder, [{
		id: 1,
		region: 'Ukraine',
		product: 'random_string',
	}]);
});

test.serial('select with group by as sql + column', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(sql`${usersTable.name}`, usersTable.id);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by as column + sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`);

	t.deepEqual(result, [{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
});

test.serial('select with group by complex query', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

	const result = await db.select({ name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, sql`${usersTable.name}`)
		.orderBy(asc(usersTable.name))
		.limit(1);

	t.deepEqual(result, [{ name: 'Jane' }]);
});

test.serial('build query', async (t) => {
	const { db } = t.context;

	const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
		.groupBy(usersTable.id, usersTable.name)
		.toSQL();

	t.deepEqual(query, {
		sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
		params: [],
	});
});

test.serial('Query check: Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	const query = db
		.insert(users)
		.values({})
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default)',
		params: [],
	});
});

test.serial('Query check: Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state').default('UA'),
	});

	const query = db
		.insert(users)
		.values([{}, {}])
		.toSQL();

	t.deepEqual(query, {
		sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default), (default, default, default)',
		params: [],
	});
});

test.serial('Insert all defaults in 1 row', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('empty_insert_single', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values({});

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }]);
});

test.serial('Insert all defaults in multiple rows', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('empty_insert_multiple', {
		id: serial('id').primaryKey(),
		name: text('name').default('Dan'),
		state: text('state'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial primary key, name text default ('Dan'), state text)`,
	);

	await db.insert(users).values([{}, {}]);

	const res = await db.select().from(users);

	t.deepEqual(res, [{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
});

test.serial('build query insert with onDuplicate', async (t) => {
	const { db } = t.context;

	const query = db.insert(usersTable)
		.values({ name: 'John', jsonb: ['foo', 'bar'] })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } })
		.toSQL();

	t.deepEqual(query, {
		sql:
			'insert into `userstest` (`id`, `name`, `verified`, `jsonb`, `created_at`) values (default, ?, default, ?, default) on duplicate key update `name` = ?',
		params: ['John', '["foo","bar"]', 'John1'],
	});
});

test.serial('insert with onDuplicate', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.values({ id: 1, name: 'John' })
		.onDuplicateKeyUpdate({ set: { name: 'John1' } });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(res, [{ id: 1, name: 'John1' }]);
});

test.serial('insert conflict', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await t.throwsAsync(
		() => db.insert(usersTable).values({ id: 1, name: 'John1' }),
		{
			code: 'ER_DUP_ENTRY',
			message: "Duplicate entry '1' for key 'userstest.PRIMARY'",
		},
	);
});

test.serial('insert conflict with ignore', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable)
		.values({ name: 'John' });

	await db.insert(usersTable)
		.ignore()
		.values({ id: 1, name: 'John1' });

	const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
		eq(usersTable.id, 1),
	);

	t.deepEqual(res, [{ id: 1, name: 'John' }]);
});

test.serial('insert sql', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`${'John'}` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('partial join with alias', async (t) => {
	const { db } = t.context;
	const customerAlias = alias(usersTable, 'customer');

	await db.insert(usersTable).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
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
		.where(eq(usersTable.id, 10));

	t.deepEqual(result, [{
		user: { id: 10, name: 'Ivan' },
		customer: { id: 11, name: 'Hans' },
	}]);
});

test.serial('full join with alias', async (t) => {
	const { db } = t.context;

	const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select().from(users)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(users.id, 10));

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

	await db.execute(sql`drop table ${users}`);
});

test.serial('select from alias', async (t) => {
	const { db } = t.context;

	const mysqlTable = mysqlTableCreator((name) => `prefixed_${name}`);

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial primary key, name text not null)`);

	const user = alias(users, 'user');
	const customers = alias(users, 'customer');

	await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
	const result = await db
		.select()
		.from(user)
		.leftJoin(customers, eq(customers.id, 11))
		.where(eq(user.id, 10));

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

	await db.execute(sql`drop table ${users}`);
});

test.serial('insert with spaces', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
	const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

	t.deepEqual(result, [{ id: 1, name: 'Jo   h     n' }]);
});

test.serial('prepared statement', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values({ name: 'John' });
	const statement = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.prepare();
	const result = await statement.execute();

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('prepared statement reuse', async (t) => {
	const { db } = t.context;

	const stmt = db.insert(usersTable).values({
		verified: true,
		name: placeholder('name'),
	}).prepare();

	for (let i = 0; i < 10; i++) {
		await stmt.execute({ name: `John ${i}` });
	}

	const result = await db.select({
		id: usersTable.id,
		name: usersTable.name,
		verified: usersTable.verified,
	}).from(usersTable);

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

	await db.insert(usersTable).values({ name: 'John' });
	const stmt = db.select({
		id: usersTable.id,
		name: usersTable.name,
	}).from(usersTable)
		.where(eq(usersTable.id, placeholder('id')))
		.prepare();
	const result = await stmt.execute({ id: 1 });

	t.deepEqual(result, [{ id: 1, name: 'John' }]);
});

test.serial('migrator', async (t) => {
	const { db, serverSimulator } = t.context;

	await db.execute(sql`drop table if exists userstest`);
	await db.execute(sql`drop table if exists users12`);
	await db.execute(sql`drop table if exists __drizzle_migrations`);

	await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: './drizzle2/mysql-proxy/first' });

	await t.notThrowsAsync(async () => {
		await db.insert(usersTable).values({ name: 'John' });
	});

	await t.throwsAsync(async () => {
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	}, {
		message: 'Table \'drizzle.users12\' doesn\'t exist'
	});

	await migrate(db, async (queries) => {
		try {
			await serverSimulator.migrations(queries);
		} catch (e) {
			console.error(e);
			throw new Error('Proxy server cannot run migrations');
		}
	}, { migrationsFolder: './drizzle2/mysql-proxy/second' });

	await t.notThrowsAsync(async () => {
		await db.insert(usersTable).values({ name: 'John' });
	});

	await t.notThrowsAsync(async () => {
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
	});

	await db.execute(sql`drop table userstest`);
	await db.execute(sql`drop table users12`);
	await db.execute(sql`drop table __drizzle_migrations`);
});

test.serial('insert via db.execute + select via db.execute', async (t) => {
	const { db } = t.context;

	await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

	const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
	t.deepEqual(result[0], [{ id: 1, name: 'John' }]);
});

test.serial('insert via db.execute w/ query builder', async (t) => {
	const { db } = t.context;

	const inserted = await db.execute(
		db.insert(usersTable).values({ name: 'John' }),
	);
	t.is(inserted[0].affectedRows, 1);
});

test.serial('insert + select all possible dates', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`datestable\``);
	await db.execute(
		sql`
			create table \`datestable\` (
				\`date\` date,
				\`date_as_string\` date,
				\`time\` time,
				\`datetime\` datetime,
				\`datetime_as_string\` datetime,
				\`timestamp\` timestamp(3),
				\`timestamp_as_string\` timestamp(3),
				\`year\` year
			)
		`,
	);

	const date = new Date('2022-11-11');
	const dateWithMilliseconds = new Date('2022-11-11 12:12:12.123');

	await db.insert(datesTable).values({
		date: date,
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: date,
		year: 22,
		datetimeAsString: '2022-11-11 12:12:12',
		timestamp: dateWithMilliseconds,
		timestampAsString: '2022-11-11 12:12:12.123',
	});

	const res = await db.select().from(datesTable);

	t.assert(res[0]?.date instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(res[0]?.datetime instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(typeof res[0]?.dateAsString === 'string');
	t.assert(typeof res[0]?.datetimeAsString === 'string');

	t.deepEqual(res, [{
		date: toLocalDate(new Date('2022-11-11')),
		dateAsString: '2022-11-11',
		time: '12:12:12',
		datetime: new Date('2022-11-11'),
		year: 2022,
		datetimeAsString: '2022-11-11 12:12:12',
		timestamp: new Date('2022-11-11 12:12:12.123'),
		timestampAsString: '2022-11-11 12:12:12.123',
	}]);

	await db.execute(sql`drop table if exists \`datestable\``);
});

const tableWithEnums = mysqlTable('enums_test_case', {
	id: serial('id').primaryKey(),
	enum1: mysqlEnum('enum1', ['a', 'b', 'c']).notNull(),
	enum2: mysqlEnum('enum2', ['a', 'b', 'c']).default('a'),
	enum3: mysqlEnum('enum3', ['a', 'b', 'c']).notNull().default('b'),
});

test.serial('Mysql enum test case #1', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`enums_test_case\``);

	await db.execute(sql`
		create table \`enums_test_case\` (
			\`id\` serial primary key,
			\`enum1\` ENUM('a', 'b', 'c') not null,
			\`enum2\` ENUM('a', 'b', 'c') default 'a',
			\`enum3\` ENUM('a', 'b', 'c') not null default 'b'
		)
	`);

	await db.insert(tableWithEnums).values([
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a' },
	]);

	const res = await db.select().from(tableWithEnums);

	await db.execute(sql`drop table \`enums_test_case\``);

	t.deepEqual(res, [
		{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
		{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
		{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
	]);
});

test.serial('left join (flat object fields)', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select({
		userId: users2Table.id,
		userName: users2Table.name,
		cityId: citiesTable.id,
		cityName: citiesTable.name,
	}).from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	t.deepEqual(res, [
		{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
		{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
	]);
});

test.serial('left join (grouped fields)', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select({
		id: users2Table.id,
		user: {
			name: users2Table.name,
			nameUpper: sql<string>`upper(${users2Table.name})`,
		},
		city: {
			id: citiesTable.id,
			name: citiesTable.name,
			nameUpper: sql<string>`upper(${citiesTable.name})`,
		},
	}).from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	t.deepEqual(res, [
		{
			id: 1,
			user: { name: 'John', nameUpper: 'JOHN' },
			city: { id: 1, name: 'Paris', nameUpper: 'PARIS' },
		},
		{
			id: 2,
			user: { name: 'Jane', nameUpper: 'JANE' },
			city: null,
		},
	]);
});

test.serial('left join (all fields)', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable)
		.values([{ name: 'Paris' }, { name: 'London' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

	const res = await db.select().from(users2Table)
		.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

	t.deepEqual(res, [
		{
			users2: {
				id: 1,
				name: 'John',
				cityId: 1,
			},
			cities: {
				id: 1,
				name: 'Paris',
			},
		},
		{
			users2: {
				id: 2,
				name: 'Jane',
				cityId: null,
			},
			cities: null,
		},
	]);
});

test.serial('join subquery', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`courses\``);
	await db.execute(sql`drop table if exists \`course_categories\``);

	await db.execute(
		sql`
			create table \`course_categories\` (
				\`id\` serial primary key,
				\`name\` text not null
			)
		`,
	);

	await db.execute(
		sql`
			create table \`courses\` (
				\`id\` serial primary key,
				\`name\` text not null,
				\`category_id\` int references \`course_categories\`(\`id\`)
			)
		`,
	);

	await db.insert(courseCategoriesTable).values([
		{ name: 'Category 1' },
		{ name: 'Category 2' },
		{ name: 'Category 3' },
		{ name: 'Category 4' },
	]);

	await db.insert(coursesTable).values([
		{ name: 'Development', categoryId: 2 },
		{ name: 'IT & Software', categoryId: 3 },
		{ name: 'Marketing', categoryId: 4 },
		{ name: 'Design', categoryId: 1 },
	]);

	const sq2 = db
		.select({
			categoryId: courseCategoriesTable.id,
			category: courseCategoriesTable.name,
			total: sql<number>`count(${courseCategoriesTable.id})`,
		})
		.from(courseCategoriesTable)
		.groupBy(courseCategoriesTable.id, courseCategoriesTable.name)
		.as('sq2');

	const res = await db
		.select({
			courseName: coursesTable.name,
			categoryId: sq2.categoryId,
		})
		.from(coursesTable)
		.leftJoin(sq2, eq(coursesTable.categoryId, sq2.categoryId))
		.orderBy(coursesTable.name);

	t.deepEqual(res, [
		{ courseName: 'Design', categoryId: 1 },
		{ courseName: 'Development', categoryId: 2 },
		{ courseName: 'IT & Software', categoryId: 3 },
		{ courseName: 'Marketing', categoryId: 4 },
	]);

	await db.execute(sql`drop table if exists \`courses\``);
	await db.execute(sql`drop table if exists \`course_categories\``);
});

test.serial('with ... select', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`orders\``);
	await db.execute(
		sql`
			create table \`orders\` (
				\`id\` serial primary key,
				\`region\` text not null,
				\`product\` text not null,
				\`amount\` int not null,
				\`quantity\` int not null
			)
		`,
	);

	await db.insert(orders).values([
		{ region: 'Europe', product: 'A', amount: 10, quantity: 1 },
		{ region: 'Europe', product: 'A', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 20, quantity: 2 },
		{ region: 'Europe', product: 'B', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 30, quantity: 3 },
		{ region: 'US', product: 'A', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 40, quantity: 4 },
		{ region: 'US', product: 'B', amount: 50, quantity: 5 },
	]);

	const regionalSales = db
		.$with('regional_sales')
		.as(
			db
				.select({
					region: orders.region,
					totalSales: sql<number>`sum(${orders.amount})`.as('total_sales'),
				})
				.from(orders)
				.groupBy(orders.region),
		);

	const topRegions = db
		.$with('top_regions')
		.as(
			db
				.select({
					region: regionalSales.region,
				})
				.from(regionalSales)
				.where(
					gt(
						regionalSales.totalSales,
						db.select({ sales: sql`sum(${regionalSales.totalSales})/10` }).from(regionalSales),
					),
				),
		);

	const result = await db
		.with(regionalSales, topRegions)
		.select({
			region: orders.region,
			product: orders.product,
			productUnits: sql<number>`cast(sum(${orders.quantity}) as unsigned)`,
			productSales: sql<number>`cast(sum(${orders.amount}) as unsigned)`,
		})
		.from(orders)
		.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
		.groupBy(orders.region, orders.product)
		.orderBy(orders.region, orders.product);

	t.deepEqual(result, [
		{
			region: 'Europe',
			product: 'A',
			productUnits: 3,
			productSales: 30,
		},
		{
			region: 'Europe',
			product: 'B',
			productUnits: 5,
			productSales: 50,
		},
		{
			region: 'US',
			product: 'A',
			productUnits: 7,
			productSales: 70,
		},
		{
			region: 'US',
			product: 'B',
			productUnits: 9,
			productSales: 90,
		},
	]);
});

test.serial('select from subquery sql', async (t) => {
	const { db } = t.context;

	await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

	const sq = db
		.select({ name: sql<string>`concat(${users2Table.name}, " modified")`.as('name') })
		.from(users2Table)
		.as('sq');

	const res = await db.select({ name: sq.name }).from(sq);

	t.deepEqual(res, [{ name: 'John modified' }, { name: 'Jane modified' }]);
});

test.serial('select a field without joining its table', (t) => {
	const { db } = t.context;

	t.throws(() => db.select({ name: users2Table.name }).from(usersTable).prepare());
});

test.serial('select all fields from subquery without alias', (t) => {
	const { db } = t.context;

	const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

	t.throws(() => db.select().from(sq).prepare());
});

test.serial('select count()', async (t) => {
	const { db } = t.context;

	await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

	const res = await db.select({ count: sql`count(*)` }).from(usersTable);

	t.deepEqual(res, [{ count: 2 }]);
});

test.serial('select for ...', (t) => {
	const { db } = t.context;

	{
		const query = db.select().from(users2Table).for('update').toSQL();
		t.regex(query.sql, / for update$/);
	}
	{
		const query = db.select().from(users2Table).for('share', { skipLocked: true }).toSQL();
		t.regex(query.sql, / for share skip locked$/);
	}
	{
		const query = db.select().from(users2Table).for('update', { noWait: true }).toSQL();
		t.regex(query.sql, / for update no wait$/);
	}
});

test.serial('having', async (t) => {
	const { db } = t.context;

	await db.insert(citiesTable).values([{ name: 'London' }, { name: 'Paris' }, { name: 'New York' }]);

	await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane', cityId: 1 }, {
		name: 'Jack',
		cityId: 2,
	}]);

	const result = await db
		.select({
			id: citiesTable.id,
			name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
			usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
		})
		.from(citiesTable)
		.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
		.where(({ name }) => sql`length(${name}) >= 3`)
		.groupBy(citiesTable.id)
		.having(({ usersCount }) => sql`${usersCount} > 0`)
		.orderBy(({ name }) => name);

	t.deepEqual(result, [
		{
			id: 1,
			name: 'LONDON',
			usersCount: 2,
		},
		{
			id: 2,
			name: 'PARIS',
			usersCount: 1,
		},
	]);
});

test.serial('view', async (t) => {
	const { db } = t.context;

	const newYorkers1 = mysqlView('new_yorkers')
		.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

	const newYorkers2 = mysqlView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

	const newYorkers3 = mysqlView('new_yorkers', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	}).existing();

	await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

	await db.insert(citiesTable).values([{ name: 'New York' }, { name: 'Paris' }]);

	await db.insert(users2Table).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 1 },
		{ name: 'Jack', cityId: 2 },
	]);

	{
		const result = await db.select().from(newYorkers1);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers2);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select().from(newYorkers3);
		t.deepEqual(result, [
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 1 },
		]);
	}

	{
		const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
		t.deepEqual(result, [
			{ name: 'John' },
			{ name: 'Jane' },
		]);
	}

	await db.execute(sql`drop view ${newYorkers1}`);
});

test.serial('select from raw sql', async (t) => {
	const { db } = t.context;

	const result = await db.select({
		id: sql<number>`id`,
		name: sql<string>`name`,
	}).from(sql`(select 1 as id, 'John' as name) as users`);

	Expect<Equal<{ id: number; name: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John' },
	]);
});

test.serial('select from raw sql with joins', async (t) => {
	const { db } = t.context;

	const result = await db
		.select({
			id: sql<number>`users.id`,
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, sql`cities.id = users.id`);

	Expect<Equal<{ id: number; name: string; userCity: string; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from select', async (t) => {
	const { db } = t.context;

	const result = await db
		.select({
			userId: sql<number>`users.id`.as('userId'),
			name: sql<string>`users.name`,
			userCity: sql<string>`users.city`,
			cityId: sql<number>`cities.id`.as('cityId'),
			cityName: sql<string>`cities.name`,
		})
		.from(sql`(select 1 as id, 'John' as name, 'New York' as city) as users`)
		.leftJoin(sql`(select 1 as id, 'Paris' as name) as cities`, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('join on aliased sql from with clause', async (t) => {
	const { db } = t.context;

	const users = db.$with('users').as(
		db.select({
			id: sql<number>`id`.as('userId'),
			name: sql<string>`name`.as('userName'),
			city: sql<string>`city`.as('city'),
		}).from(
			sql`(select 1 as id, 'John' as name, 'New York' as city) as users`,
		),
	);

	const cities = db.$with('cities').as(
		db.select({
			id: sql<number>`id`.as('cityId'),
			name: sql<string>`name`.as('cityName'),
		}).from(
			sql`(select 1 as id, 'Paris' as name) as cities`,
		),
	);

	const result = await db
		.with(users, cities)
		.select({
			userId: users.id,
			name: users.name,
			userCity: users.city,
			cityId: cities.id,
			cityName: cities.name,
		})
		.from(users)
		.leftJoin(cities, (cols) => eq(cols.cityId, cols.userId));

	Expect<Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>>;

	t.deepEqual(result, [
		{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
	]);
});

test.serial('prefixed table', async (t) => {
	const { db } = t.context;

	const mysqlTable = mysqlTableCreator((name) => `myprefix_${name}`);

	const users = mysqlTable('test_prefixed_table_with_unique_name', {
		id: int('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table myprefix_test_prefixed_table_with_unique_name (id int not null primary key, name text not null)`,
	);

	await db.insert(users).values({ id: 1, name: 'John' });

	const result = await db.select().from(users);

	t.deepEqual(result, [{ id: 1, name: 'John' }]);

	await db.execute(sql`drop table ${users}`);
});

test.serial('orderBy with aliased column', (t) => {
	const { db } = t.context;

	const query = db.select({
		test: sql`something`.as('test'),
	}).from(users2Table).orderBy((fields) => fields.test).toSQL();

	t.deepEqual(query.sql, 'select something as `test` from `users2` order by `test`');
});

test.serial('timestamp timezone', async (t) => {
	const { db } = t.context;

	const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

	await db.insert(usersTable).values({ name: 'With default times' });
	await db.insert(usersTable).values({
		name: 'Without default times',
		createdAt: date,
	});
	const users = await db.select().from(usersTable);

	// check that the timestamps are set correctly for default times
	t.assert(Math.abs(users[0]!.createdAt.getTime() - Date.now()) < 2000);

	// check that the timestamps are set correctly for non default times
	t.assert(Math.abs(users[1]!.createdAt.getTime() - date.getTime()) < 2000);
});

// TODO: implement transactions
// test.serial('transaction', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_transactions', {
// 		id: serial('id').primaryKey(),
// 		balance: int('balance').notNull(),
// 	});
// 	const products = mysqlTable('products_transactions', {
// 		id: serial('id').primaryKey(),
// 		price: int('price').notNull(),
// 		stock: int('stock').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`drop table if exists ${products}`);

// 	await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
// 	await db.execute(
// 		sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
// 	);

// 	const [{ insertId: userId }] = await db.insert(users).values({ balance: 100 });
// 	const user = await db.select().from(users).where(eq(users.id, userId)).then((rows) => rows[0]!);
// 	const [{ insertId: productId }] = await db.insert(products).values({ price: 10, stock: 10 });
// 	const product = await db.select().from(products).where(eq(products.id, productId)).then((rows) => rows[0]!);

// 	await db.transaction(async (tx) => {
// 		await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
// 		await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
// 	});

// 	const result = await db.select().from(users);

// 	t.deepEqual(result, [{ id: 1, balance: 90 }]);

// 	await db.execute(sql`drop table ${users}`);
// 	await db.execute(sql`drop table ${products}`);
// });

// TODO: implement transactions
// test.serial('transaction rollback', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_transactions_rollback', {
// 		id: serial('id').primaryKey(),
// 		balance: int('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_transactions_rollback (id serial not null primary key, balance int not null)`,
// 	);

// 	await t.throwsAsync(async () =>
// 		await db.transaction(async (tx) => {
// 			await tx.insert(users).values({ balance: 100 });
// 			tx.rollback();
// 		}), new TransactionRollbackError());

// 	const result = await db.select().from(users);

// 	t.deepEqual(result, []);

// 	await db.execute(sql`drop table ${users}`);
// });

// TODO: implement transactions
// test.serial('nested transaction', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_nested_transactions', {
// 		id: serial('id').primaryKey(),
// 		balance: int('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_nested_transactions (id serial not null primary key, balance int not null)`,
// 	);

// 	await db.transaction(async (tx) => {
// 		await tx.insert(users).values({ balance: 100 });

// 		await tx.transaction(async (tx) => {
// 			await tx.update(users).set({ balance: 200 });
// 		});
// 	});

// 	const result = await db.select().from(users);

// 	t.deepEqual(result, [{ id: 1, balance: 200 }]);

// 	await db.execute(sql`drop table ${users}`);
// });

// TODO: implement transactions
// test.serial('nested transaction rollback', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_nested_transactions_rollback', {
// 		id: serial('id').primaryKey(),
// 		balance: int('balance').notNull(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);

// 	await db.execute(
// 		sql`create table users_nested_transactions_rollback (id serial not null primary key, balance int not null)`,
// 	);

// 	await db.transaction(async (tx) => {
// 		await tx.insert(users).values({ balance: 100 });

// 		await t.throwsAsync(async () =>
// 			await tx.transaction(async (tx) => {
// 				await tx.update(users).set({ balance: 200 });
// 				tx.rollback();
// 			}), new TransactionRollbackError());
// 	});

// 	const result = await db.select().from(users);

// 	t.deepEqual(result, [{ id: 1, balance: 100 }]);

// 	await db.execute(sql`drop table ${users}`);
// });

test.serial('join subquery with join', async (t) => {
	const { db } = t.context;

	const internalStaff = mysqlTable('internal_staff', {
		userId: int('user_id').notNull(),
	});

	const customUser = mysqlTable('custom_user', {
		id: int('id').notNull(),
	});

	const ticket = mysqlTable('ticket', {
		staffId: int('staff_id').notNull(),
	});

	await db.execute(sql`drop table if exists ${internalStaff}`);
	await db.execute(sql`drop table if exists ${customUser}`);
	await db.execute(sql`drop table if exists ${ticket}`);

	await db.execute(sql`create table internal_staff (user_id integer not null)`);
	await db.execute(sql`create table custom_user (id integer not null)`);
	await db.execute(sql`create table ticket (staff_id integer not null)`);

	await db.insert(internalStaff).values({ userId: 1 });
	await db.insert(customUser).values({ id: 1 });
	await db.insert(ticket).values({ staffId: 1 });

	const subq = db
		.select()
		.from(internalStaff)
		.leftJoin(customUser, eq(internalStaff.userId, customUser.id))
		.as('internal_staff');

	const mainQuery = await db
		.select()
		.from(ticket)
		.leftJoin(subq, eq(subq.internal_staff.userId, ticket.staffId));

	t.deepEqual(mainQuery, [{
		ticket: { staffId: 1 },
		internal_staff: {
			internal_staff: { userId: 1 },
			custom_user: { id: 1 },
		},
	}]);

	await db.execute(sql`drop table ${internalStaff}`);
	await db.execute(sql`drop table ${customUser}`);
	await db.execute(sql`drop table ${ticket}`);
});

test.serial('subquery with view', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users_subquery_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.$with('sq').as(db.select().from(newYorkers));
	const result = await db.with(sq).select().from(sq);

	t.deepEqual(result, [
		{ id: 1, name: 'John', cityId: 1 },
		{ id: 3, name: 'Jack', cityId: 1 },
	]);

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);
});

test.serial('join view as subquery', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users_join_view', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
		cityId: int('city_id').notNull(),
	});

	const newYorkers = mysqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop view if exists ${newYorkers}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text not null, city_id integer not null)`,
	);
	await db.execute(sql`create view ${newYorkers} as select * from ${users} where city_id = 1`);

	await db.insert(users).values([
		{ name: 'John', cityId: 1 },
		{ name: 'Jane', cityId: 2 },
		{ name: 'Jack', cityId: 1 },
		{ name: 'Jill', cityId: 2 },
	]);

	const sq = db.select().from(newYorkers).as('new_yorkers_sq');

	const result = await db.select().from(users).leftJoin(sq, eq(users.id, sq.id));

	t.deepEqual(result, [
		{
			users_join_view: { id: 1, name: 'John', cityId: 1 },
			new_yorkers_sq: { id: 1, name: 'John', cityId: 1 },
		},
		{
			users_join_view: { id: 2, name: 'Jane', cityId: 2 },
			new_yorkers_sq: null,
		},
		{
			users_join_view: { id: 3, name: 'Jack', cityId: 1 },
			new_yorkers_sq: { id: 3, name: 'Jack', cityId: 1 },
		},
		{
			users_join_view: { id: 4, name: 'Jill', cityId: 2 },
			new_yorkers_sq: null,
		},
	]);

	await db.execute(sql`drop view ${newYorkers}`);
	await db.execute(sql`drop table ${users}`);
});

// TODO: implement iterator
// test.serial('select iterator', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_iterator', {
// 		id: serial('id').primaryKey(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`create table ${users} (id serial not null primary key)`);

// 	await db.insert(users).values([{}, {}, {}]);

// 	const iter = db.select().from(users).iterator();
// 	const result: InferModel<typeof users>[] = [];

// 	for await (const row of iter) {
// 		result.push(row);
// 	}

// 	t.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
// });

// TODO: implement iterator
// test.serial('select iterator w/ prepared statement', async (t) => {
// 	const { db } = t.context;

// 	const users = mysqlTable('users_iterator', {
// 		id: serial('id').primaryKey(),
// 	});

// 	await db.execute(sql`drop table if exists ${users}`);
// 	await db.execute(sql`create table ${users} (id serial not null primary key)`);

// 	await db.insert(users).values([{}, {}, {}]);

// 	const prepared = db.select().from(users).prepare();
// 	const iter = prepared.iterator();
// 	const result: InferModel<typeof users>[] = [];

// 	for await (const row of iter) {
// 		result.push(row);
// 	}

// 	t.deepEqual(result, [{ id: 1 }, { id: 2 }, { id: 3 }]);
// });

test.serial('insert undefined', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await t.notThrowsAsync(async () => await db.insert(users).values({ name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

test.serial('update undefined', async (t) => {
	const { db } = t.context;

	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name'),
	});

	await db.execute(sql`drop table if exists ${users}`);

	await db.execute(
		sql`create table ${users} (id serial not null primary key, name text)`,
	);

	await t.throwsAsync(async () => await db.update(users).set({ name: undefined }));
	await t.notThrowsAsync(async () => await db.update(users).set({ id: 1, name: undefined }));

	await db.execute(sql`drop table ${users}`);
});

test.serial('utc config for datetime', async (t) => {
	const { db } = t.context;

	await db.execute(sql`drop table if exists \`datestable\``);
	await db.execute(
		sql`
			create table \`datestable\` (
				\`datetime_utc\` datetime(3),
				\`datetime\` datetime(3),
				\`datetime_as_string\` datetime
			)
		`,
	);
	const datesTable = mysqlTable('datestable', {
		datetimeUTC: datetime('datetime_utc', { fsp: 3, mode: 'date' }),
		datetime: datetime('datetime', { fsp: 3 }),
		datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
	});

	const dateObj = new Date('2022-11-11');
	const dateUtc = new Date('2022-11-11T12:12:12.122Z');

	await db.insert(datesTable).values({
		datetimeUTC: dateUtc,
		datetime: dateObj,
		datetimeAsString: '2022-11-11 12:12:12',
	});

	const res = await db.select().from(datesTable);

	const [rawSelect] = await db.execute(sql`select \`datetime_utc\` from \`datestable\``);
	const selectedRow = (rawSelect as unknown as [{ datetime_utc: string }])[0];

	t.is(selectedRow.datetime_utc, '2022-11-11 12:12:12.122');
	t.deepEqual(new Date(selectedRow.datetime_utc.replace(' ', 'T') + 'Z'), dateUtc);

	t.assert(res[0]?.datetime instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(res[0]?.datetimeUTC instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
	t.assert(typeof res[0]?.datetimeAsString === 'string');

	t.deepEqual(res, [{
		datetimeUTC: dateUtc,
		datetime: new Date('2022-11-11'),
		datetimeAsString: '2022-11-11 12:12:12',
	}]);

	await db.execute(sql`drop table if exists \`datestable\``);
});
