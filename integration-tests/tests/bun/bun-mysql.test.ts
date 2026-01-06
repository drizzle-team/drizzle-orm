/// <reference types="bun-types" />

import retry from 'async-retry';
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, spyOn, test } from 'bun:test';
import Docker from 'dockerode';
import {
	and,
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	defineRelations,
	eq,
	exists,
	getTableColumns,
	getTableName,
	gt,
	gte,
	inArray,
	is,
	like,
	lt,
	max,
	min,
	Name,
	not,
	notInArray,
	sql,
	sum,
	sumDistinct,
	Table,
	TransactionRollbackError,
} from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import type { BunMySqlDatabase } from 'drizzle-orm/bun-sql/mysql';
import type { MutationOption } from 'drizzle-orm/cache/core';
import { Cache } from 'drizzle-orm/cache/core';
import type { CacheConfig } from 'drizzle-orm/cache/core/types';
import {
	alias,
	bigint,
	binary,
	boolean,
	char,
	date,
	datetime,
	decimal,
	double,
	except,
	exceptAll,
	float,
	foreignKey,
	getTableConfig,
	getViewConfig,
	index,
	int,
	intersect,
	intersectAll,
	json,
	mediumint,
	type MySqlDatabase,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	mysqlTableCreator,
	mysqlView,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	union,
	unionAll,
	unique,
	uniqueIndex,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import getPort from 'get-port';
import Keyv from 'keyv';
import { v4 as uuid } from 'uuid';
import { type Equal, Expect, toLocalDate } from '~/utils';

export const rqbUser = mysqlTable('user_rqb_test', {
	id: serial().primaryKey().notNull(),
	name: text().notNull(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});

export const rqbPost = mysqlTable('post_rqb_test', {
	id: serial().primaryKey().notNull(),
	userId: bigint('user_id', {
		mode: 'number',
	}).notNull(),
	content: text(),
	createdAt: timestamp('created_at', {
		mode: 'date',
	}).notNull(),
});

export const relations = defineRelations({ rqbUser, rqbPost }, (r) => ({
	rqbUser: {
		posts: r.many.rqbPost(),
	},
	rqbPost: {
		author: r.one.rqbUser({
			from: r.rqbPost.userId,
			to: r.rqbUser.id,
		}),
	},
}));

const allTypesTable = mysqlTable('all_types', {
	serial: serial('serial'),
	bigint53: bigint('bigint53', {
		mode: 'number',
	}),
	bigint64: bigint('bigint64', {
		mode: 'bigint',
	}),
	binary: binary('binary'),
	boolean: boolean('boolean'),
	char: char('char'),
	date: date('date', {
		mode: 'date',
	}),
	dateStr: date('date_str', {
		mode: 'string',
	}),
	datetime: datetime('datetime', {
		mode: 'date',
	}),
	datetimeStr: datetime('datetime_str', {
		mode: 'string',
	}),
	decimal: decimal('decimal'),
	decimalNum: decimal('decimal_num', {
		scale: 30,
		mode: 'number',
	}),
	decimalBig: decimal('decimal_big', {
		scale: 30,
		mode: 'bigint',
	}),
	double: double('double'),
	float: float('float'),
	int: int('int'),
	json: json('json'),
	medInt: mediumint('med_int'),
	smallInt: smallint('small_int'),
	real: real('real'),
	text: text('text'),
	time: time('time'),
	timestamp: timestamp('timestamp', {
		mode: 'date',
	}),
	timestampStr: timestamp('timestamp_str', {
		mode: 'string',
	}),
	tinyInt: tinyint('tiny_int'),
	varbin: varbinary('varbin', {
		length: 16,
	}),
	varchar: varchar('varchar', {
		length: 255,
	}),
	year: year('year'),
	enum: mysqlEnum('enum', ['enV1', 'enV2']),
});

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

const usersOnUpdate = mysqlTable('users_on_update', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: datetime('updated_at', { mode: 'date', fsp: 3 }).$onUpdate(() => new Date()),
	uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper(name)`),
	alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
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

// To test aggregate functions
const aggregateTable = mysqlTable('aggregate_table', {
	id: serial('id').notNull(),
	name: text('name').notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

// To test another schema and multischema
const mySchema = mysqlSchema(`mySchema`);

const usersMySchemaTable = mySchema.table('userstest', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const users2MySchemaTable = mySchema.table('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesMySchemaTable = mySchema.table('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const ENABLE_LOGGING = false;

let db: BunMySqlDatabase<never, typeof relations> & { $client: SQL };
let dbGlobalCached: BunMySqlDatabase & { $client: SQL };
let cachedDb: BunMySqlDatabase & { $client: SQL };
let client: SQL;

beforeAll(async () => {
	let connectionString;
	if (process.env['MYSQL_CONNECTION_STRING']) {
		connectionString = process.env['MYSQL_CONNECTION_STRING'];
	} else {
		const { connectionString: conStr } = await createDockerDB();
		connectionString = conStr;
	}
	client = await retry(async () => {
		client = await new SQL({
			url: connectionString,
			adapter: 'mysql',
			bigint: true,
		}).connect();
		return client;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
		onRetry() {
			client?.end();
		},
	});
	db = drizzle.mysql({ client, logger: ENABLE_LOGGING, relations });
	cachedDb = drizzle.mysql({ client, logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle.mysql({ client, logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
});

afterAll(async () => {
	await client?.end();
	await cachedDb?.$client.end();
	await dbGlobalCached?.$client.end();
});

let mysqlContainer: Docker.Container;
export async function createDockerDB(): Promise<{ connectionString: string; container: Docker.Container }> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	mysqlContainer = await docker.createContainer({
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

	await mysqlContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return { connectionString: `mysql://root:mysql@127.0.0.1:${port}/drizzle`, container: mysqlContainer };
}

describe('common', () => {
	beforeEach(async () => {
		await db.execute(sql`drop table if exists ${rqbUser} CASCADE;`);
		await db.execute(sql`drop table if exists ${rqbPost} CASCADE;`);
		await db.execute(sql`drop table if exists userstest`);
		await db.execute(sql`drop table if exists users2`);
		await db.execute(sql`drop table if exists cities`);
		await db.execute(sql`drop table if exists \`all_types\``);
		await db.execute(sql`drop schema if exists \`mySchema\``);
		await db.execute(sql`create schema if not exists \`mySchema\``);

		await db.execute(
			sql`
				create table userstest (
					id serial primary key,
					name text not null,
					verified boolean not null default false,
					jsonb json,
					created_at timestamp not null default now()
				)
			`,
		);

		await db.execute(
			sql`
				create table users2 (
					id serial primary key,
					name text not null,
					city_id int references cities(id)
				)
			`,
		);

		await db.execute(
			sql`
				create table cities (
					id serial primary key,
					name text not null
				)
			`,
		);

		await db.execute(
			sql`
				create table \`mySchema\`.\`userstest\` (
					\`id\` serial primary key,
					\`name\` text not null,
					\`verified\` boolean not null default false,
					\`jsonb\` json,
					\`created_at\` timestamp not null default now()
				)
			`,
		);

		await db.execute(
			sql`
				create table \`mySchema\`.\`cities\` (
					\`id\` serial primary key,
					\`name\` text not null
				)
			`,
		);

		await db.execute(
			sql`
				create table \`mySchema\`.\`users2\` (
					\`id\` serial primary key,
					\`name\` text not null,
					\`city_id\` int references \`mySchema\`.\`cities\`(\`id\`)
				)
			`,
		);

		await db.execute(sql`
			CREATE TABLE ${rqbUser} (
					\`id\` SERIAL PRIMARY KEY NOT NULL,
					\`name\` TEXT NOT NULL,
					\`created_at\` TIMESTAMP NOT NULL
				 )
		`);
		await db.execute(sql`
			CREATE TABLE ${rqbPost} ( 
					\`id\` SERIAL PRIMARY KEY NOT NULL,
					\`user_id\` BIGINT(20) UNSIGNED NOT NULL,
					\`content\` TEXT,
					\`created_at\` TIMESTAMP NOT NULL
			)
		`);
	});

	async function setupReturningFunctionsTest(db: MySqlDatabase<any, any, any, any, any>) {
		await db.execute(sql`drop table if exists \`users_default_fn\``);
		await db.execute(
			sql`
				create table \`users_default_fn\` (
					\`id\` varchar(256) primary key,
					\`name\` text not null
				);
			`,
		);
	}

	async function setupSetOperationTest(db: MySqlDatabase<any, any, any, any, any>) {
		await db.execute(sql`drop table if exists \`users2\``);
		await db.execute(sql`drop table if exists \`cities\``);
		await db.execute(
			sql`
				create table \`users2\` (
					\`id\` serial primary key,
					\`name\` text not null,
					\`city_id\` int references \`cities\`(\`id\`)
				)
			`,
		);

		await db.execute(
			sql`
				create table \`cities\` (
					\`id\` serial primary key,
					\`name\` text not null
				)
			`,
		);

		await db.insert(citiesTable).values([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await db.insert(users2Table).values([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 2, name: 'Jane', cityId: 2 },
			{ id: 3, name: 'Jack', cityId: 3 },
			{ id: 4, name: 'Peter', cityId: 3 },
			{ id: 5, name: 'Ben', cityId: 2 },
			{ id: 6, name: 'Jill', cityId: 1 },
			{ id: 7, name: 'Mary', cityId: 2 },
			{ id: 8, name: 'Sally', cityId: 1 },
		]);
	}

	async function setupAggregateFunctionsTest(db: MySqlDatabase<any, any, any, any, any>) {
		await db.execute(sql`drop table if exists \`aggregate_table\``);
		await db.execute(
			sql`
				create table \`aggregate_table\` (
					\`id\` integer primary key auto_increment not null,
					\`name\` text not null,
					\`a\` integer,
					\`b\` integer,
					\`c\` integer,
					\`null_only\` integer
				);
			`,
		);
		await db.insert(aggregateTable).values([
			{ name: 'value 1', a: 5, b: 10, c: 20 },
			{ name: 'value 1', a: 5, b: 20, c: 30 },
			{ name: 'value 2', a: 10, b: 50, c: 60 },
			{ name: 'value 3', a: 20, b: 20, c: null },
			{ name: 'value 4', a: null, b: 90, c: 120 },
			{ name: 'value 5', a: 80, b: 10, c: null },
			{ name: 'value 6', a: null, b: null, c: 150 },
		]);
	}

	test('table config: unsigned ints', async () => {
		const unsignedInts = mysqlTable('cities1', {
			bigint: bigint('bigint', { mode: 'number', unsigned: true }),
			int: int('int', { unsigned: true }),
			smallint: smallint('smallint', { unsigned: true }),
			mediumint: mediumint('mediumint', { unsigned: true }),
			tinyint: tinyint('tinyint', { unsigned: true }),
		});

		const tableConfig = getTableConfig(unsignedInts);

		const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
		const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
		const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
		const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
		const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

		expect(bigintColumn.getSQLType()).toStrictEqual('bigint unsigned');
		expect(intColumn.getSQLType()).toStrictEqual('int unsigned');
		expect(smallintColumn.getSQLType()).toStrictEqual('smallint unsigned');
		expect(mediumintColumn.getSQLType()).toStrictEqual('mediumint unsigned');
		expect(tinyintColumn.getSQLType()).toStrictEqual('tinyint unsigned');
	});

	test('table config: signed ints', async () => {
		const unsignedInts = mysqlTable('cities1', {
			bigint: bigint('bigint', { mode: 'number' }),
			int: int('int'),
			smallint: smallint('smallint'),
			mediumint: mediumint('mediumint'),
			tinyint: tinyint('tinyint'),
		});

		const tableConfig = getTableConfig(unsignedInts);

		const bigintColumn = tableConfig.columns.find((c) => c.name === 'bigint')!;
		const intColumn = tableConfig.columns.find((c) => c.name === 'int')!;
		const smallintColumn = tableConfig.columns.find((c) => c.name === 'smallint')!;
		const mediumintColumn = tableConfig.columns.find((c) => c.name === 'mediumint')!;
		const tinyintColumn = tableConfig.columns.find((c) => c.name === 'tinyint')!;

		expect(bigintColumn.getSQLType()).toStrictEqual('bigint');
		expect(intColumn.getSQLType()).toStrictEqual('int');
		expect(smallintColumn.getSQLType()).toStrictEqual('smallint');
		expect(mediumintColumn.getSQLType()).toStrictEqual('mediumint');
		expect(tinyintColumn.getSQLType()).toStrictEqual('tinyint');
	});

	test('table config: foreign keys name', async () => {
		const table = mysqlTable('cities', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			state: text('state'),
		}, (t) => ({
			f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
		}));

		const tableConfig = getTableConfig(table);

		expect(tableConfig.foreignKeys).toHaveLength(1);
		expect(tableConfig.foreignKeys[0]!.getName()).toStrictEqual('custom_fk');
	});

	test('table configs: unique third param', async () => {
		const cities1Table = mysqlTable('cities1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			state: text('state'),
		}, (t) => ({
			f: unique('custom_name').on(t.name, t.state),
			f1: unique('custom_name1').on(t.name, t.state),
		}));

		const tableConfig = getTableConfig(cities1Table);

		expect(tableConfig.uniqueConstraints).toHaveLength(2);

		expect(tableConfig.uniqueConstraints[0]?.name).toStrictEqual('custom_name');
		expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toStrictEqual(['name', 'state']);

		expect(tableConfig.uniqueConstraints[1]?.name).toStrictEqual('custom_name1');
		expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toStrictEqual(['name', 'state']);
	});

	test('table configs: unique in column', async () => {
		const cities1Table = mysqlTable('cities1', {
			id: serial('id').primaryKey(),
			name: text('name').notNull().unique(),
			state: text('state').unique('custom'),
			field: text('field').unique('custom_field'),
		});

		const tableConfig = getTableConfig(cities1Table);

		const columnName = tableConfig.columns.find((it) => it.name === 'name');
		expect(columnName?.uniqueName).toStrictEqual(undefined);
		expect(columnName?.isUnique).toBeTruthy();

		const columnState = tableConfig.columns.find((it) => it.name === 'state');
		expect(columnState?.uniqueName).toStrictEqual('custom');
		expect(columnState?.isUnique).toBeTruthy();

		const columnField = tableConfig.columns.find((it) => it.name === 'field');
		expect(columnField?.uniqueName).toStrictEqual('custom_field');
		expect(columnField?.isUnique).toBeTruthy();
	});

	test('select all fields', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const result = await db.select().from(usersTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test('select sql', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db.select({
			name: sql`upper(${usersTable.name})`,
		}).from(usersTable);

		expect(users).toStrictEqual([{ name: 'JOHN' }]);
	});

	test('select typed sql', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db.select({
			name: sql<string>`upper(${usersTable.name})`,
		}).from(usersTable);

		expect(users).toStrictEqual([{ name: 'JOHN' }]);
	});

	test('select with empty array in inArray', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		const result = await db
			.select({
				name: sql`upper(${usersTable.name})`,
			})
			.from(usersTable)
			.where(inArray(usersTable.id, []));

		expect(result).toStrictEqual([]);
	});

	test('select with empty array in notInArray', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		const result = await db
			.select({
				name: sql`upper(${usersTable.name})`,
			})
			.from(usersTable)
			.where(notInArray(usersTable.id, []));

		expect(result).toStrictEqual([{ name: 'JOHN' }, { name: 'JANE' }, { name: 'JANE' }]);
	});

	test('select distinct', async () => {
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

		expect(users).toStrictEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
	});

	test('insert returning sql', async () => {
		const result = await db.insert(usersTable).values({ name: 'John' });

		expect(result['lastInsertRowid']).toStrictEqual(1);
	});

	test('delete returning sql', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

		expect(users['affectedRows']).toStrictEqual(1);
	});

	test('update returning sql', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

		expect(users['affectedRows']).toStrictEqual(1);
	});

	test('update with returning all fields', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

		const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

		expect(updatedUsers['affectedRows']).toStrictEqual(1);

		expect(users[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
		expect(users).toStrictEqual([{
			id: 1,
			name: 'Jane',
			verified: false,
			jsonb: null,
			createdAt: users[0]!.createdAt,
		}]);
	});

	test('update with returning partial', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

		const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id, 1),
		);

		expect(updatedUsers['affectedRows']).toStrictEqual(1);

		expect(users).toStrictEqual([{ id: 1, name: 'Jane' }]);
	});

	test('delete with returning all fields', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

		expect(deletedUser['affectedRows']).toStrictEqual(1);
	});

	test('delete with returning partial', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

		expect(deletedUser['affectedRows']).toStrictEqual(1);
	});

	test('insert + select', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const result = await db.select().from(usersTable);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);

		await db.insert(usersTable).values({ name: 'Jane' });
		const result2 = await db.select().from(usersTable);
		expect(result2).toStrictEqual([
			{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
			{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test('json insert', async () => {
		await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
		const result = await db.select({
			id: usersTable.id,
			name: usersTable.name,
			jsonb: usersTable.jsonb,
		}).from(usersTable);

		expect(result).toStrictEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
	});

	test('insert with overridden default values', async () => {
		await db.insert(usersTable).values({ name: 'John', verified: true });
		const result = await db.select().from(usersTable);

		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: true,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test('insert many', async () => {
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

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', jsonb: null, verified: false },
			{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
			{ id: 3, name: 'Jane', jsonb: null, verified: false },
			{ id: 4, name: 'Austin', jsonb: null, verified: true },
		]);
	});

	test('insert many with returning', async () => {
		const result = await db.insert(usersTable).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);

		expect(result['affectedRows']).toStrictEqual(4);
	});

	test('select with group by as field', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersTable.name }).from(usersTable)
			.groupBy(usersTable.name);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test('select with exists', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const user = alias(usersTable, 'user');
		const result = await db.select({ name: usersTable.name }).from(usersTable).where(
			exists(
				db.select({ one: sql`1` }).from(user).where(and(eq(usersTable.name, 'John'), eq(user.id, usersTable.id))),
			),
		);

		expect(result).toStrictEqual([{ name: 'John' }]);
	});

	test('select with group by as sql', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersTable.name }).from(usersTable)
			.groupBy(sql`${usersTable.name}`);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test('$default function', async () => {
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

		expect(selectedOrder).toStrictEqual([{
			id: 1,
			amount: 1,
			quantity: 1,
			region: 'Ukraine',
			product: 'random_string',
		}]);
	});

	test('$default with empty array', async () => {
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

		expect(selectedOrder).toStrictEqual([{
			id: 1,
			region: 'Ukraine',
			product: 'random_string',
		}]);
	});

	test('select with group by as sql + column', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersTable.name }).from(usersTable)
			.groupBy(sql`${usersTable.name}`, usersTable.id);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test('select with group by as column + sql', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersTable.name }).from(usersTable)
			.groupBy(usersTable.id, sql`${usersTable.name}`);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test('select with group by complex query', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersTable.name }).from(usersTable)
			.groupBy(usersTable.id, sql`${usersTable.name}`)
			.orderBy(asc(usersTable.name))
			.limit(1);

		expect(result).toStrictEqual([{ name: 'Jane' }]);
	});

	test('build query', async () => {
		const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
			.groupBy(usersTable.id, usersTable.name)
			.toSQL();

		expect(query).toStrictEqual({
			sql: `select \`id\`, \`name\` from \`userstest\` group by \`userstest\`.\`id\`, \`userstest\`.\`name\``,
			params: [],
		});
	});

	test('Query check: Insert all defaults in 1 row', async () => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state'),
		});

		const query = db
			.insert(users)
			.values({})
			.toSQL();

		expect(query).toStrictEqual({
			sql: 'insert into `users` (`id`, `name`, `state`) values (default, default, default)',
			params: [],
		});
	});

	test('Query check: Insert all defaults in multiple rows', async () => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').default('Dan'),
			state: text('state').default('UA'),
		});

		const query = db
			.insert(users)
			.values([{}, {}])
			.toSQL();

		expect(query).toStrictEqual({
			sql:
				'insert into `users` (`id`, `name`, `state`) values (default, default, default), (default, default, default)',
			params: [],
		});
	});

	test('Insert all defaults in 1 row', async () => {
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

		expect(res).toStrictEqual([{ id: 1, name: 'Dan', state: null }]);
	});

	test('Insert all defaults in multiple rows', async () => {
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

		expect(res).toStrictEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
	});

	test('build query insert with onDuplicate', async () => {
		const query = db.insert(usersTable)
			.values({ name: 'John', jsonb: ['foo', 'bar'] })
			.onDuplicateKeyUpdate({ set: { name: 'John1' } })
			.toSQL();

		expect(query).toStrictEqual({
			sql:
				'insert into `userstest` (`id`, `name`, `verified`, `jsonb`, `created_at`) values (default, ?, default, ?, default) on duplicate key update `name` = ?',
			params: ['John', '["foo","bar"]', 'John1'],
		});
	});

	test('insert with onDuplicate', async () => {
		await db.insert(usersTable)
			.values({ name: 'John' });

		await db.insert(usersTable)
			.values({ id: 1, name: 'John' })
			.onDuplicateKeyUpdate({ set: { name: 'John1' } });

		const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id, 1),
		);

		expect(res).toStrictEqual([{ id: 1, name: 'John1' }]);
	});

	test('insert conflict', async () => {
		await db.insert(usersTable)
			.values({ name: 'John' });

		await expect((async () => {
			await db.insert(usersTable).values({ id: 1, name: 'John1' });
		})()).rejects.toThrowError();
	});

	test('insert conflict with ignore', async () => {
		await db.insert(usersTable)
			.values({ name: 'John' });

		await db.insert(usersTable)
			.ignore()
			.values({ id: 1, name: 'John1' });

		const res = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
			eq(usersTable.id, 1),
		);

		expect(res).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('insert sql', async () => {
		await db.insert(usersTable).values({ name: sql`${'John'}` });
		const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('partial join with alias', async () => {
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

		expect(result).toStrictEqual([{
			user: { id: 10, name: 'Ivan' },
			customer: { id: 11, name: 'Hans' },
		}]);
	});

	test('full join with alias', async () => {
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

		expect(result).toStrictEqual([{
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

	test('select from alias', async () => {
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

		expect(result).toStrictEqual([{
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

	test('insert with spaces', async () => {
		await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
		const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

		expect(result).toStrictEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test('prepared statement', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const statement = db.select({
			id: usersTable.id,
			name: usersTable.name,
		}).from(usersTable)
			.prepare();
		const result = await statement.execute();

		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('insert: placeholders on columns with encoder', async () => {
		const date = new Date('2024-08-07T15:30:00Z');

		const statement = db.insert(usersTable).values({
			name: 'John',
			createdAt: sql.placeholder('createdAt'),
		}).prepare();

		await statement.execute({ createdAt: date });

		const result = await db
			.select({
				id: usersTable.id,
				createdAt: usersTable.createdAt,
			})
			.from(usersTable);

		expect(result).toStrictEqual([
			{ id: 1, createdAt: date },
		]);
	});

	test('prepared statement reuse', async () => {
		const stmt = db.insert(usersTable).values({
			verified: true,
			name: sql.placeholder('name'),
		}).prepare();

		for (let i = 0; i < 10; i++) {
			await stmt.execute({ name: `John ${i}` });
		}

		const result = await db.select({
			id: usersTable.id,
			name: usersTable.name,
			verified: usersTable.verified,
		}).from(usersTable);

		expect(result).toStrictEqual([
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

	test('prepared statement with placeholder in .where', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const stmt = db.select({
			id: usersTable.id,
			name: usersTable.name,
		}).from(usersTable)
			.where(eq(usersTable.id, sql.placeholder('id')))
			.prepare();
		const result = await stmt.execute({ id: 1 });

		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('prepared statement with placeholder in .limit', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const stmt = db
			.select({
				id: usersTable.id,
				name: usersTable.name,
			})
			.from(usersTable)
			.where(eq(usersTable.id, sql.placeholder('id')))
			.limit(sql.placeholder('limit'))
			.prepare();

		const result = await stmt.execute({ id: 1, limit: 1 });

		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
		expect(result).toHaveLength(1);
	});

	test('prepared statement with placeholder in .offset', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
		const stmt = db
			.select({
				id: usersTable.id,
				name: usersTable.name,
			})
			.from(usersTable)
			.limit(sql.placeholder('limit'))
			.offset(sql.placeholder('offset'))
			.prepare();

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toStrictEqual([{ id: 2, name: 'John1' }]);
	});

	test('prepared statement built using $dynamic', async () => {
		function withLimitOffset(qb: any) {
			return qb.limit(sql.placeholder('limit')).offset(sql.placeholder('offset'));
		}

		await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]);
		const stmt = db
			.select({
				id: usersTable.id,
				name: usersTable.name,
			})
			.from(usersTable)
			.$dynamic();
		withLimitOffset(stmt).prepare('stmt_limit');

		const result = await stmt.execute({ limit: 1, offset: 1 });

		expect(result).toStrictEqual([{ id: 2, name: 'John1' }]);
		expect(result).toHaveLength(1);
	});

	test('migrator', async () => {
		await db.execute(sql`drop table if exists cities_migration`);
		await db.execute(sql`drop table if exists users_migration`);
		await db.execute(sql`drop table if exists users12`);
		await db.execute(sql`drop table if exists __drizzle_migrations`);

		await migrate.mysql(db, { migrationsFolder: './drizzle2/mysql' });

		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

		const result = await db.select().from(usersMigratorTable);

		expect(result).toStrictEqual([{ id: 1, name: 'John', email: 'email' }]);

		await db.execute(sql`drop table cities_migration`);
		await db.execute(sql`drop table users_migration`);
		await db.execute(sql`drop table users12`);
		await db.execute(sql`drop table __drizzle_migrations`);
	});

	test('insert via db.execute + select via db.execute', async () => {
		await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

		const result: Record<string, unknown>[] = await db.execute<{ id: number; name: string }>(
			sql`select id, name from ${usersTable}`,
		);
		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('insert via db.execute w/ query builder', async () => {
		const inserted = await db.execute(
			db.insert(usersTable).values({ name: 'John' }),
		);
		expect(inserted['affectedRows']).toStrictEqual(1);
	});

	test('insert + select all possible dates', async () => {
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

		expect(res[0]?.date).toBeInstanceOf(Date);
		expect(res[0]?.datetime).toBeInstanceOf(Date);
		expect(typeof res[0]?.dateAsString).toStrictEqual('string');
		expect(typeof res[0]?.datetimeAsString).toStrictEqual('string');

		expect(res).toStrictEqual([{
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

	test('Mysql enum as ts enum', async () => {
		enum Test {
			a = 'a',
			b = 'b',
			c = 'c',
		}

		const tableWithTsEnums = mysqlTable('enums_test_case', {
			id: serial('id').primaryKey(),
			enum1: mysqlEnum('enum1', Test).notNull(),
			enum2: mysqlEnum('enum2', Test).default(Test.a),
			enum3: mysqlEnum('enum3', Test).notNull().default(Test.b),
		});

		await db.execute(sql`drop table if exists \`enums_test_case\``);

		await db.execute(sql`
			create table \`enums_test_case\` (
				\`id\` serial primary key,
				\`enum1\` ENUM('a', 'b', 'c') not null,
				\`enum2\` ENUM('a', 'b', 'c') default 'a',
				\`enum3\` ENUM('a', 'b', 'c') not null default 'b'
			)
		`);

		await db.insert(tableWithTsEnums).values([
			{ id: 1, enum1: Test.a, enum2: Test.b, enum3: Test.c },
			{ id: 2, enum1: Test.a, enum3: Test.c },
			{ id: 3, enum1: Test.a },
		]);

		const res = await db.select().from(tableWithTsEnums);

		await db.execute(sql`drop table \`enums_test_case\``);

		expect(res).toStrictEqual([
			{ id: 1, enum1: 'a' as Test, enum2: 'b' as Test, enum3: 'c' as Test },
			{ id: 2, enum1: 'a' as Test, enum2: 'a' as Test, enum3: 'c' as Test },
			{ id: 3, enum1: 'a' as Test, enum2: 'a' as Test, enum3: 'b' as Test },
		]);
	});

	test('Mysql enum test case #1', async () => {
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

		expect(res).toStrictEqual([
			{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
			{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
			{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
		]);
	});

	test('left join (flat object fields)', async () => {
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

		expect(res).toStrictEqual([
			{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
			{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
		]);
	});

	test('left join (grouped fields)', async () => {
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

		expect(res).toStrictEqual([
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

	test('left join (all fields)', async () => {
		await db.insert(citiesTable)
			.values([{ name: 'Paris' }, { name: 'London' }]);

		await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

		const res = await db.select().from(users2Table)
			.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

		expect(res).toStrictEqual([
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

	test('join subquery', async () => {
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

		expect(res).toStrictEqual([
			{ courseName: 'Design', categoryId: 1 },
			{ courseName: 'Development', categoryId: 2 },
			{ courseName: 'IT & Software', categoryId: 3 },
			{ courseName: 'Marketing', categoryId: 4 },
		]);

		await db.execute(sql`drop table if exists \`courses\``);
		await db.execute(sql`drop table if exists \`course_categories\``);
	});

	test('with ... select', async () => {
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

		expect(result).toStrictEqual([
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

	test('with ... update', async () => {
		const products = mysqlTable('products', {
			id: serial('id').primaryKey(),
			price: decimal('price', {
				precision: 15,
				scale: 2,
			}).notNull(),
			cheap: boolean('cheap').notNull().default(false),
		});

		await db.execute(sql`drop table if exists ${products}`);
		await db.execute(sql`
			create table ${products} (
				id serial primary key,
				price decimal(15, 2) not null,
				cheap boolean not null default false
			)
		`);

		await db.insert(products).values([
			{ price: '10.99' },
			{ price: '25.85' },
			{ price: '32.99' },
			{ price: '2.50' },
			{ price: '4.59' },
		]);

		const averagePrice = db
			.$with('average_price')
			.as(
				db
					.select({
						value: sql`avg(${products.price})`.as('value'),
					})
					.from(products),
			);

		await db
			.with(averagePrice)
			.update(products)
			.set({
				cheap: true,
			})
			.where(lt(products.price, sql`(select * from ${averagePrice})`));

		const result = await db
			.select({
				id: products.id,
			})
			.from(products)
			.where(eq(products.cheap, true));

		expect(result).toStrictEqual([
			{ id: 1 },
			{ id: 4 },
			{ id: 5 },
		]);
	});

	test('with ... delete', async () => {
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

		const averageAmount = db
			.$with('average_amount')
			.as(
				db
					.select({
						value: sql`avg(${orders.amount})`.as('value'),
					})
					.from(orders),
			);

		await db
			.with(averageAmount)
			.delete(orders)
			.where(gt(orders.amount, sql`(select * from ${averageAmount})`));

		const result = await db
			.select({
				id: orders.id,
			})
			.from(orders);

		expect(result).toStrictEqual([
			{ id: 1 },
			{ id: 2 },
			{ id: 3 },
			{ id: 4 },
			{ id: 5 },
		]);
	});

	test('select from subquery sql', async () => {
		await db.insert(users2Table).values([{ name: 'John' }, { name: 'Jane' }]);

		const sq = db
			.select({ name: sql<string>`concat(${users2Table.name}, " modified")`.as('name') })
			.from(users2Table)
			.as('sq');

		const res = await db.select({ name: sq.name }).from(sq);

		expect(res).toStrictEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
	});

	test('select a field without joining its table', () => {
		expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
	});

	test('select all fields from subquery without alias', () => {
		const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

		expect(() => db.select().from(sq).prepare()).toThrowError();
	});

	test('select count()', async () => {
		await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

		const res = await db.select({ count: sql`count(*)` }).from(usersTable);

		expect(res).toStrictEqual([{ count: 2 }]);
	});

	test('select for ...', () => {
		{
			const query = db.select().from(users2Table).for('update').toSQL();
			expect(query.sql).toMatch(/ for update$/);
		}
		{
			const query = db.select().from(users2Table).for('share', { skipLocked: true }).toSQL();
			expect(query.sql).toMatch(/ for share skip locked$/);
		}
		{
			const query = db.select().from(users2Table).for('update', { noWait: true }).toSQL();
			expect(query.sql).toMatch(/ for update nowait$/);
		}
	});

	test('having', async () => {
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

		expect(result).toStrictEqual([
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

	test('view', async () => {
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
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers2);
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers3);
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
			expect(result).toStrictEqual([
				{ name: 'John' },
				{ name: 'Jane' },
			]);
		}

		await db.execute(sql`drop view ${newYorkers1}`);
	});

	test('select from raw sql', async () => {
		const result = await db.select({
			id: sql<number>`id`,
			name: sql<string>`name`,
		}).from(sql`(select 1 as id, 'John' as name) as users`);

		Expect<Equal<{ id: number; name: string }[], typeof result>>;

		expect(result).toStrictEqual([
			{ id: 1, name: 'John' },
		]);
	});

	test('select from raw sql with joins', async () => {
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

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
		]);
	});

	test('join on aliased sql from select', async () => {
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

		Expect<
			Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
		>;

		expect(result).toStrictEqual([
			{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
		]);
	});

	test('join on aliased sql from with clause', async () => {
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

		Expect<
			Equal<{ userId: number; name: string; userCity: string; cityId: number; cityName: string }[], typeof result>
		>;

		expect(result).toStrictEqual([
			{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
		]);
	});

	test('prefixed table', async () => {
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

		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);

		await db.execute(sql`drop table ${users}`);
	});

	test('orderBy with aliased column', () => {
		const query = db.select({
			test: sql`something`.as('test'),
		}).from(users2Table).orderBy((fields) => fields.test).toSQL();

		expect(query.sql).toStrictEqual('select something as `test` from `users2` order by `test`');
	});

	test('timestamp timezone', async () => {
		const date = new Date(Date.parse('2020-01-01T12:34:56+07:00'));

		await db.insert(usersTable).values({ name: 'With default times' });
		await db.insert(usersTable).values({
			name: 'Without default times',
			createdAt: date,
		});
		const users = await db.select().from(usersTable);

		// check that the timestamps are set correctly for default times
		expect(Math.abs(users[0]!.createdAt.getTime() - Date.now())).toBeLessThan(2000);

		// check that the timestamps are set correctly for non default times
		expect(Math.abs(users[1]!.createdAt.getTime() - date.getTime())).toBeLessThan(2000);
	});

	test('transaction', async () => {
		const users = mysqlTable('users_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});
		const products = mysqlTable('products_transactions', {
			id: serial('id').primaryKey(),
			price: int('price').notNull(),
			stock: int('stock').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`drop table if exists ${products}`);

		await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
		await db.execute(
			sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
		);

		const { lastInsertRowid: userId } = await db.insert(users).values({ balance: 100 });
		const user = await db.select().from(users).where(eq(users.id, userId as number)).then((rows) => rows[0]!);
		const { lastInsertRowid: productId } = await db.insert(products).values({ price: 10, stock: 10 });
		const product = await db.select().from(products).where(eq(products.id, productId as number)).then((rows) =>
			rows[0]!
		);

		await db.transaction(async (tx) => {
			await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
			await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
		});

		const result = await db.select().from(users);

		expect(result).toStrictEqual([{ id: 1, balance: 90 }]);

		await db.execute(sql`drop table ${users}`);
		await db.execute(sql`drop table ${products}`);
	});

	test.skip(
		'transaction with options (set isolationLevel)',
		async () => {
			const users = mysqlTable('users_transactions', {
				id: serial('id').primaryKey(),
				balance: int('balance').notNull(),
			});
			const products = mysqlTable('products_transactions', {
				id: serial('id').primaryKey(),
				price: int('price').notNull(),
				stock: int('stock').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop table if exists ${products}`);

			await db.execute(sql`create table users_transactions (id serial not null primary key, balance int not null)`);
			await db.execute(
				sql`create table products_transactions (id serial not null primary key, price int not null, stock int not null)`,
			);

			const { lastInsertRowid: userId } = await db.insert(users).values({ balance: 100 });
			const user = await db.select().from(users).where(eq(users.id, userId as number)).then((rows) => rows[0]!);
			const { lastInsertRowid: productId } = await db.insert(products).values({ price: 10, stock: 10 });
			const product = await db.select().from(products).where(eq(products.id, productId as number)).then((rows) =>
				rows[0]!
			);

			await db.transaction(async (tx) => {
				await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
				await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
			}, { isolationLevel: 'serializable' });

			const result = await db.select().from(users);

			expect(result).toStrictEqual([{ id: 1, balance: 90 }]);

			await db.execute(sql`drop table ${users}`);
			await db.execute(sql`drop table ${products}`);
		},
	);

	test('transaction rollback', async () => {
		const users = mysqlTable('users_transactions_rollback', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_transactions_rollback (id serial not null primary key, balance int not null)`,
		);

		await expect((async () => {
			await db.transaction(async (tx) => {
				await tx.insert(users).values({ balance: 100 });
				tx.rollback();
			});
		})()).rejects.toThrowError(TransactionRollbackError);

		const result = await db.select().from(users);

		expect(result).toStrictEqual([]);

		await db.execute(sql`drop table ${users}`);
	});

	test('nested transaction', async () => {
		const users = mysqlTable('users_nested_transactions', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_nested_transactions (id serial not null primary key, balance int not null)`,
		);

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });

			await tx.transaction(async (tx) => {
				await tx.update(users).set({ balance: 200 });
			});
		});

		const result = await db.select().from(users);

		expect(result).toStrictEqual([{ id: 1, balance: 200 }]);

		await db.execute(sql`drop table ${users}`);
	});

	test('nested transaction rollback', async () => {
		const users = mysqlTable('users_nested_transactions_rollback', {
			id: serial('id').primaryKey(),
			balance: int('balance').notNull(),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table users_nested_transactions_rollback (id serial not null primary key, balance int not null)`,
		);

		await db.transaction(async (tx) => {
			await tx.insert(users).values({ balance: 100 });

			await expect((async () => {
				await tx.transaction(async (tx) => {
					await tx.update(users).set({ balance: 200 });
					tx.rollback();
				});
			})()).rejects.toThrowError(TransactionRollbackError);
		});

		const result = await db.select().from(users);

		expect(result).toStrictEqual([{ id: 1, balance: 100 }]);

		await db.execute(sql`drop table ${users}`);
	});

	test('join subquery with join', async () => {
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

		expect(mainQuery).toStrictEqual([{
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

	test('subquery with view', async () => {
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

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', cityId: 1 },
			{ id: 3, name: 'Jack', cityId: 1 },
		]);

		await db.execute(sql`drop view ${newYorkers}`);
		await db.execute(sql`drop table ${users}`);
	});

	test('join view as subquery', async () => {
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

		expect(result).toStrictEqual([
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

	test('select iterator', async () => {
		const users = mysqlTable('users_iterator', {
			id: serial('id').primaryKey(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`create table ${users} (id serial not null primary key)`);

		await db.insert(users).values([{}, {}, {}]);

		const iter = db.select().from(users).iterator();

		const result: typeof users.$inferSelect[] = [];

		for await (const row of iter) {
			result.push(row);
		}

		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test('select iterator w/ prepared statement', async () => {
		const users = mysqlTable('users_iterator', {
			id: serial('id').primaryKey(),
		});

		await db.execute(sql`drop table if exists ${users}`);
		await db.execute(sql`create table ${users} (id serial not null primary key)`);

		await db.insert(users).values([{}, {}, {}]);

		const prepared = db.select().from(users).prepare();
		const iter = prepared.iterator();
		const result: typeof users.$inferSelect[] = [];

		for await (const row of iter) {
			result.push(row);
		}

		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test('insert undefined', async () => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table ${users} (id serial not null primary key, name text)`,
		);

		await expect((async () => {
			await db.insert(users).values({ name: undefined });
		})()).resolves.toStrictEqual(undefined);

		await db.execute(sql`drop table ${users}`);
	});

	test('update undefined', async () => {
		const users = mysqlTable('users', {
			id: serial('id').primaryKey(),
			name: text('name'),
		});

		await db.execute(sql`drop table if exists ${users}`);

		await db.execute(
			sql`create table ${users} (id serial not null primary key, name text)`,
		);

		await expect((async () => {
			await db.update(users).set({ name: undefined });
		})()).rejects.toThrowError();

		await expect((async () => {
			await db.update(users).set({ id: 1, name: undefined });
		})()).resolves.toStrictEqual(undefined);

		await db.execute(sql`drop table ${users}`);
	});

	test('utc config for datetime', async () => {
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

		const rawSelect = await db.execute(sql`select \`datetime_utc\` from \`datestable\``);
		const selectedRow = (rawSelect as unknown as [{ datetime_utc: Date }])[0];

		expect(selectedRow.datetime_utc).toStrictEqual(new Date('2022-11-11 12:12:12.122'));
		expect(new Date(selectedRow.datetime_utc.toISOString())).toStrictEqual(dateUtc);

		expect(res[0]?.datetime).toBeInstanceOf(Date);
		expect(res[0]?.datetimeUTC).toBeInstanceOf(Date);
		expect(typeof res[0]?.datetimeAsString).toStrictEqual('string');

		expect(res).toStrictEqual([{
			datetimeUTC: dateUtc,
			datetime: new Date('2022-11-11'),
			datetimeAsString: '2022-11-11 12:12:12',
		}]);

		await db.execute(sql`drop table if exists \`datestable\``);
	});

	test('set operations (union) from query builder with subquery', async () => {
		await setupSetOperationTest(db);
		const sq = db
			.select({ id: users2Table.id, name: users2Table.name })
			.from(users2Table).as('sq');

		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).union(
				db.select().from(sq),
			).limit(8);

		expect(result).toHaveLength(8);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
			{ id: 1, name: 'John' },
			{ id: 2, name: 'Jane' },
			{ id: 3, name: 'Jack' },
			{ id: 4, name: 'Peter' },
			{ id: 5, name: 'Ben' },
		]);

		// union should throw if selected fields are not in the same order
		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).union(
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (union) as function', async () => {
		await setupSetOperationTest(db);

		const result = await union(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (union all) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).unionAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`)).limit(3);

		expect(result).toHaveLength(3);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2).unionAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test('set operations (union all) as function', async () => {
		await setupSetOperationTest(db);

		const result = await unionAll(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(1);

		expect(result).toHaveLength(1);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
		]);

		await expect((async () => {
			unionAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test('set operations (intersect) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select({ name: citiesTable.name, id: citiesTable.id })
				.from(citiesTable).intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (intersect) as function', async () => {
		await setupSetOperationTest(db);

		const result = await intersect(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(1);

		expect(result).toHaveLength(0);

		expect(result).toStrictEqual([]);

		await expect((async () => {
			intersect(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(1);
		})()).rejects.toThrowError();
	});

	test('set operations (intersect all) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select({ id: citiesTable.id, name: citiesTable.name })
			.from(citiesTable).limit(2).intersectAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).limit(2),
			).orderBy(asc(sql`id`));

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 2, name: 'London' },
		]);

		await expect((async () => {
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).limit(2).intersectAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).limit(2),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test('set operations (intersect all) as function', async () => {
		await setupSetOperationTest(db);

		const result = await intersectAll(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		);

		expect(result).toHaveLength(1);

		expect(result).toStrictEqual([
			{ id: 1, name: 'John' },
		]);

		await expect((async () => {
			intersectAll(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('set operations (except) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select()
			.from(citiesTable).except(
				db
					.select()
					.from(citiesTable).where(gt(citiesTable.id, 1)),
			);

		expect(result).toHaveLength(1);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
		]);
	});

	test('set operations (except) as function', async () => {
		await setupSetOperationTest(db);

		const result = await except(
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable),
			db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).where(eq(citiesTable.id, 1)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(3);

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			except(
				db
					.select({ name: citiesTable.name, id: citiesTable.id })
					.from(citiesTable),
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(3);
		})()).rejects.toThrowError();
	});

	test('set operations (except all) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select()
			.from(citiesTable).exceptAll(
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).where(eq(citiesTable.id, 1)),
			).orderBy(asc(sql`id`));

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select()
				.from(citiesTable).exceptAll(
					db
						.select({ name: citiesTable.name, id: citiesTable.id })
						.from(citiesTable).where(eq(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));
		})()).rejects.toThrowError();
	});

	test('set operations (except all) as function', async () => {
		await setupSetOperationTest(db);

		const result = await exceptAll(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gt(users2Table.id, 7)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
		).limit(6).orderBy(asc(sql.identifier('id')));

		expect(result).toHaveLength(6);

		expect(result).toStrictEqual([
			{ id: 2, name: 'Jane' },
			{ id: 3, name: 'Jack' },
			{ id: 4, name: 'Peter' },
			{ id: 5, name: 'Ben' },
			{ id: 6, name: 'Jill' },
			{ id: 7, name: 'Mary' },
		]);

		await expect((async () => {
			exceptAll(
				db
					.select({ name: users2Table.name, id: users2Table.id })
					.from(users2Table),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(gt(users2Table.id, 7)),
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
			).limit(6);
		})()).rejects.toThrowError();
	});

	test('set operations (mixed) from query builder', async () => {
		await setupSetOperationTest(db);

		const result = await db
			.select()
			.from(citiesTable).except(
				({ unionAll }) =>
					unionAll(
						db
							.select()
							.from(citiesTable).where(gt(citiesTable.id, 1)),
						db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
					).orderBy(asc(citiesTable.id)).limit(1).offset(1),
			);

		expect(result).toHaveLength(2);

		expect(result).toStrictEqual([
			{ id: 1, name: 'New York' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			db
				.select()
				.from(citiesTable).except(
					({ unionAll }) =>
						unionAll(
							db
								.select({ name: citiesTable.name, id: citiesTable.id })
								.from(citiesTable).where(gt(citiesTable.id, 1)),
							db.select().from(citiesTable).where(eq(citiesTable.id, 2)),
						),
				);
		})()).rejects.toThrowError();
	});

	test('set operations (mixed all) as function with subquery', async () => {
		await setupSetOperationTest(db);

		const sq = except(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(gte(users2Table.id, 5)),
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 7)),
		).orderBy(asc(sql.identifier('id'))).as('sq');

		const result = await union(
			db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).where(eq(users2Table.id, 1)),
			db.select().from(sq).limit(1),
			db
				.select().from(citiesTable).where(gt(citiesTable.id, 1)),
		);

		expect(result).toHaveLength(4);

		expect(result).toStrictEqual([
			{ id: 1, name: 'John' },
			{ id: 5, name: 'Ben' },
			{ id: 2, name: 'London' },
			{ id: 3, name: 'Tampa' },
		]);

		await expect((async () => {
			union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				except(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(gte(users2Table.id, 5)),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(users2Table).where(eq(users2Table.id, 7)),
				).limit(1),
				db
					.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			);
		})()).rejects.toThrowError();
	});

	test('aggregate function: count', async () => {
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: count() }).from(table);
		const result2 = await db.select({ value: count(table.a) }).from(table);
		const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

		expect(result1[0]?.value).toStrictEqual(7);
		expect(result2[0]?.value).toStrictEqual(5);
		expect(result3[0]?.value).toStrictEqual(6);
	});

	test('aggregate function: avg', async () => {
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: avg(table.b) }).from(table);
		const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toStrictEqual('33.3333');
		expect(result2[0]?.value).toStrictEqual(null);
		expect(result3[0]?.value).toStrictEqual('42.5000');
	});

	test('aggregate function: sum', async () => {
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: sum(table.b) }).from(table);
		const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
		const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

		expect(result1[0]?.value).toStrictEqual('200');
		expect(result2[0]?.value).toStrictEqual(null);
		expect(result3[0]?.value).toStrictEqual('170');
	});

	test('aggregate function: max', async () => {
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: max(table.b) }).from(table);
		const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toStrictEqual(90);
		expect(result2[0]?.value).toStrictEqual(null);
	});

	test('aggregate function: min', async () => {
		const table = aggregateTable;
		await setupAggregateFunctionsTest(db);

		const result1 = await db.select({ value: min(table.b) }).from(table);
		const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

		expect(result1[0]?.value).toStrictEqual(10);
		expect(result2[0]?.value).toStrictEqual(null);
	});

	test('test $onUpdateFn and $onUpdate works as $default', async () => {
		await db.execute(sql`drop table if exists ${usersOnUpdate}`);

		await db.execute(
			sql`
				create table ${usersOnUpdate} (
				id serial not null primary key,
				name text not null,
				update_counter integer default 1 not null,
				updated_at datetime(3),
				uppercase_name text,
				always_null text
				)
			`,
		);

		await db.insert(usersOnUpdate).values([
			{ name: 'John' },
			{ name: 'Jane' },
			{ name: 'Jack' },
			{ name: 'Jill' },
		]);
		const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);

		const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

		const response = await db.select({ ...rest }).from(usersOnUpdate);

		expect(response).toStrictEqual([
			{ name: 'John', id: 1, updateCounter: 1, uppercaseName: 'JOHN', alwaysNull: null },
			{ name: 'Jane', id: 2, updateCounter: 1, uppercaseName: 'JANE', alwaysNull: null },
			{ name: 'Jack', id: 3, updateCounter: 1, uppercaseName: 'JACK', alwaysNull: null },
			{ name: 'Jill', id: 4, updateCounter: 1, uppercaseName: 'JILL', alwaysNull: null },
		]);
		const msDelay = 750;

		for (const eachUser of justDates) {
			expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		}
	});

	test('test $onUpdateFn and $onUpdate works updating', async () => {
		await db.execute(sql`drop table if exists ${usersOnUpdate}`);

		await db.execute(
			sql`
				create table ${usersOnUpdate} (
				id serial not null primary key,
				name text not null,
				update_counter integer default 1 not null,
				updated_at datetime(3),
				uppercase_name text,
				always_null text
				)
			`,
		);

		await db.insert(usersOnUpdate).values([
			{ name: 'John', alwaysNull: 'this will will be null after updating' },
			{ name: 'Jane' },
			{ name: 'Jack' },
			{ name: 'Jill' },
		]);
		const { updatedAt, ...rest } = getTableColumns(usersOnUpdate);
		const initial = await db.select({ updatedAt }).from(usersOnUpdate);

		await db.update(usersOnUpdate).set({ name: 'Angel', uppercaseName: null }).where(eq(usersOnUpdate.id, 1));

		const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

		const response = await db.select({ ...rest }).from(usersOnUpdate);

		expect(response).toStrictEqual([
			{ name: 'Angel', id: 1, updateCounter: 2, uppercaseName: null, alwaysNull: null },
			{ name: 'Jane', id: 2, updateCounter: 1, uppercaseName: 'JANE', alwaysNull: null },
			{ name: 'Jack', id: 3, updateCounter: 1, uppercaseName: 'JACK', alwaysNull: null },
			{ name: 'Jill', id: 4, updateCounter: 1, uppercaseName: 'JILL', alwaysNull: null },
		]);
		const msDelay = 750;

		expect(initial[0]?.updatedAt?.valueOf()).not.toStrictEqual(justDates[0]?.updatedAt?.valueOf());

		for (const eachUser of justDates) {
			expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
		}
	});

	// mySchema tests
	test('mySchema :: select all fields', async () => {
		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const result = await db.select().from(usersMySchemaTable);

		expect(result[0]!.createdAt).toBeInstanceOf(Date);
		// not timezone based timestamp, thats why it should not work here
		// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test('mySchema :: select sql', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.select({
			name: sql`upper(${usersMySchemaTable.name})`,
		}).from(usersMySchemaTable);

		expect(users).toStrictEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select typed sql', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.select({
			name: sql<string>`upper(${usersMySchemaTable.name})`,
		}).from(usersMySchemaTable);

		expect(users).toStrictEqual([{ name: 'JOHN' }]);
	});

	test('mySchema :: select distinct', async () => {
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

		expect(users).toStrictEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
	});

	test('mySchema :: insert returning sql', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		const result = await db.insert(usersMySchemaTable).values({ name: 'John' });

		expect(result['lastInsertRowid']).toStrictEqual(1);
	});

	test('mySchema :: delete returning sql', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const users = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

		expect(users['affectedRows']).toStrictEqual(1);
	});

	test('mySchema :: update with returning partial', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const updatedUsers = await db.update(usersMySchemaTable).set({ name: 'Jane' }).where(
			eq(usersMySchemaTable.name, 'John'),
		);

		const users = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		)
			.where(
				eq(usersMySchemaTable.id, 1),
			);

		expect(updatedUsers['affectedRows']).toStrictEqual(1);

		expect(users).toStrictEqual([{ id: 1, name: 'Jane' }]);
	});

	test('mySchema :: delete with returning all fields', async () => {
		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const deletedUser = await db.delete(usersMySchemaTable).where(eq(usersMySchemaTable.name, 'John'));

		expect(deletedUser['affectedRows']).toStrictEqual(1);
	});

	test('mySchema :: insert + select', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const result = await db.select().from(usersMySchemaTable);
		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: false,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);

		await db.insert(usersMySchemaTable).values({ name: 'Jane' });
		const result2 = await db.select().from(usersMySchemaTable);
		expect(result2).toStrictEqual([
			{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
			{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
		]);
	});

	test('mySchema :: insert with overridden default values', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John', verified: true });
		const result = await db.select().from(usersMySchemaTable);

		expect(result).toStrictEqual([{
			id: 1,
			name: 'John',
			verified: true,
			jsonb: null,
			createdAt: result[0]!.createdAt,
		}]);
	});

	test('mySchema :: insert many', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([
			{ name: 'John' },
			{ name: 'Bruce', jsonb: ['foo', 'bar'] },
			{ name: 'Jane' },
			{ name: 'Austin', verified: true },
		]);
		const result = await db.select({
			id: usersMySchemaTable.id,
			name: usersMySchemaTable.name,
			jsonb: usersMySchemaTable.jsonb,
			verified: usersMySchemaTable.verified,
		}).from(usersMySchemaTable);

		expect(result).toStrictEqual([
			{ id: 1, name: 'John', jsonb: null, verified: false },
			{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
			{ id: 3, name: 'Jane', jsonb: null, verified: false },
			{ id: 4, name: 'Austin', jsonb: null, verified: true },
		]);
	});

	test('mySchema :: select with group by as field', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.name);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }]);
	});

	test('mySchema :: select with group by as column + sql', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

		const result = await db.select({ name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id, sql`${usersMySchemaTable.name}`);

		expect(result).toStrictEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
	});

	test('mySchema :: build query', async () => {
		const query = db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(usersMySchemaTable)
			.groupBy(usersMySchemaTable.id, usersMySchemaTable.name)
			.toSQL();

		expect(query).toStrictEqual({
			sql:
				`select \`id\`, \`name\` from \`mySchema\`.\`userstest\` group by \`mySchema\`.\`userstest\`.\`id\`, \`mySchema\`.\`userstest\`.\`name\``,
			params: [],
		});
	});

	test('mySchema :: insert with spaces', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: sql`'Jo   h     n'` });
		const result = await db.select({ id: usersMySchemaTable.id, name: usersMySchemaTable.name }).from(
			usersMySchemaTable,
		);

		expect(result).toStrictEqual([{ id: 1, name: 'Jo   h     n' }]);
	});

	test('mySchema :: prepared statement with placeholder in .where', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.insert(usersMySchemaTable).values({ name: 'John' });
		const stmt = db.select({
			id: usersMySchemaTable.id,
			name: usersMySchemaTable.name,
		}).from(usersMySchemaTable)
			.where(eq(usersMySchemaTable.id, sql.placeholder('id')))
			.prepare();
		const result = await stmt.execute({ id: 1 });

		expect(result).toStrictEqual([{ id: 1, name: 'John' }]);
	});

	test('mySchema :: select from tables with same name from different schema using alias', async () => {
		await db.execute(sql`truncate table \`mySchema\`.\`userstest\``);

		await db.execute(sql`drop table if exists \`userstest\``);
		await db.execute(
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

		await db.insert(usersMySchemaTable).values({ id: 10, name: 'Ivan' });
		await db.insert(usersTable).values({ id: 11, name: 'Hans' });

		const customerAlias = alias(usersTable, 'customer');

		const result = await db
			.select().from(usersMySchemaTable)
			.leftJoin(customerAlias, eq(customerAlias.id, 11))
			.where(eq(usersMySchemaTable.id, 10));

		expect(result).toStrictEqual([{
			userstest: {
				id: 10,
				name: 'Ivan',
				verified: false,
				jsonb: null,
				createdAt: result[0]!.userstest.createdAt,
			},
			customer: {
				id: 11,
				name: 'Hans',
				verified: false,
				jsonb: null,
				createdAt: result[0]!.customer!.createdAt,
			},
		}]);
	});

	test('insert $returningId: serial as id', async () => {
		const result = await db.insert(usersTable).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test('insert $returningId: serial as id, not first column', async () => {
		const usersTableDefNotFirstColumn = mysqlTable('users2', {
			name: text('name').notNull(),
			id: serial('id').primaryKey(),
		});

		const result = await db.insert(usersTableDefNotFirstColumn).values({ name: 'John' }).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }]);
	});

	test('insert $returningId: serial as id, batch insert', async () => {
		const result = await db.insert(usersTable).values([{ name: 'John' }, { name: 'John1' }]).$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			id: number;
		}[]>();

		expect(result).toStrictEqual([{ id: 1 }, { id: 2 }]);
	});

	test('insert $returningId: $default as primary key', async () => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(db);

		const result = await db.insert(usersTableDefFn).values([{ name: 'John' }, { name: 'John1' }])
			.$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			customId: string;
		}[]>();

		expect(result).toStrictEqual([{ customId: 'ao865jf3mcmkfkk8o5ri495z' }, {
			customId: 'dyqs529eom0iczo2efxzbcut',
		}]);
	});

	test('insert $returningId: $default as primary key with value', async () => {
		const uniqueKeys = ['ao865jf3mcmkfkk8o5ri495z', 'dyqs529eom0iczo2efxzbcut'];
		let iterator = 0;

		const usersTableDefFn = mysqlTable('users_default_fn', {
			customId: varchar('id', { length: 256 }).primaryKey().$defaultFn(() => {
				const value = uniqueKeys[iterator]!;
				iterator++;
				return value;
			}),
			name: text('name').notNull(),
		});

		await setupReturningFunctionsTest(db);

		const result = await db.insert(usersTableDefFn).values([{ name: 'John', customId: 'test' }, { name: 'John1' }])
			//    ^?
			.$returningId();

		expectTypeOf(result).toEqualTypeOf<{
			customId: string;
		}[]>();

		expect(result).toStrictEqual([{ customId: 'test' }, { customId: 'ao865jf3mcmkfkk8o5ri495z' }]);
	});

	test('mySchema :: view', async () => {
		const newYorkers1 = mySchema.view('new_yorkers')
			.as((qb) => qb.select().from(users2MySchemaTable).where(eq(users2MySchemaTable.cityId, 1)));

		const newYorkers2 = mySchema.view('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).as(sql`select * from ${users2MySchemaTable} where ${eq(users2MySchemaTable.cityId, 1)}`);

		const newYorkers3 = mySchema.view('new_yorkers', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			cityId: int('city_id').notNull(),
		}).existing();

		await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

		await db.insert(citiesMySchemaTable).values([{ name: 'New York' }, { name: 'Paris' }]);

		await db.insert(users2MySchemaTable).values([
			{ name: 'John', cityId: 1 },
			{ name: 'Jane', cityId: 1 },
			{ name: 'Jack', cityId: 2 },
		]);

		{
			const result = await db.select().from(newYorkers1);
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers2);
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select().from(newYorkers3);
			expect(result).toStrictEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
			]);
		}

		{
			const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
			expect(result).toStrictEqual([
				{ name: 'John' },
				{ name: 'Jane' },
			]);
		}

		await db.execute(sql`drop view ${newYorkers1}`);
	});

	test('$count separate', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual(4);
	});

	test('$count embedded', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.select({
			count: db.$count(countTestTable),
		}).from(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual([
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
		]);
	});

	test('$count separate reuse', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = db.$count(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id: 6, name: 'sixth' });

		const count3 = await count;

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count1).toStrictEqual(4);
		expect(count2).toStrictEqual(5);
		expect(count3).toStrictEqual(6);
	});

	test('$count embedded reuse', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = db.select({
			count: db.$count(countTestTable),
		}).from(countTestTable);

		const count1 = await count;

		await db.insert(countTestTable).values({ id: 5, name: 'fifth' });

		const count2 = await count;

		await db.insert(countTestTable).values({ id: 6, name: 'sixth' });

		const count3 = await count;

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count1).toStrictEqual([
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
			{ count: 4 },
		]);
		expect(count2).toStrictEqual([
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
			{ count: 5 },
		]);
		expect(count3).toStrictEqual([
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
			{ count: 6 },
		]);
	});

	test('$count separate with filters', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.$count(countTestTable, gt(countTestTable.id, 1));

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual(3);
	});

	test('$count embedded with filters', async () => {
		const countTestTable = mysqlTable('count_test', {
			id: int('id').notNull(),
			name: text('name').notNull(),
		});

		await db.execute(sql`drop table if exists ${countTestTable}`);
		await db.execute(sql`create table ${countTestTable} (id int, name text)`);

		await db.insert(countTestTable).values([
			{ id: 1, name: 'First' },
			{ id: 2, name: 'Second' },
			{ id: 3, name: 'Third' },
			{ id: 4, name: 'Fourth' },
		]);

		const count = await db.select({
			count: db.$count(countTestTable, gt(countTestTable.id, 1)),
		}).from(countTestTable);

		await db.execute(sql`drop table ${countTestTable}`);

		expect(count).toStrictEqual([
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
			{ count: 3 },
		]);
	});

	test('limit 0', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db
			.select()
			.from(usersTable)
			.limit(0);

		expect(users).toStrictEqual([]);
	});

	test('limit -1', async () => {
		await db.insert(usersTable).values({ name: 'John' });
		const users = await db
			.select()
			.from(usersTable)
			.limit(-1);

		expect(users.length).toBeGreaterThan(0);
	});

	test('define constraints as array', async () => {
		const table = mysqlTable('name', {
			id: int(),
		}, (t) => [
			index('name').on(t.id),
			primaryKey({ columns: [t.id] }),
		]);

		const { indexes, primaryKeys } = getTableConfig(table);

		expect(indexes.length).toStrictEqual(1);
		expect(primaryKeys.length).toStrictEqual(1);
	});

	test('define constraints as array inside third param', async () => {
		const table = mysqlTable('name', {
			id: int(),
		}, (t) => [
			[index('name').on(t.id), primaryKey({ columns: [t.id] })],
		]);

		const { indexes, primaryKeys } = getTableConfig(table);

		expect(indexes.length).toStrictEqual(1);
		expect(primaryKeys.length).toStrictEqual(1);
	});

	test('update with limit and order by', async () => {
		await db.insert(usersTable).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.update(usersTable).set({ verified: true }).limit(2).orderBy(asc(usersTable.name));

		const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
			asc(usersTable.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Alan', verified: true },
			{ name: 'Barry', verified: true },
			{ name: 'Carl', verified: false },
		]);
	});

	test('delete with limit and order by', async () => {
		await db.insert(usersTable).values([
			{ name: 'Barry', verified: false },
			{ name: 'Alan', verified: false },
			{ name: 'Carl', verified: false },
		]);

		await db.delete(usersTable).where(eq(usersTable.verified, false)).limit(1).orderBy(asc(usersTable.name));

		const result = await db.select({ name: usersTable.name, verified: usersTable.verified }).from(usersTable).orderBy(
			asc(usersTable.name),
		);
		expect(result).toStrictEqual([
			{ name: 'Barry', verified: false },
			{ name: 'Carl', verified: false },
		]);
	});

	test('Object keys as column names', async () => {
		// Tests the following:
		// Column with required config
		// Column with optional config without providing a value
		// Column with optional config providing a value
		// Column without config
		const users = mysqlTable('users', {
			id: bigint({ mode: 'number' }).autoincrement().primaryKey(),
			createdAt: timestamp(),
			updatedAt: timestamp({ fsp: 3 }),
			admin: boolean(),
		});

		await db.execute(sql`drop table if exists users`);
		await db.execute(
			sql`
				create table users (
					\`id\` bigint auto_increment primary key,
					\`createdAt\` timestamp,
					\`updatedAt\` timestamp(3),
					\`admin\` boolean
				)
			`,
		);

		await db.insert(users).values([
			{ createdAt: sql`now() - interval 30 day`, updatedAt: sql`now() - interval 1 day`, admin: true },
			{ createdAt: sql`now() - interval 1 day`, updatedAt: sql`now() - interval 30 day`, admin: true },
			{ createdAt: sql`now() - interval 1 day`, updatedAt: sql`now() - interval 1 day`, admin: false },
		]);
		const result = await db
			.select({ id: users.id, admin: users.admin })
			.from(users)
			.where(
				and(
					gt(users.createdAt, sql`now() - interval 7 day`),
					gt(users.updatedAt, sql`now() - interval 7 day`),
				),
			);

		expect(result).toStrictEqual([
			{ id: 3, admin: false },
		]);

		await db.execute(sql`drop table users`);
	});

	test('cross join', async () => {
		await db
			.insert(usersTable)
			.values([
				{ name: 'John' },
				{ name: 'Jane' },
			]);

		await db
			.insert(citiesTable)
			.values([
				{ name: 'Seattle' },
				{ name: 'New York City' },
			]);

		const result = await db
			.select({
				user: usersTable.name,
				city: citiesTable.name,
			})
			.from(usersTable)
			.crossJoin(citiesTable)
			.orderBy(usersTable.name, citiesTable.name);

		expect(result).toStrictEqual([
			{ city: 'New York City', user: 'Jane' },
			{ city: 'Seattle', user: 'Jane' },
			{ city: 'New York City', user: 'John' },
			{ city: 'Seattle', user: 'John' },
		]);
	});

	test('left join (lateral)', async () => {
		await db
			.insert(citiesTable)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

		await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.leftJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
			{ cityId: 2, cityName: 'London', userId: null, userName: null },
		]);
	});

	test('inner join (lateral)', async () => {
		await db
			.insert(citiesTable)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

		await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }]);

		const sq = db
			.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(eq(users2Table.cityId, citiesTable.id))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.innerJoinLateral(sq, sql`true`);

		expect(res).toStrictEqual([
			{ cityId: 1, cityName: 'Paris', userId: 1, userName: 'John' },
		]);
	});

	test('cross join (lateral)', async () => {
		await db
			.insert(citiesTable)
			.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }, { id: 3, name: 'Berlin' }]);

		await db.insert(users2Table).values([{ name: 'John', cityId: 1 }, { name: 'Jane' }, {
			name: 'Patrick',
			cityId: 2,
		}]);

		const sq = db
			.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: users2Table.cityId,
			})
			.from(users2Table)
			.where(not(like(citiesTable.name, 'L%')))
			.as('sq');

		const res = await db
			.select({
				cityId: citiesTable.id,
				cityName: citiesTable.name,
				userId: sq.userId,
				userName: sq.userName,
			})
			.from(citiesTable)
			.crossJoinLateral(sq)
			.orderBy(citiesTable.id, sq.userId);

		expect(res).toStrictEqual([
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 1,
				userName: 'John',
			},
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 2,
				userName: 'Jane',
			},
			{
				cityId: 1,
				cityName: 'Paris',
				userId: 3,
				userName: 'Patrick',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 1,
				userName: 'John',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 2,
				userName: 'Jane',
			},
			{
				cityId: 3,
				cityName: 'Berlin',
				userId: 3,
				userName: 'Patrick',
			},
		]);
	});

	test('RQB v2 simple find first - no rows', async () => {
		const result = await db.query.rqbUser.findFirst();

		expect(result).toStrictEqual(undefined);
	});

	test('RQB v2 simple find first - multiple rows', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const result = await db.query.rqbUser.findFirst({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});

	test('RQB v2 simple find first - with relation', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.insert(rqbPost).values([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
		}]);

		const result = await db.query.rqbUser.findFirst({
			with: {
				posts: {
					orderBy: {
						id: 'asc',
					},
				},
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual({
			id: 1,
			createdAt: date,
			name: 'First',
			posts: [{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
			}],
		});
	});

	test('RQB v2 simple find first - placeholders', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const query = db.query.rqbUser.findFirst({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual({
			id: 2,
			createdAt: date,
			name: 'Second',
		});
	});

	test('RQB v2 simple find many - no rows', async () => {
		const result = await db.query.rqbUser.findMany();

		expect(result).toStrictEqual([]);
	});

	test('RQB v2 simple find many - multiple rows', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const result = await db.query.rqbUser.findMany({
			orderBy: {
				id: 'desc',
			},
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: date,
			name: 'Second',
		}, {
			id: 1,
			createdAt: date,
			name: 'First',
		}]);
	});

	test('RQB v2 simple find many - with relation', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.insert(rqbPost).values([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
		}]);

		const result = await db.query.rqbPost.findMany({
			with: {
				author: true,
			},
			orderBy: {
				id: 'asc',
			},
		});

		expect(result).toStrictEqual([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
			author: {
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
			author: {
				id: 1,
				createdAt: date,
				name: 'First',
			},
		}]);
	});

	test('RQB v2 simple find many - placeholders', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		const query = db.query.rqbUser.findMany({
			where: {
				id: {
					eq: sql.placeholder('filter'),
				},
			},
			orderBy: {
				id: 'asc',
			},
		}).prepare();

		const result = await query.execute({
			filter: 2,
		});

		expect(result).toStrictEqual([{
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);
	});

	test('RQB v2 transaction find first - no rows', async () => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst();

			expect(result).toStrictEqual(undefined);
		});
	});

	test('RQB v2 transaction find first - multiple rows', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find first - with relation', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.insert(rqbPost).values([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findFirst({
				with: {
					posts: {
						orderBy: {
							id: 'asc',
						},
					},
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual({
				id: 1,
				createdAt: date,
				name: 'First',
				posts: [{
					id: 1,
					userId: 1,
					createdAt: date,
					content: null,
				}, {
					id: 2,
					userId: 1,
					createdAt: date,
					content: 'Has message this time',
				}],
			});
		});
	});

	test('RQB v2 transaction find first - placeholders', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const query = db.query.rqbUser.findFirst({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual({
				id: 2,
				createdAt: date,
				name: 'Second',
			});
		});
	});

	test('RQB v2 transaction find many - no rows', async () => {
		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findMany();

			expect(result).toStrictEqual([]);
		});
	});

	test('RQB v2 transaction find many - multiple rows', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbUser.findMany({
				orderBy: {
					id: 'desc',
				},
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}, {
				id: 1,
				createdAt: date,
				name: 'First',
			}]);
		});
	});

	test('RQB v2 transaction find many - with relation', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.insert(rqbPost).values([{
			id: 1,
			userId: 1,
			createdAt: date,
			content: null,
		}, {
			id: 2,
			userId: 1,
			createdAt: date,
			content: 'Has message this time',
		}]);

		await db.transaction(async (db) => {
			const result = await db.query.rqbPost.findMany({
				with: {
					author: true,
				},
				orderBy: {
					id: 'asc',
				},
			});

			expect(result).toStrictEqual([{
				id: 1,
				userId: 1,
				createdAt: date,
				content: null,
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}, {
				id: 2,
				userId: 1,
				createdAt: date,
				content: 'Has message this time',
				author: {
					id: 1,
					createdAt: date,
					name: 'First',
				},
			}]);
		});
	});

	test('RQB v2 transaction find many - placeholders', async () => {
		const date = new Date(120000);

		await db.insert(rqbUser).values([{
			id: 1,
			createdAt: date,
			name: 'First',
		}, {
			id: 2,
			createdAt: date,
			name: 'Second',
		}]);

		await db.transaction(async (db) => {
			const query = db.query.rqbUser.findMany({
				where: {
					id: {
						eq: sql.placeholder('filter'),
					},
				},
				orderBy: {
					id: 'asc',
				},
			}).prepare();

			const result = await query.execute({
				filter: 2,
			});

			expect(result).toStrictEqual([{
				id: 2,
				createdAt: date,
				name: 'Second',
			}]);
		});
	});

	test('all types', async () => {
		await db.execute(sql`
			CREATE TABLE \`all_types\` (
					\`serial\` serial AUTO_INCREMENT,
					\`bigint53\` bigint,
					\`bigint64\` bigint,
					\`binary\` binary,
					\`boolean\` boolean,
					\`char\` char,
					\`date\` date,
					\`date_str\` date,
					\`datetime\` datetime,
					\`datetime_str\` datetime,
					\`decimal\` decimal,
					\`decimal_num\` decimal(30),
					\`decimal_big\` decimal(30),
					\`double\` double,
					\`float\` float,
					\`int\` int,
					\`json\` json,
					\`med_int\` mediumint,
					\`small_int\` smallint,
					\`real\` real,
					\`text\` text,
					\`time\` time,
					\`timestamp\` timestamp,
					\`timestamp_str\` timestamp,
					\`tiny_int\` tinyint,
					\`varbin\` varbinary(16),
					\`varchar\` varchar(255),
					\`year\` year,
					\`enum\` enum('enV1','enV2')
				);
		`);

		await db.insert(allTypesTable).values({
			serial: 1,
			bigint53: 9007199254740991,
			bigint64: 5044565289845416380n,
			binary: '1',
			boolean: true,
			char: 'c',
			date: new Date(1741743161623),
			dateStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			datetime: new Date(1741743161623),
			datetimeStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			decimal: '47521',
			decimalNum: 9007199254740991,
			decimalBig: 5044565289845416380n,
			double: 15.35325689124218,
			enum: 'enV1',
			float: 1.048596,
			real: 1.048596,
			text: 'C4-',
			int: 621,
			json: {
				str: 'strval',
				arr: ['str', 10],
			},
			medInt: 560,
			smallInt: 14,
			time: '04:13:22',
			timestamp: new Date(1741743161623),
			timestampStr: new Date(1741743161623).toISOString().slice(0, 19).replace('T', ' '),
			tinyInt: 7,
			varbin: '1010110101001101',
			varchar: 'VCHAR',
			year: 2025,
		});

		const rawRes = await db.select().from(allTypesTable);

		type ExpectedType = {
			serial: number;
			bigint53: number | null;
			bigint64: bigint | null;
			binary: string | null;
			boolean: boolean | null;
			char: string | null;
			date: Date | null;
			dateStr: string | null;
			datetime: Date | null;
			datetimeStr: string | null;
			decimal: string | null;
			decimalNum: number | null;
			decimalBig: bigint | null;
			double: number | null;
			float: number | null;
			int: number | null;
			json: unknown;
			medInt: number | null;
			smallInt: number | null;
			real: number | null;
			text: string | null;
			time: string | null;
			timestamp: Date | null;
			timestampStr: string | null;
			tinyInt: number | null;
			varbin: string | null;
			varchar: string | null;
			year: number | null;
			enum: 'enV1' | 'enV2' | null;
		}[];

		const expectedRes: ExpectedType = [
			{
				serial: 1,
				bigint53: 9007199254740991,
				bigint64: 5044565289845416380n,
				binary: '1',
				boolean: true,
				char: 'c',
				date: new Date('2025-03-12T00:00:00.000Z'),
				dateStr: '2025-03-12',
				datetime: new Date('2025-03-12T01:32:42.000Z'),
				datetimeStr: '2025-03-12 01:32:41',
				decimal: '47521',
				decimalNum: 9007199254740991,
				decimalBig: 5044565289845416380n,
				double: 15.35325689124218,
				float: 1.0486,
				int: 621,
				json: { arr: ['str', 10], str: 'strval' },
				medInt: 560,
				smallInt: 14,
				real: 1.048596,
				text: 'C4-',
				time: '04:13:22',
				timestamp: new Date('2025-03-12T01:32:42.000Z'),
				timestampStr: '2025-03-12 01:32:41',
				tinyInt: 7,
				varbin: '1010110101001101',
				varchar: 'VCHAR',
				year: 2025,
				enum: 'enV1',
			},
		];

		expectTypeOf(rawRes).toEqualTypeOf<ExpectedType>();
		expect(rawRes).toStrictEqual(expectedRes);
	});
});

test('insert into ... select', async () => {
	const notifications = mysqlTable('notifications', {
		id: serial('id').primaryKey(),
		sentAt: timestamp('sent_at').notNull().defaultNow(),
		message: text('message').notNull(),
	});
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const userNotications = mysqlTable('user_notifications', {
		userId: int('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
		notificationId: int('notification_id').notNull().references(() => notifications.id, { onDelete: 'cascade' }),
	}, (t) => ({
		pk: primaryKey({ columns: [t.userId, t.notificationId] }),
	}));

	await db.execute(sql`drop table if exists ${notifications}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`drop table if exists ${userNotications}`);
	await db.execute(sql`
		create table ${notifications} (
			\`id\` serial primary key,
			\`sent_at\` timestamp not null default now(),
			\`message\` text not null
		)
	`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` text not null
		)
	`);
	await db.execute(sql`
		create table ${userNotications} (
			\`user_id\` int references users(id) on delete cascade,
			\`notification_id\` int references notifications(id) on delete cascade,
			primary key (user_id, notification_id)
		)
	`);

	await db
		.insert(notifications)
		.values({ message: 'You are one of the 3 lucky winners!' });
	const newNotification = await db
		.select({ id: notifications.id })
		.from(notifications)
		.then((result) => result[0]);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await db
		.insert(userNotications)
		.select(
			db
				.select({
					userId: users.id,
					notificationId: sql`(${newNotification!.id})`.as('notification_id'),
				})
				.from(users)
				.where(inArray(users.name, ['Alice', 'Charlie', 'Eve']))
				.orderBy(asc(users.id)),
		);
	const sentNotifications = await db.select().from(userNotications);

	expect(sentNotifications).toStrictEqual([
		{ userId: 1, notificationId: newNotification!.id },
		{ userId: 3, notificationId: newNotification!.id },
		{ userId: 5, notificationId: newNotification!.id },
	]);
});

test('insert into ... select with keys in different order', async () => {
	const users1 = mysqlTable('users1', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});
	const users2 = mysqlTable('users2', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users1}`);
	await db.execute(sql`drop table if exists ${users2}`);
	await db.execute(sql`
		create table ${users1} (
			\`id\` serial primary key,
			\`name\` text not null
		)
	`);
	await db.execute(sql`
		create table ${users2} (
			\`id\` serial primary key,
			\`name\` text not null
		)
	`);

	expect(
		() =>
			db
				.insert(users1)
				.select(
					db
						.select({
							name: users2.name,
							id: users2.id,
						})
						.from(users2),
				),
	).toThrowError();
});

test('MySqlTable :: select with `use index` hint', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	}, () => [usersTableNameIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	const result = await db.select()
		.from(users, {
			useIndex: [usersTableNameIndex],
		})
		.where(eq(users.name, 'David'));

	expect(result).toHaveLength(1);
	expect(result).toStrictEqual([{ id: 4, name: 'David' }]);
});

test('MySqlTable :: select with `use index` hint on 1 index', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	}, () => [usersTableNameIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);

	const query = db.select()
		.from(users, {
			useIndex: usersTableNameIndex,
		})
		.where(eq(users.name, 'David'))
		.toSQL();

	expect(query.sql).toInclude('USE INDEX (users_name_index)');
});

test('MySqlTable :: select with `use index` hint on multiple indexes', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
		age: int('age').notNull(),
	}, () => [usersTableNameIndex, usersTableAgeIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);
	const usersTableAgeIndex = index('users_age_index').on(users.age);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null,
			\`age\` int not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);
	await db.execute(sql`create index users_age_index ON users(age)`);

	const query = db.select()
		.from(users, {
			useIndex: [usersTableNameIndex, usersTableAgeIndex],
		})
		.where(eq(users.name, 'David'))
		.toSQL();

	expect(query.sql).toInclude('USE INDEX (users_name_index, users_age_index)');
});

test('MySqlTable :: select with `use index` hint on not existed index', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	}, () => [usersTableNameIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await expect((async () => {
		return await db.select()
			.from(users, {
				useIndex: ['some_other_index'],
			})
			.where(eq(users.name, 'David'));
	})()).rejects.toThrowError();
});

test('MySqlTable :: select with `use index` + `force index` incompatible hints', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
		age: int('age').notNull(),
	}, () => [usersTableNameIndex, usersTableAgeIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);
	const usersTableAgeIndex = index('users_age_index').on(users.age);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null,
			\`age\` int not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);
	await db.execute(sql`create index users_age_index ON users(age)`);

	await db.insert(users).values([
		{ name: 'Alice', age: 18 },
		{ name: 'Bob', age: 19 },
		{ name: 'Charlie', age: 20 },
		{ name: 'David', age: 21 },
		{ name: 'Eve', age: 22 },
	]);

	await expect((async () => {
		return await db.select()
			.from(users, {
				useIndex: [usersTableNameIndex],
				forceIndex: [usersTableAgeIndex],
			})
			.where(eq(users.name, 'David'));
	})()).rejects.toThrowError();
});

test('MySqlTable :: select with join `use index` hint', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await db.insert(posts).values([
		{ text: 'Alice post', userId: 1 },
		{ text: 'Bob post', userId: 2 },
		{ text: 'Charlie post', userId: 3 },
		{ text: 'David post', userId: 4 },
		{ text: 'Eve post', userId: 5 },
	]);

	const result = await db.select({
		userId: users.id,
		name: users.name,
		postId: posts.id,
		text: posts.text,
	})
		.from(users)
		.leftJoin(posts, eq(users.id, posts.userId), {
			useIndex: [postsTableUserIdIndex],
		})
		.where(and(
			eq(users.name, 'David'),
			eq(posts.text, 'David post'),
		));

	expect(result).toHaveLength(1);
	expect(result).toStrictEqual([{ userId: 4, name: 'David', postId: 4, text: 'David post' }]);
});

test('MySqlTable :: select with join `use index` hint on 1 index', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	const query = db.select({
		userId: users.id,
		name: users.name,
		postId: posts.id,
		text: posts.text,
	})
		.from(users)
		.leftJoin(posts, eq(users.id, posts.userId), {
			useIndex: postsTableUserIdIndex,
		})
		.where(and(
			eq(users.name, 'David'),
			eq(posts.text, 'David post'),
		)).toSQL();

	expect(query.sql).toInclude('USE INDEX (posts_user_id_index)');
});

test('MySqlTable :: select with cross join `use index` hint', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	await db.insert(users).values([
		{ id: 1, name: 'Alice' },
		{ id: 2, name: 'Bob' },
	]);

	await db.insert(posts).values([
		{ id: 1, text: 'Alice post', userId: 1 },
		{ id: 2, text: 'Bob post', userId: 2 },
	]);

	const result = await db.select()
		.from(users)
		.crossJoin(posts, {
			useIndex: [postsTableUserIdIndex],
		})
		.orderBy(users.id, posts.id);

	expect(result).toStrictEqual([{
		users: { id: 1, name: 'Alice' },
		posts: { id: 1, text: 'Alice post', userId: 1 },
	}, {
		users: { id: 1, name: 'Alice' },
		posts: { id: 2, text: 'Bob post', userId: 2 },
	}, {
		users: { id: 2, name: 'Bob' },
		posts: { id: 1, text: 'Alice post', userId: 1 },
	}, {
		users: { id: 2, name: 'Bob' },
		posts: { id: 2, text: 'Bob post', userId: 2 },
	}]);
});

test('MySqlTable :: select with cross join `use index` hint on 1 index', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	const query = db.select({
		userId: users.id,
		name: users.name,
		postId: posts.id,
		text: posts.text,
	})
		.from(users)
		.crossJoin(posts, {
			useIndex: postsTableUserIdIndex,
		})
		.where(and(
			eq(users.name, 'David'),
			eq(posts.text, 'David post'),
		)).toSQL();

	expect(query.sql).toInclude('USE INDEX (posts_user_id_index)');
});

test('MySqlTable :: select with join `use index` hint on multiple indexes', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex, postsTableTextIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);
	const postsTableTextIndex = index('posts_text_index').on(posts.text);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);
	await db.execute(sql`create index posts_text_index ON posts(text)`);

	const query = db.select({
		userId: users.id,
		name: users.name,
		postId: posts.id,
		text: posts.text,
	})
		.from(users)
		.leftJoin(posts, eq(users.id, posts.userId), {
			useIndex: [postsTableUserIdIndex, postsTableTextIndex],
		})
		.where(and(
			eq(users.name, 'David'),
			eq(posts.text, 'David post'),
		)).toSQL();

	expect(query.sql).toInclude('USE INDEX (posts_user_id_index, posts_text_index)');
});

test('MySqlTable :: select with join `use index` hint on not existed index', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await db.insert(posts).values([
		{ text: 'Alice post', userId: 1 },
		{ text: 'Bob post', userId: 2 },
		{ text: 'Charlie post', userId: 3 },
		{ text: 'David post', userId: 4 },
		{ text: 'Eve post', userId: 5 },
	]);

	await expect((async () => {
		return await db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: ['some_other_index'],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			));
	})()).rejects.toThrowError();
});

test('MySqlTable :: select with join `use index` + `force index` incompatible hints', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex, postsTableTextIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);
	const postsTableTextIndex = index('posts_text_index').on(posts.text);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);
	await db.execute(sql`create index posts_text_index ON posts(text)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await db.insert(posts).values([
		{ text: 'Alice post', userId: 1 },
		{ text: 'Bob post', userId: 2 },
		{ text: 'Charlie post', userId: 3 },
		{ text: 'David post', userId: 4 },
		{ text: 'Eve post', userId: 5 },
	]);

	await expect((async () => {
		return await db.select({
			userId: users.id,
			name: users.name,
			postId: posts.id,
			text: posts.text,
		})
			.from(users)
			.leftJoin(posts, eq(users.id, posts.userId), {
				useIndex: [postsTableUserIdIndex],
				forceIndex: [postsTableTextIndex],
			})
			.where(and(
				eq(users.name, 'David'),
				eq(posts.text, 'David post'),
			));
	})()).rejects.toThrowError();
});

test('MySqlTable :: select with Subquery join `use index`', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	await db.insert(users).values([
		{ name: 'Alice' },
		{ name: 'Bob' },
		{ name: 'Charlie' },
		{ name: 'David' },
		{ name: 'Eve' },
	]);

	await db.insert(posts).values([
		{ text: 'Alice post', userId: 1 },
		{ text: 'Bob post', userId: 2 },
		{ text: 'Charlie post', userId: 3 },
		{ text: 'David post', userId: 4 },
		{ text: 'Eve post', userId: 5 },
	]);

	const sq = db.select().from(posts, { useIndex: [postsTableUserIdIndex] }).where(eq(posts.userId, 1)).as('sq');

	const result = await db.select({
		userId: users.id,
		name: users.name,
		postId: sq.id,
		text: sq.text,
	})
		.from(users)
		.leftJoin(sq, eq(users.id, sq.userId))
		.where(eq(users.name, 'Alice'));

	expect(result).toHaveLength(1);
	expect(result).toStrictEqual([{ userId: 1, name: 'Alice', postId: 1, text: 'Alice post' }]);
});

test('MySqlTable :: select with Subquery join with `use index` in join', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	});

	const posts = mysqlTable('posts', {
		id: serial('id').primaryKey(),
		text: varchar('text', { length: 100 }).notNull(),
		userId: int('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
	}, () => [postsTableUserIdIndex]);
	const postsTableUserIdIndex = index('posts_user_id_index').on(posts.userId);

	await db.execute(sql`drop table if exists ${posts}`);
	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`
		create table ${posts} (
			\`id\` serial primary key,
			\`text\` varchar(100) not null,
			\`user_id\` int not null references users(id) on delete cascade
		)
	`);
	await db.execute(sql`create index posts_user_id_index ON posts(user_id)`);

	const sq = db.select().from(posts).where(eq(posts.userId, 1)).as('sq');

	const query = db.select({
		userId: users.id,
		name: users.name,
		postId: sq.id,
		text: sq.text,
	})
		.from(users)
		// @ts-expect-error
		.leftJoin(sq, eq(users.id, sq.userId, { useIndex: [postsTableUserIdIndex] }))
		.where(eq(users.name, 'Alice'))
		.toSQL();

	expect(query.sql).not.toInclude('USE INDEX');
});

test('View :: select with `use index` hint', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	}, () => [usersTableNameIndex]);

	const usersTableNameIndex = index('users_name_index').on(users.name);

	const usersView = mysqlView('users_view').as((qb) => qb.select().from(users));

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);
	await db.execute(sql`create view ${usersView} as select * from ${users}`);

	// @ts-expect-error
	const query = db.select().from(usersView, {
		useIndex: [usersTableNameIndex],
	}).toSQL();

	expect(query.sql).not.toInclude('USE INDEX');

	await db.execute(sql`drop view ${usersView}`);
});

test('Subquery :: select with `use index` hint', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: varchar('name', { length: 100 }).notNull(),
	}, () => [usersTableNameIndex]);
	const usersTableNameIndex = index('users_name_index').on(users.name);

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`
		create table ${users} (
			\`id\` serial primary key,
			\`name\` varchar(100) not null
		)
	`);
	await db.execute(sql`create index users_name_index ON users(name)`);

	const sq = db.select().from(users).as('sq');

	// @ts-expect-error
	const query = db.select().from(sq, {
		useIndex: [usersTableNameIndex],
	}).toSQL();

	expect(query.sql).not.toInclude('USE INDEX');
});

test('sql operator as cte', async () => {
	const users = mysqlTable('users', {
		id: serial('id').primaryKey(),
		name: text('name').notNull(),
	});

	await db.execute(sql`drop table if exists ${users}`);
	await db.execute(sql`create table ${users} (id serial not null primary key, name text not null)`);
	await db.insert(users).values([
		{ name: 'John' },
		{ name: 'Jane' },
	]);

	const sq1 = db.$with('sq', {
		userId: users.id,
		data: {
			name: users.name,
		},
	}).as(sql`select * from ${users} where ${users.name} = 'John'`);
	const result1 = await db.with(sq1).select().from(sq1);

	const sq2 = db.$with('sq', {
		userId: users.id,
		data: {
			name: users.name,
		},
	}).as(() => sql`select * from ${users} where ${users.name} = 'Jane'`);
	const result2 = await db.with(sq2).select().from(sq1);

	expect(result1).toStrictEqual([{ userId: 1, data: { name: 'John' } }]);
	expect(result2).toStrictEqual([{ userId: 2, data: { name: 'Jane' } }]);
});

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class TestGlobalCache extends Cache {
	private globalTtl: number = 1000;
	private usedTablesPerKey: Record<string, string[]> = {};

	constructor(private kv: Keyv = new Keyv()) {
		super();
	}

	override strategy(): 'explicit' | 'all' {
		return 'all';
	}
	override async get(key: string, _tables: string[], _isTag: boolean): Promise<any[] | undefined> {
		const res = await this.kv.get(key) ?? undefined;
		return res;
	}
	override async put(
		key: string,
		response: any,
		tables: string[],
		isTag: boolean,
		config?: CacheConfig,
	): Promise<void> {
		await this.kv.set(key, response, config ? config.ex : this.globalTtl);
		for (const table of tables) {
			const keys = this.usedTablesPerKey[table];
			if (keys === undefined) {
				this.usedTablesPerKey[table] = [key];
			} else {
				keys.push(key);
			}
		}
	}
	override async onMutate(params: MutationOption): Promise<void> {
		const tagsArray = params.tags ? Array.isArray(params.tags) ? params.tags : [params.tags] : [];
		const tablesArray = params.tables ? Array.isArray(params.tables) ? params.tables : [params.tables] : [];

		const keysToDelete = new Set<string>();

		for (const table of tablesArray) {
			const tableName = is(table, Table) ? getTableName(table) : table as string;
			const keys = this.usedTablesPerKey[tableName] ?? [];
			for (const key of keys) keysToDelete.add(key);
		}

		if (keysToDelete.size > 0 || tagsArray.length > 0) {
			for (const tag of tagsArray) {
				await this.kv.delete(tag);
			}

			for (const key of keysToDelete) {
				await this.kv.delete(key);
				for (const table of tablesArray) {
					const tableName = is(table, Table) ? getTableName(table) : table as string;
					this.usedTablesPerKey[tableName] = [];
				}
			}
		}
	}
}

// eslint-disable-next-line drizzle-internal/require-entity-kind
export class TestCache extends TestGlobalCache {
	override strategy(): 'explicit' | 'all' {
		return 'explicit';
	}
}

declare module 'vitest' {
	interface TestContext {
		cachedMySQL: {
			db: MySqlDatabase<any, any>;
			dbGlobalCached: MySqlDatabase<any, any>;
		};
	}
}

const usersTableCache = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: json('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { fsp: 2 }).notNull().defaultNow(),
});

const postsTableCache = mysqlTable('posts', {
	id: serial().primaryKey(),
	description: text().notNull(),
	userId: int('city_id').references(() => usersTable.id),
});

describe('common_cache', () => {
	beforeEach(async () => {
		const db = cachedDb;
		await db.execute(sql`drop table if exists users`);
		await db.execute(sql`drop table if exists posts`);
		await db.$cache?.invalidate({ tables: 'users' });
		await dbGlobalCached.$cache?.invalidate({ tables: 'users' });
		// public users
		await db.execute(
			sql`
				create table users (
					id serial primary key,
					name text not null,
					verified boolean not null default false,
					jsonb json,
					created_at timestamp not null default now()
				)
			`,
		);
		await db.execute(
			sql`
				create table posts (
					id serial primary key,
					description text not null,
					user_id int
				)
			`,
		);
	});

	test('test force invalidate', async () => {
		const db = cachedDb;

		const spyInvalidate = spyOn(db.$cache, 'invalidate');
		await db.$cache?.invalidate({ tables: 'users' });
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('default global config - no cache should be hit', async () => {
		const db = cachedDb;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('default global config + enable cache on select: get, put', async () => {
		const db = cachedDb;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache();

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('default global config + enable cache on select + write: get, put, onMutate', async () => {
		const db = cachedDb;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache({ config: { ex: 1 } });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		spyPut.mockClear();
		spyGet.mockClear();
		spyInvalidate.mockClear();

		await db.insert(usersTableCache).values({ name: 'John' });

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('default global config + enable cache on select + disable invalidate: get, put', async () => {
		const db = cachedDb;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache({ tag: 'custom', autoInvalidate: false, config: { ex: 1 } });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		await db.insert(usersTableCache).values({ name: 'John' });

		// invalidate force
		await db.$cache?.invalidate({ tags: ['custom'] });
	});

	test('global: true + disable cache', async () => {
		const db = dbGlobalCached;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache(false);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - cache should be hit', async () => {
		const db = dbGlobalCached;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache);

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - cache: false on select - no cache hit', async () => {
		const db = dbGlobalCached;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache(false);

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);
	});

	test('global: true - disable invalidate - cache hit + no invalidate', async () => {
		const db = dbGlobalCached;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache({ autoInvalidate: false });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		spyPut.mockClear();
		spyGet.mockClear();
		spyInvalidate.mockClear();

		await db.insert(usersTableCache).values({ name: 'John' });

		expect(spyPut).toHaveBeenCalledTimes(0);
		expect(spyGet).toHaveBeenCalledTimes(0);
		expect(spyInvalidate).toHaveBeenCalledTimes(1);
	});

	test('global: true - with custom tag', async () => {
		const db = dbGlobalCached;

		// @ts-expect-error
		const spyPut = spyOn(db.$cache, 'put');
		// @ts-expect-error
		const spyGet = spyOn(db.$cache, 'get');
		// @ts-expect-error
		const spyInvalidate = spyOn(db.$cache, 'onMutate');

		spyPut.mockReset();
		spyGet.mockReset();
		spyInvalidate.mockReset();

		await db.select().from(usersTableCache).$withCache({ tag: 'custom', autoInvalidate: false });

		expect(spyPut).toHaveBeenCalledTimes(1);
		expect(spyGet).toHaveBeenCalledTimes(1);
		expect(spyInvalidate).toHaveBeenCalledTimes(0);

		await db.insert(usersTableCache).values({ name: 'John' });

		// invalidate force
		await db.$cache?.invalidate({ tags: ['custom'] });
	});

	// check select used tables
	test('check simple select used tables', () => {
		const db = cachedDb;

		// @ts-expect-error
		expect(db.select().from(usersTableCache).getUsedTables()).toStrictEqual(['users']);
		// @ts-expect-error
		expect(db.select().from(sql`${usersTableCache}`).getUsedTables()).toStrictEqual(['users']);
	});
	// check select+join used tables
	test('select+join', () => {
		const db = cachedDb;

		expect(
			db.select().from(usersTableCache).leftJoin(postsTableCache, eq(usersTableCache.id, postsTableCache.userId))
				// @ts-expect-error
				.getUsedTables(),
		)
			.toStrictEqual(['users', 'posts']);
		expect(
			db.select().from(sql`${usersTableCache}`).leftJoin(
				postsTableCache,
				eq(usersTableCache.id, postsTableCache.userId),
				// @ts-expect-error
			).getUsedTables(),
		).toStrictEqual(['users', 'posts']);
	});
	// check select+2join used tables
	test('select+2joins', () => {
		const db = cachedDb;

		expect(
			db.select().from(usersTableCache).leftJoin(
				postsTableCache,
				eq(usersTableCache.id, postsTableCache.userId),
			).leftJoin(
				alias(postsTableCache, 'post2'),
				eq(usersTableCache.id, postsTableCache.userId),
			)
				// @ts-expect-error
				.getUsedTables(),
		)
			.toStrictEqual(['users', 'posts']);
		expect(
			db.select().from(sql`${usersTableCache}`).leftJoin(
				postsTableCache,
				eq(usersTableCache.id, postsTableCache.userId),
			).leftJoin(
				alias(postsTableCache, 'post2'),
				eq(usersTableCache.id, postsTableCache.userId),
				// @ts-expect-error
			).getUsedTables(),
		).toStrictEqual(['users', 'posts']);
	});
	// select subquery used tables
	test('select+join', () => {
		const db = cachedDb;

		const sq = db.select().from(usersTableCache).where(eq(usersTableCache.id, 42)).as('sq');
		db.select().from(sq);

		// @ts-expect-error
		expect(db.select().from(sq).getUsedTables()).toStrictEqual(['users']);
	});
});
