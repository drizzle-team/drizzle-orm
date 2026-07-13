/// <reference types="bun-types" />

import retry from 'async-retry';
import { SQL } from 'bun';
import { afterAll, beforeAll, beforeEach, describe, expect, expectTypeOf, spyOn, test } from 'bun:test';
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
	getColumns,
	getTableColumns,
	getTableName,
	gt,
	gte,
	inArray,
	is,
	like,
	lt,
	makeDefaultQueryMapper,
	makeDefaultRqbMapper,
	makeJitQueryMapper,
	makeJitRqbMapper,
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
import { migrate } from 'drizzle-orm/bun-sql/migrator';
import { drizzle } from 'drizzle-orm/bun-sql/mysql';
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
	customType,
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
	type MySqlAsyncDatabase,
	MySqlAsyncSession,
	MySqlDialect,
	mysqlEnum,
	mysqlSchema,
	mysqlTable,
	mysqlTableCreator,
	MySqlView,
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
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import Keyv from 'keyv';
import { v4 as uuid } from 'uuid';
import { allTypesCodecsTable } from '~/mysql/schema2';
import { normalizeDataWithDbCodecs } from '~/mysql/utils';
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
	cityId: bigint('city_id', { unsigned: true, mode: 'number' }).references(() => citiesTable.id),
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
	categoryId: bigint('category_id', { unsigned: true, mode: 'number' }).references(() => courseCategoriesTable.id),
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

let db: BunMySqlDatabase<typeof relations> & { $client: SQL };
let dbGlobalCached: BunMySqlDatabase & { $client: SQL };
let cachedDb: BunMySqlDatabase & { $client: SQL };
let client: SQL;

beforeAll(async () => {
	const connectionString = process.env['MYSQL_CONNECTION_STRING'];
	if (!connectionString) {
		throw new Error(
			'MYSQL_CONNECTION_STRING is not set. Bring DBs up with `bash compose/dockers.sh up mysql` and export the connection string before running tests.',
		);
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
	db = drizzle({ client, logger: ENABLE_LOGGING, relations });
	cachedDb = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestCache() });
	dbGlobalCached = drizzle({ client, logger: ENABLE_LOGGING, cache: new TestGlobalCache() });
});

afterAll(async () => {
	await client?.end();
	await cachedDb?.$client.end();
	await dbGlobalCached?.$client.end();
});

// bun can't import drizzle-kit's diff helper, so create the schema entities directly from their
// drizzle definitions instead of relying on the shared `push`. Only the column shapes used by the
// carried-over mapper / codec tests are needed (column-level PK / NOT NULL / AUTO_INCREMENT, plus
// `.as(...)` views); FKs are intentionally omitted since the tests rely on RQB relations, not DB FKs.
const push = async (schema: Record<string, any>) => {
	// Disable FK checks so a referenced table can be dropped/recreated even if leftover tables from a
	// previous run still carry FK constraints against it.
	await db.execute(sql.raw('set foreign_key_checks = 0'));
	for (const entity of Object.values(schema)) {
		if (is(entity, MySqlView)) {
			const { name, query } = getViewConfig(entity);
			await db.execute(sql.raw(`drop view if exists \`${name}\``));
			await db.execute(sql`create view ${sql.identifier(name)} as ${query!}`);
			continue;
		}

		const { name, columns } = getTableConfig(entity);
		const cols = columns.map((c) => {
			let def = `\`${c.name}\` ${c.getSQLType()}`;
			if (c.notNull) def += ' not null';
			if ((c as any).autoIncrement) def += ' auto_increment';
			if (c.primary) def += ' primary key';
			return def;
		});
		await db.execute(sql.raw(`drop table if exists \`${name}\``));
		await db.execute(sql.raw(`create table \`${name}\` (${cols.join(', ')})`));
	}
	await db.execute(sql.raw('set foreign_key_checks = 1'));
};

const mappersDate = new Date('2026-04-02T00:00:00.000Z');

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
				create table cities (
					id serial primary key,
					name text not null
				)
			`,
		);

		await db.execute(
			sql`
				create table users2 (
					id serial primary key,
					name text not null,
					city_id bigint unsigned references cities(id)
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
					\`city_id\` bigint unsigned references \`mySchema\`.\`cities\`(\`id\`)
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

	async function setupReturningFunctionsTest(db: MySqlAsyncDatabase<any, any>) {
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

	async function setupSetOperationTest(db: MySqlAsyncDatabase<any, any>) {
		await db.execute(sql`drop table if exists \`users2\``);
		await db.execute(sql`drop table if exists \`cities\``);

		await db.execute(
			sql`
				create table \`cities\` (
					\`id\` serial primary key,
					\`name\` text not null
				)
			`,
		);

		await db.execute(
			sql`
				create table \`users2\` (
					\`id\` serial primary key,
					\`name\` text not null,
					\`city_id\` bigint unsigned references \`cities\`(\`id\`)
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

	async function setupAggregateFunctionsTest(db: MySqlAsyncDatabase<any, any>) {
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

	test('migrator: local migration is unapplied. Migrations timestamp is less than last db migration', async () => {
		const users = mysqlTable('migration_users', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: int(),
		});

		const users2 = mysqlTable('migration_users2', {
			id: serial('id').primaryKey(),
			name: text().notNull(),
			email: text().notNull(),
			age: int(),
		});

		await db.execute(sql`drop table if exists \`__drizzle_migrations\`;`);
		await db.execute(sql`drop table if exists ${users};`);
		await db.execute(sql`drop table if exists ${users2};`);

		// create migration directory
		const migrationDir = './migrations/bun-mysql';
		if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
		mkdirSync(migrationDir, { recursive: true });

		// first branch
		mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240101010101_initial/migration.sql`,
			'CREATE TABLE `migration_users` (\n`id` serial PRIMARY KEY NOT NULL,\n`name` text NOT NULL,\n`email` text NOT NULL\n);',
		);
		mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240303030303_third/migration.sql`,
			'ALTER TABLE `migration_users` ADD COLUMN `age` INT;',
		);

		await migrate.mysql(db, { migrationsFolder: migrationDir });
		await db.insert(users).values({ name: 'John', email: '', age: 30 });
		const res1 = await db.select().from(users);

		// second migration was not applied yet
		expect((async () => await db.insert(users2).values({ name: 'John', email: '', age: 30 }))()).rejects.toThrowError();

		// insert migration with earlier timestamp
		mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
		writeFileSync(
			`${migrationDir}/20240202020202_second/migration.sql`,
			'CREATE TABLE `migration_users2` (\n`id` serial PRIMARY KEY NOT NULL,\n`name` text NOT NULL,\n`email` text NOT NULL\n,`age` INT\n);',
		);
		await migrate.mysql(db, { migrationsFolder: migrationDir });

		await db.insert(users2).values({ name: 'John', email: '', age: 30 });
		const res2 = await db.select().from(users2);

		const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
		expect(res1).toStrictEqual(expected);
		expect(res2).toStrictEqual(expected);

		rmSync(migrationDir, { recursive: true });
	});

	// TODO: Breaks further tests
	test.todo('managing multiple databases #1', async () => {
		await db.execute('drop database if exists drizzle1;');
		await db.execute('create database drizzle1;');
		await db.execute('drop database if exists drizzle2;');
		await db.execute('create database drizzle2;');

		await db.execute(`use drizzle1`);
		await migrate.mysql(db, { migrationsFolder: './drizzle2/mysql' });

		// drizzle1
		// session.transaction(), which calls client.begin(), spawns a new connection that resets the database context back to the default db from connection string
		// After the migration completes, subsequent queries on db are running against the default db from connection string, not drizzle1
		await db.execute(`use drizzle1`);
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result1 = await db.select().from(usersMigratorTable);

		await db.execute(`use drizzle2`);
		await migrate.mysql(db, { migrationsFolder: './drizzle2/mysql' });

		// drizzle2
		// session.transaction(), which calls client.begin(), spawns a new connection that resets the database context back to the default db from connection string
		// After the migration completes, subsequent queries on db are running against the default db from connection string, not drizzle2
		await db.execute(`use drizzle2`);
		await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result2 = await db.select().from(usersMigratorTable);

		await db.execute('drop database drizzle1;');
		await db.execute('drop database drizzle2;');

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
	});

	// TODO: Breaks further tests
	test.skip('managing multiple databases #2', async () => {
		await db.execute('create database if not exists drizzle1;');
		await db.execute('create database if not exists drizzle2;');

		const client1 = await new SQL({
			url: process.env['MYSQL_CONNECTION_STRING'],
			adapter: 'mysql',
			bigint: true,
			database: 'drizzle1',
		}).connect();

		const client2 = await new SQL({
			url: process.env['MYSQL_CONNECTION_STRING'],
			adapter: 'mysql',
			bigint: true,
			database: 'drizzle2',
		}).connect();

		const db1 = drizzle({ client: client1 });
		const db2 = drizzle({ client: client2 });

		await migrate.mysql(db1, { migrationsFolder: './drizzle2/mysql' });
		await migrate.mysql(db2, { migrationsFolder: './drizzle2/mysql' });

		// drizzle1
		await db1.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result1 = await db1.select().from(usersMigratorTable);

		// drizzle2
		await db2.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
		const result2 = await db2.select().from(usersMigratorTable);

		await client1.unsafe('drop database drizzle1;');
		await client2.unsafe('drop database drizzle2;');

		expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
		expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
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
			datetimeAsString: '2022-11-11 12:12:12.000',
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
					\`category_id\` bigint unsigned references \`course_categories\`(\`id\`)
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

		expect((async () => {
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
			datetimeAsString: '2022-11-11 12:12:12.000',
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
				datetimeStr: '2025-03-12 01:32:41.000',
				decimal: '47521',
				decimalNum: 9007199254740991,
				decimalBig: 5044565289845416380n,
				double: 15.35325689124218,
				float: 1.048596,
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

	await db.execute(sql`drop table if exists ${userNotications} cascade`);
	await db.execute(sql`drop table if exists ${users} cascade`);
	await db.execute(sql`drop table if exists ${notifications} cascade`);
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

	expect(query.sql).toInclude('USE INDEX (`users_name_index`)');
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

	expect(query.sql).toInclude('USE INDEX (`users_name_index`, `users_age_index`)');
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

	expect(query.sql).toInclude('USE INDEX (`posts_user_id_index`)');
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

	expect(query.sql).toInclude('USE INDEX (`posts_user_id_index`)');
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

	expect(query.sql).toInclude('USE INDEX (`posts_user_id_index`, `posts_text_index`)');
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

test('all types ~codecs~', async () => {
	const db = drizzle({
		client,
		relations: defineRelations({ allTypesTable: allTypesCodecsTable }, (r) => ({
			allTypesTable: {
				self: r.many.allTypesTable({
					from: r.allTypesTable.serial,
					to: r.allTypesTable.serial,
				}),
			},
		})),
	});

	await db.execute(sql`DROP TABLE IF EXISTS ${allTypesCodecsTable} CASCADE;`);
	await db.execute(
		sql`CREATE TABLE ${allTypesCodecsTable} (${
			sql.join(
				Object.values(getTableColumns(allTypesCodecsTable)).map((c) =>
					sql`${sql.identifier(c.name)} ${sql.raw(c.getSQLType())}`
				),
				sql`, `,
			)
		})`,
	);

	type ExpectedType = {
		serial: number;
		bigint53: number;
		bigint64: bigint;
		bigintstr: string;
		binary: string;
		boolean: boolean;
		char: string;
		date: Date;
		datestr: string;
		datetime: Date;
		datetimestr: string;
		decimal: string;
		decimalnum: number;
		decimalbig: bigint;
		double: number;
		float: number;
		int: number;
		json1: unknown;
		json2: unknown;
		json3: unknown;
		json4: unknown;
		medint: number;
		smallint: number;
		real: number;
		text: string;
		tinytext: string;
		mediumtext: string;
		longtext: string;
		time: string;
		timestamp: Date;
		timestampstr: string;
		tinyint: number;
		varbin: string;
		varchar: string;
		year: number;
		enum: 'enV1' | 'enV2';
		blob: Buffer;
		tinyblob: Buffer;
		mediumblob: Buffer;
		longblob: Buffer;
		stringblob: string;
		stringtinyblob: string;
		stringmediumblob: string;
		stringlongblob: string;
	};

	const testData: ExpectedType = {
		serial: 1,
		bigint53: 9007199254740991,
		bigint64: 5044565289845416380n,
		bigintstr: '5044565289845416380',
		binary: '1',
		boolean: true,
		char: 'c',
		date: new Date('2025-03-12'),
		datestr: '2025-03-12',
		datetime: new Date(1741743161623),
		datetimestr: new Date(1741743161623).toISOString().slice(0, 23).replace('T', ' '),
		decimal: '47521',
		decimalnum: 9007199254740991,
		decimalbig: 5044565289845416380n,
		double: 15.35325689124218,
		enum: 'enV1',
		float: 1.048596,
		real: 1.048596,
		text: 'C4-',
		tinytext: 'tiny text',
		mediumtext: 'medium text',
		longtext: 'long text',
		int: 621,
		json1: { str: 'strval', arr: ['str', 10] },
		json2: [{ key: 'value', num: 7 }, 'v', '11', 5],
		json3: 5,
		json4: '5',
		medint: 560,
		smallint: 14,
		time: '04:13:22',
		timestamp: new Date(1741743161623),
		timestampstr: new Date(1741743161623).toISOString().slice(0, 23).replace('T', ' '),
		tinyint: 7,
		varbin: '1010110101001101',
		varchar: 'VCHAR',
		year: 2025,
		blob: Buffer.from('string'),
		longblob: Buffer.from('string'),
		mediumblob: Buffer.from('string'),
		tinyblob: Buffer.from('string'),
		stringblob: 'string',
		stringlongblob: 'string',
		stringmediumblob: 'string',
		stringtinyblob: 'string',
	};

	await db.insert(allTypesCodecsTable).values(testData);

	const session = (<any> db).session as MySqlAsyncSession;

	const queryRes = await session.objects<ExpectedType>(
		db.select(
			Object.fromEntries(Object.entries(getTableColumns(allTypesCodecsTable)).map(([k, v]) => [k, v.as(v.name)])),
		).from(allTypesCodecsTable).getSQL(),
	).then((e) =>
		normalizeDataWithDbCodecs({
			db,
			columns: getColumns(allTypesCodecsTable),
			data: e,
			mode: 'query',
		})[0]
	);

	expect(queryRes).toStrictEqual(testData);

	const { relationRes, rootRes } = await session.objects(
		db.query.allTypesTable.findFirst({
			with: {
				self: true,
			},
		}).getSQL(),
	).then((e) => {
		const [{ self: relationRaw, ...rootRaw }] = e as [Record<string, any>];

		return {
			relationRes: normalizeDataWithDbCodecs({
				db,
				columns: getColumns(allTypesCodecsTable),
				data: relationRaw,
				mode: 'json',
			})[0]!,
			rootRes: normalizeDataWithDbCodecs({
				db,
				columns: getColumns(allTypesCodecsTable),
				data: [rootRaw],
				mode: 'query',
			})[0]!,
		};
	});

	expect(relationRes).toStrictEqual(testData);
	expect(rootRes).toStrictEqual(testData);

	// ---- numbers ----
	expect(
		await unionAll(
			db.select({
				'serial ∪ serial': allTypesCodecsTable.serial.as('serial ∪ serial'),
				'serial ∪ bigint53': allTypesCodecsTable.serial.as('serial ∪ bigint53'),
				'serial ∪ decimalnum': allTypesCodecsTable.serial.as('serial ∪ decimalnum'),
				'serial ∪ double': allTypesCodecsTable.serial.as('serial ∪ double'),
				'serial ∪ float': allTypesCodecsTable.serial.as('serial ∪ float'),
				'serial ∪ int': allTypesCodecsTable.serial.as('serial ∪ int'),
				'serial ∪ medint': allTypesCodecsTable.serial.as('serial ∪ medint'),
				'serial ∪ smallint': allTypesCodecsTable.serial.as('serial ∪ smallint'),
				'serial ∪ real': allTypesCodecsTable.serial.as('serial ∪ real'),
				'serial ∪ tinyint': allTypesCodecsTable.serial.as('serial ∪ tinyint'),
				'serial ∪ year': allTypesCodecsTable.serial.as('serial ∪ year'),
				'bigint53 ∪ serial': allTypesCodecsTable.bigint53.as('bigint53 ∪ serial'),
				'bigint53 ∪ bigint53': allTypesCodecsTable.bigint53.as('bigint53 ∪ bigint53'),
				'bigint53 ∪ decimalnum': allTypesCodecsTable.bigint53.as('bigint53 ∪ decimalnum'),
				'bigint53 ∪ double': allTypesCodecsTable.bigint53.as('bigint53 ∪ double'),
				'bigint53 ∪ float': allTypesCodecsTable.bigint53.as('bigint53 ∪ float'),
				'bigint53 ∪ int': allTypesCodecsTable.bigint53.as('bigint53 ∪ int'),
				'bigint53 ∪ medint': allTypesCodecsTable.bigint53.as('bigint53 ∪ medint'),
				'bigint53 ∪ smallint': allTypesCodecsTable.bigint53.as('bigint53 ∪ smallint'),
				'bigint53 ∪ real': allTypesCodecsTable.bigint53.as('bigint53 ∪ real'),
				'bigint53 ∪ tinyint': allTypesCodecsTable.bigint53.as('bigint53 ∪ tinyint'),
				'bigint53 ∪ year': allTypesCodecsTable.bigint53.as('bigint53 ∪ year'),
				'decimalnum ∪ serial': allTypesCodecsTable.decimalnum.as('decimalnum ∪ serial'),
				'decimalnum ∪ bigint53': allTypesCodecsTable.decimalnum.as('decimalnum ∪ bigint53'),
				'decimalnum ∪ decimalnum': allTypesCodecsTable.decimalnum.as('decimalnum ∪ decimalnum'),
				'decimalnum ∪ double': allTypesCodecsTable.decimalnum.as('decimalnum ∪ double'),
				'decimalnum ∪ float': allTypesCodecsTable.decimalnum.as('decimalnum ∪ float'),
				'decimalnum ∪ int': allTypesCodecsTable.decimalnum.as('decimalnum ∪ int'),
				'decimalnum ∪ medint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ medint'),
				'decimalnum ∪ smallint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ smallint'),
				'decimalnum ∪ real': allTypesCodecsTable.decimalnum.as('decimalnum ∪ real'),
				'decimalnum ∪ tinyint': allTypesCodecsTable.decimalnum.as('decimalnum ∪ tinyint'),
				'decimalnum ∪ year': allTypesCodecsTable.decimalnum.as('decimalnum ∪ year'),
				'double ∪ serial': allTypesCodecsTable.double.as('double ∪ serial'),
				'double ∪ bigint53': allTypesCodecsTable.double.as('double ∪ bigint53'),
				'double ∪ decimalnum': allTypesCodecsTable.double.as('double ∪ decimalnum'),
				'double ∪ double': allTypesCodecsTable.double.as('double ∪ double'),
				'double ∪ float': allTypesCodecsTable.double.as('double ∪ float'),
				'double ∪ int': allTypesCodecsTable.double.as('double ∪ int'),
				'double ∪ medint': allTypesCodecsTable.double.as('double ∪ medint'),
				'double ∪ smallint': allTypesCodecsTable.double.as('double ∪ smallint'),
				'double ∪ real': allTypesCodecsTable.double.as('double ∪ real'),
				'double ∪ tinyint': allTypesCodecsTable.double.as('double ∪ tinyint'),
				'double ∪ year': allTypesCodecsTable.double.as('double ∪ year'),
				'float ∪ serial': allTypesCodecsTable.float.as('float ∪ serial'),
				'float ∪ bigint53': allTypesCodecsTable.float.as('float ∪ bigint53'),
				'float ∪ decimalnum': allTypesCodecsTable.float.as('float ∪ decimalnum'),
				'float ∪ double': allTypesCodecsTable.float.as('float ∪ double'),
				'float ∪ float': allTypesCodecsTable.float.as('float ∪ float'),
				'float ∪ int': allTypesCodecsTable.float.as('float ∪ int'),
				'float ∪ medint': allTypesCodecsTable.float.as('float ∪ medint'),
				'float ∪ smallint': allTypesCodecsTable.float.as('float ∪ smallint'),
				'float ∪ real': allTypesCodecsTable.float.as('float ∪ real'),
				'float ∪ tinyint': allTypesCodecsTable.float.as('float ∪ tinyint'),
				'float ∪ year': allTypesCodecsTable.float.as('float ∪ year'),
				'int ∪ serial': allTypesCodecsTable.int.as('int ∪ serial'),
				'int ∪ bigint53': allTypesCodecsTable.int.as('int ∪ bigint53'),
				'int ∪ decimalnum': allTypesCodecsTable.int.as('int ∪ decimalnum'),
				'int ∪ double': allTypesCodecsTable.int.as('int ∪ double'),
				'int ∪ float': allTypesCodecsTable.int.as('int ∪ float'),
				'int ∪ int': allTypesCodecsTable.int.as('int ∪ int'),
				'int ∪ medint': allTypesCodecsTable.int.as('int ∪ medint'),
				'int ∪ smallint': allTypesCodecsTable.int.as('int ∪ smallint'),
				'int ∪ real': allTypesCodecsTable.int.as('int ∪ real'),
				'int ∪ tinyint': allTypesCodecsTable.int.as('int ∪ tinyint'),
				'int ∪ year': allTypesCodecsTable.int.as('int ∪ year'),
				'medint ∪ serial': allTypesCodecsTable.medint.as('medint ∪ serial'),
				'medint ∪ bigint53': allTypesCodecsTable.medint.as('medint ∪ bigint53'),
				'medint ∪ decimalnum': allTypesCodecsTable.medint.as('medint ∪ decimalnum'),
				'medint ∪ double': allTypesCodecsTable.medint.as('medint ∪ double'),
				'medint ∪ float': allTypesCodecsTable.medint.as('medint ∪ float'),
				'medint ∪ int': allTypesCodecsTable.medint.as('medint ∪ int'),
				'medint ∪ medint': allTypesCodecsTable.medint.as('medint ∪ medint'),
				'medint ∪ smallint': allTypesCodecsTable.medint.as('medint ∪ smallint'),
				'medint ∪ real': allTypesCodecsTable.medint.as('medint ∪ real'),
				'medint ∪ tinyint': allTypesCodecsTable.medint.as('medint ∪ tinyint'),
				'medint ∪ year': allTypesCodecsTable.medint.as('medint ∪ year'),
				'smallint ∪ serial': allTypesCodecsTable.smallint.as('smallint ∪ serial'),
				'smallint ∪ bigint53': allTypesCodecsTable.smallint.as('smallint ∪ bigint53'),
				'smallint ∪ decimalnum': allTypesCodecsTable.smallint.as('smallint ∪ decimalnum'),
				'smallint ∪ double': allTypesCodecsTable.smallint.as('smallint ∪ double'),
				'smallint ∪ float': allTypesCodecsTable.smallint.as('smallint ∪ float'),
				'smallint ∪ int': allTypesCodecsTable.smallint.as('smallint ∪ int'),
				'smallint ∪ medint': allTypesCodecsTable.smallint.as('smallint ∪ medint'),
				'smallint ∪ smallint': allTypesCodecsTable.smallint.as('smallint ∪ smallint'),
				'smallint ∪ real': allTypesCodecsTable.smallint.as('smallint ∪ real'),
				'smallint ∪ tinyint': allTypesCodecsTable.smallint.as('smallint ∪ tinyint'),
				'smallint ∪ year': allTypesCodecsTable.smallint.as('smallint ∪ year'),
				'real ∪ serial': allTypesCodecsTable.real.as('real ∪ serial'),
				'real ∪ bigint53': allTypesCodecsTable.real.as('real ∪ bigint53'),
				'real ∪ decimalnum': allTypesCodecsTable.real.as('real ∪ decimalnum'),
				'real ∪ double': allTypesCodecsTable.real.as('real ∪ double'),
				'real ∪ float': allTypesCodecsTable.real.as('real ∪ float'),
				'real ∪ int': allTypesCodecsTable.real.as('real ∪ int'),
				'real ∪ medint': allTypesCodecsTable.real.as('real ∪ medint'),
				'real ∪ smallint': allTypesCodecsTable.real.as('real ∪ smallint'),
				'real ∪ real': allTypesCodecsTable.real.as('real ∪ real'),
				'real ∪ tinyint': allTypesCodecsTable.real.as('real ∪ tinyint'),
				'real ∪ year': allTypesCodecsTable.real.as('real ∪ year'),
				'tinyint ∪ serial': allTypesCodecsTable.tinyint.as('tinyint ∪ serial'),
				'tinyint ∪ bigint53': allTypesCodecsTable.tinyint.as('tinyint ∪ bigint53'),
				'tinyint ∪ decimalnum': allTypesCodecsTable.tinyint.as('tinyint ∪ decimalnum'),
				'tinyint ∪ double': allTypesCodecsTable.tinyint.as('tinyint ∪ double'),
				'tinyint ∪ float': allTypesCodecsTable.tinyint.as('tinyint ∪ float'),
				'tinyint ∪ int': allTypesCodecsTable.tinyint.as('tinyint ∪ int'),
				'tinyint ∪ medint': allTypesCodecsTable.tinyint.as('tinyint ∪ medint'),
				'tinyint ∪ smallint': allTypesCodecsTable.tinyint.as('tinyint ∪ smallint'),
				'tinyint ∪ real': allTypesCodecsTable.tinyint.as('tinyint ∪ real'),
				'tinyint ∪ tinyint': allTypesCodecsTable.tinyint.as('tinyint ∪ tinyint'),
				'tinyint ∪ year': allTypesCodecsTable.tinyint.as('tinyint ∪ year'),
				'year ∪ serial': allTypesCodecsTable.year.as('year ∪ serial'),
				'year ∪ bigint53': allTypesCodecsTable.year.as('year ∪ bigint53'),
				'year ∪ decimalnum': allTypesCodecsTable.year.as('year ∪ decimalnum'),
				'year ∪ double': allTypesCodecsTable.year.as('year ∪ double'),
				'year ∪ float': allTypesCodecsTable.year.as('year ∪ float'),
				'year ∪ int': allTypesCodecsTable.year.as('year ∪ int'),
				'year ∪ medint': allTypesCodecsTable.year.as('year ∪ medint'),
				'year ∪ smallint': allTypesCodecsTable.year.as('year ∪ smallint'),
				'year ∪ real': allTypesCodecsTable.year.as('year ∪ real'),
				'year ∪ tinyint': allTypesCodecsTable.year.as('year ∪ tinyint'),
				'year ∪ year': allTypesCodecsTable.year.as('year ∪ year'),
			}).from(allTypesCodecsTable),
			db.select({
				'serial ∪ serial': allTypesCodecsTable.serial.as('serial ∪ serial'),
				'serial ∪ bigint53': allTypesCodecsTable.bigint53.as('serial ∪ bigint53'),
				'serial ∪ decimalnum': allTypesCodecsTable.decimalnum.as('serial ∪ decimalnum'),
				'serial ∪ double': allTypesCodecsTable.double.as('serial ∪ double'),
				'serial ∪ float': allTypesCodecsTable.float.as('serial ∪ float'),
				'serial ∪ int': allTypesCodecsTable.int.as('serial ∪ int'),
				'serial ∪ medint': allTypesCodecsTable.medint.as('serial ∪ medint'),
				'serial ∪ smallint': allTypesCodecsTable.smallint.as('serial ∪ smallint'),
				'serial ∪ real': allTypesCodecsTable.real.as('serial ∪ real'),
				'serial ∪ tinyint': allTypesCodecsTable.tinyint.as('serial ∪ tinyint'),
				'serial ∪ year': allTypesCodecsTable.year.as('serial ∪ year'),
				'bigint53 ∪ serial': allTypesCodecsTable.serial.as('bigint53 ∪ serial'),
				'bigint53 ∪ bigint53': allTypesCodecsTable.bigint53.as('bigint53 ∪ bigint53'),
				'bigint53 ∪ decimalnum': allTypesCodecsTable.decimalnum.as('bigint53 ∪ decimalnum'),
				'bigint53 ∪ double': allTypesCodecsTable.double.as('bigint53 ∪ double'),
				'bigint53 ∪ float': allTypesCodecsTable.float.as('bigint53 ∪ float'),
				'bigint53 ∪ int': allTypesCodecsTable.int.as('bigint53 ∪ int'),
				'bigint53 ∪ medint': allTypesCodecsTable.medint.as('bigint53 ∪ medint'),
				'bigint53 ∪ smallint': allTypesCodecsTable.smallint.as('bigint53 ∪ smallint'),
				'bigint53 ∪ real': allTypesCodecsTable.real.as('bigint53 ∪ real'),
				'bigint53 ∪ tinyint': allTypesCodecsTable.tinyint.as('bigint53 ∪ tinyint'),
				'bigint53 ∪ year': allTypesCodecsTable.year.as('bigint53 ∪ year'),
				'decimalnum ∪ serial': allTypesCodecsTable.serial.as('decimalnum ∪ serial'),
				'decimalnum ∪ bigint53': allTypesCodecsTable.bigint53.as('decimalnum ∪ bigint53'),
				'decimalnum ∪ decimalnum': allTypesCodecsTable.decimalnum.as('decimalnum ∪ decimalnum'),
				'decimalnum ∪ double': allTypesCodecsTable.double.as('decimalnum ∪ double'),
				'decimalnum ∪ float': allTypesCodecsTable.float.as('decimalnum ∪ float'),
				'decimalnum ∪ int': allTypesCodecsTable.int.as('decimalnum ∪ int'),
				'decimalnum ∪ medint': allTypesCodecsTable.medint.as('decimalnum ∪ medint'),
				'decimalnum ∪ smallint': allTypesCodecsTable.smallint.as('decimalnum ∪ smallint'),
				'decimalnum ∪ real': allTypesCodecsTable.real.as('decimalnum ∪ real'),
				'decimalnum ∪ tinyint': allTypesCodecsTable.tinyint.as('decimalnum ∪ tinyint'),
				'decimalnum ∪ year': allTypesCodecsTable.year.as('decimalnum ∪ year'),
				'double ∪ serial': allTypesCodecsTable.serial.as('double ∪ serial'),
				'double ∪ bigint53': allTypesCodecsTable.bigint53.as('double ∪ bigint53'),
				'double ∪ decimalnum': allTypesCodecsTable.decimalnum.as('double ∪ decimalnum'),
				'double ∪ double': allTypesCodecsTable.double.as('double ∪ double'),
				'double ∪ float': allTypesCodecsTable.float.as('double ∪ float'),
				'double ∪ int': allTypesCodecsTable.int.as('double ∪ int'),
				'double ∪ medint': allTypesCodecsTable.medint.as('double ∪ medint'),
				'double ∪ smallint': allTypesCodecsTable.smallint.as('double ∪ smallint'),
				'double ∪ real': allTypesCodecsTable.real.as('double ∪ real'),
				'double ∪ tinyint': allTypesCodecsTable.tinyint.as('double ∪ tinyint'),
				'double ∪ year': allTypesCodecsTable.year.as('double ∪ year'),
				'float ∪ serial': allTypesCodecsTable.serial.as('float ∪ serial'),
				'float ∪ bigint53': allTypesCodecsTable.bigint53.as('float ∪ bigint53'),
				'float ∪ decimalnum': allTypesCodecsTable.decimalnum.as('float ∪ decimalnum'),
				'float ∪ double': allTypesCodecsTable.double.as('float ∪ double'),
				'float ∪ float': allTypesCodecsTable.float.as('float ∪ float'),
				'float ∪ int': allTypesCodecsTable.int.as('float ∪ int'),
				'float ∪ medint': allTypesCodecsTable.medint.as('float ∪ medint'),
				'float ∪ smallint': allTypesCodecsTable.smallint.as('float ∪ smallint'),
				'float ∪ real': allTypesCodecsTable.real.as('float ∪ real'),
				'float ∪ tinyint': allTypesCodecsTable.tinyint.as('float ∪ tinyint'),
				'float ∪ year': allTypesCodecsTable.year.as('float ∪ year'),
				'int ∪ serial': allTypesCodecsTable.serial.as('int ∪ serial'),
				'int ∪ bigint53': allTypesCodecsTable.bigint53.as('int ∪ bigint53'),
				'int ∪ decimalnum': allTypesCodecsTable.decimalnum.as('int ∪ decimalnum'),
				'int ∪ double': allTypesCodecsTable.double.as('int ∪ double'),
				'int ∪ float': allTypesCodecsTable.float.as('int ∪ float'),
				'int ∪ int': allTypesCodecsTable.int.as('int ∪ int'),
				'int ∪ medint': allTypesCodecsTable.medint.as('int ∪ medint'),
				'int ∪ smallint': allTypesCodecsTable.smallint.as('int ∪ smallint'),
				'int ∪ real': allTypesCodecsTable.real.as('int ∪ real'),
				'int ∪ tinyint': allTypesCodecsTable.tinyint.as('int ∪ tinyint'),
				'int ∪ year': allTypesCodecsTable.year.as('int ∪ year'),
				'medint ∪ serial': allTypesCodecsTable.serial.as('medint ∪ serial'),
				'medint ∪ bigint53': allTypesCodecsTable.bigint53.as('medint ∪ bigint53'),
				'medint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('medint ∪ decimalnum'),
				'medint ∪ double': allTypesCodecsTable.double.as('medint ∪ double'),
				'medint ∪ float': allTypesCodecsTable.float.as('medint ∪ float'),
				'medint ∪ int': allTypesCodecsTable.int.as('medint ∪ int'),
				'medint ∪ medint': allTypesCodecsTable.medint.as('medint ∪ medint'),
				'medint ∪ smallint': allTypesCodecsTable.smallint.as('medint ∪ smallint'),
				'medint ∪ real': allTypesCodecsTable.real.as('medint ∪ real'),
				'medint ∪ tinyint': allTypesCodecsTable.tinyint.as('medint ∪ tinyint'),
				'medint ∪ year': allTypesCodecsTable.year.as('medint ∪ year'),
				'smallint ∪ serial': allTypesCodecsTable.serial.as('smallint ∪ serial'),
				'smallint ∪ bigint53': allTypesCodecsTable.bigint53.as('smallint ∪ bigint53'),
				'smallint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('smallint ∪ decimalnum'),
				'smallint ∪ double': allTypesCodecsTable.double.as('smallint ∪ double'),
				'smallint ∪ float': allTypesCodecsTable.float.as('smallint ∪ float'),
				'smallint ∪ int': allTypesCodecsTable.int.as('smallint ∪ int'),
				'smallint ∪ medint': allTypesCodecsTable.medint.as('smallint ∪ medint'),
				'smallint ∪ smallint': allTypesCodecsTable.smallint.as('smallint ∪ smallint'),
				'smallint ∪ real': allTypesCodecsTable.real.as('smallint ∪ real'),
				'smallint ∪ tinyint': allTypesCodecsTable.tinyint.as('smallint ∪ tinyint'),
				'smallint ∪ year': allTypesCodecsTable.year.as('smallint ∪ year'),
				'real ∪ serial': allTypesCodecsTable.serial.as('real ∪ serial'),
				'real ∪ bigint53': allTypesCodecsTable.bigint53.as('real ∪ bigint53'),
				'real ∪ decimalnum': allTypesCodecsTable.decimalnum.as('real ∪ decimalnum'),
				'real ∪ double': allTypesCodecsTable.double.as('real ∪ double'),
				'real ∪ float': allTypesCodecsTable.float.as('real ∪ float'),
				'real ∪ int': allTypesCodecsTable.int.as('real ∪ int'),
				'real ∪ medint': allTypesCodecsTable.medint.as('real ∪ medint'),
				'real ∪ smallint': allTypesCodecsTable.smallint.as('real ∪ smallint'),
				'real ∪ real': allTypesCodecsTable.real.as('real ∪ real'),
				'real ∪ tinyint': allTypesCodecsTable.tinyint.as('real ∪ tinyint'),
				'real ∪ year': allTypesCodecsTable.year.as('real ∪ year'),
				'tinyint ∪ serial': allTypesCodecsTable.serial.as('tinyint ∪ serial'),
				'tinyint ∪ bigint53': allTypesCodecsTable.bigint53.as('tinyint ∪ bigint53'),
				'tinyint ∪ decimalnum': allTypesCodecsTable.decimalnum.as('tinyint ∪ decimalnum'),
				'tinyint ∪ double': allTypesCodecsTable.double.as('tinyint ∪ double'),
				'tinyint ∪ float': allTypesCodecsTable.float.as('tinyint ∪ float'),
				'tinyint ∪ int': allTypesCodecsTable.int.as('tinyint ∪ int'),
				'tinyint ∪ medint': allTypesCodecsTable.medint.as('tinyint ∪ medint'),
				'tinyint ∪ smallint': allTypesCodecsTable.smallint.as('tinyint ∪ smallint'),
				'tinyint ∪ real': allTypesCodecsTable.real.as('tinyint ∪ real'),
				'tinyint ∪ tinyint': allTypesCodecsTable.tinyint.as('tinyint ∪ tinyint'),
				'tinyint ∪ year': allTypesCodecsTable.year.as('tinyint ∪ year'),
				'year ∪ serial': allTypesCodecsTable.serial.as('year ∪ serial'),
				'year ∪ bigint53': allTypesCodecsTable.bigint53.as('year ∪ bigint53'),
				'year ∪ decimalnum': allTypesCodecsTable.decimalnum.as('year ∪ decimalnum'),
				'year ∪ double': allTypesCodecsTable.double.as('year ∪ double'),
				'year ∪ float': allTypesCodecsTable.float.as('year ∪ float'),
				'year ∪ int': allTypesCodecsTable.int.as('year ∪ int'),
				'year ∪ medint': allTypesCodecsTable.medint.as('year ∪ medint'),
				'year ∪ smallint': allTypesCodecsTable.smallint.as('year ∪ smallint'),
				'year ∪ real': allTypesCodecsTable.real.as('year ∪ real'),
				'year ∪ tinyint': allTypesCodecsTable.tinyint.as('year ∪ tinyint'),
				'year ∪ year': allTypesCodecsTable.year.as('year ∪ year'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'serial ∪ serial': 1,
			'serial ∪ bigint53': 1,
			'serial ∪ decimalnum': 1,
			'serial ∪ double': 1,
			'serial ∪ float': 1,
			'serial ∪ int': 1,
			'serial ∪ medint': 1,
			'serial ∪ smallint': 1,
			'serial ∪ real': 1,
			'serial ∪ tinyint': 1,
			'serial ∪ year': 1,
			'bigint53 ∪ serial': 9007199254740991,
			'bigint53 ∪ bigint53': 9007199254740991,
			'bigint53 ∪ decimalnum': 9007199254740991,
			'bigint53 ∪ double': 9007199254740991,
			'bigint53 ∪ float': 9007199254740991,
			'bigint53 ∪ int': 9007199254740991,
			'bigint53 ∪ medint': 9007199254740991,
			'bigint53 ∪ smallint': 9007199254740991,
			'bigint53 ∪ real': 9007199254740991,
			'bigint53 ∪ tinyint': 9007199254740991,
			'bigint53 ∪ year': 9007199254740991,
			'decimalnum ∪ serial': 9007199254740991,
			'decimalnum ∪ bigint53': 9007199254740991,
			'decimalnum ∪ decimalnum': 9007199254740991,
			'decimalnum ∪ double': 9007199254740991,
			'decimalnum ∪ float': 9007199254740991,
			'decimalnum ∪ int': 9007199254740991,
			'decimalnum ∪ medint': 9007199254740991,
			'decimalnum ∪ smallint': 9007199254740991,
			'decimalnum ∪ real': 9007199254740991,
			'decimalnum ∪ tinyint': 9007199254740991,
			'decimalnum ∪ year': 9007199254740991,
			'double ∪ serial': 15.35325689124218,
			'double ∪ bigint53': 15.35325689124218,
			'double ∪ decimalnum': 15.35325689124218,
			'double ∪ double': 15.35325689124218,
			'double ∪ float': 15.35325689124218,
			'double ∪ int': 15.35325689124218,
			'double ∪ medint': 15.35325689124218,
			'double ∪ smallint': 15.35325689124218,
			'double ∪ real': 15.35325689124218,
			'double ∪ tinyint': 15.35325689124218,
			'double ∪ year': 15.35325689124218,
			'float ∪ serial': 1.048596,
			'float ∪ bigint53': 1.048596,
			'float ∪ decimalnum': 1.0485960245132446,
			'float ∪ double': 1.0485960245132446,
			'float ∪ float': 1.048596,
			'float ∪ int': 1.0485960245132446,
			'float ∪ medint': 1.048596,
			'float ∪ smallint': 1.048596,
			'float ∪ real': 1.0485960245132446,
			'float ∪ tinyint': 1.048596,
			'float ∪ year': 1.048596,
			'int ∪ serial': 621,
			'int ∪ bigint53': 621,
			'int ∪ decimalnum': 621,
			'int ∪ double': 621,
			'int ∪ float': 621,
			'int ∪ int': 621,
			'int ∪ medint': 621,
			'int ∪ smallint': 621,
			'int ∪ real': 621,
			'int ∪ tinyint': 621,
			'int ∪ year': 621,
			'medint ∪ serial': 560,
			'medint ∪ bigint53': 560,
			'medint ∪ decimalnum': 560,
			'medint ∪ double': 560,
			'medint ∪ float': 560,
			'medint ∪ int': 560,
			'medint ∪ medint': 560,
			'medint ∪ smallint': 560,
			'medint ∪ real': 560,
			'medint ∪ tinyint': 560,
			'medint ∪ year': 560,
			'smallint ∪ serial': 14,
			'smallint ∪ bigint53': 14,
			'smallint ∪ decimalnum': 14,
			'smallint ∪ double': 14,
			'smallint ∪ float': 14,
			'smallint ∪ int': 14,
			'smallint ∪ medint': 14,
			'smallint ∪ smallint': 14,
			'smallint ∪ real': 14,
			'smallint ∪ tinyint': 14,
			'smallint ∪ year': 14,
			'real ∪ serial': 1.048596,
			'real ∪ bigint53': 1.048596,
			'real ∪ decimalnum': 1.048596,
			'real ∪ double': 1.048596,
			'real ∪ float': 1.048596,
			'real ∪ int': 1.048596,
			'real ∪ medint': 1.048596,
			'real ∪ smallint': 1.048596,
			'real ∪ real': 1.048596,
			'real ∪ tinyint': 1.048596,
			'real ∪ year': 1.048596,
			'tinyint ∪ serial': 7,
			'tinyint ∪ bigint53': 7,
			'tinyint ∪ decimalnum': 7,
			'tinyint ∪ double': 7,
			'tinyint ∪ float': 7,
			'tinyint ∪ int': 7,
			'tinyint ∪ medint': 7,
			'tinyint ∪ smallint': 7,
			'tinyint ∪ real': 7,
			'tinyint ∪ tinyint': 7,
			'tinyint ∪ year': 7,
			'year ∪ serial': 2025,
			'year ∪ bigint53': 2025,
			'year ∪ decimalnum': 2025,
			'year ∪ double': 2025,
			'year ∪ float': 2025,
			'year ∪ int': 2025,
			'year ∪ medint': 2025,
			'year ∪ smallint': 2025,
			'year ∪ real': 2025,
			'year ∪ tinyint': 127,
			'year ∪ year': 2025,
		},
		{
			'serial ∪ serial': 1,
			'serial ∪ bigint53': 9007199254740991,
			'serial ∪ decimalnum': 9007199254740991,
			'serial ∪ double': 15.35325689124218,
			'serial ∪ float': 1.0485960245132446,
			'serial ∪ int': 621,
			'serial ∪ medint': 560,
			'serial ∪ smallint': 14,
			'serial ∪ real': 1.048596,
			'serial ∪ tinyint': 7,
			'serial ∪ year': 2025,
			'bigint53 ∪ serial': 1,
			'bigint53 ∪ bigint53': 9007199254740991,
			'bigint53 ∪ decimalnum': 9007199254740991,
			'bigint53 ∪ double': 15.35325689124218,
			'bigint53 ∪ float': 1.0485960245132446,
			'bigint53 ∪ int': 621,
			'bigint53 ∪ medint': 560,
			'bigint53 ∪ smallint': 14,
			'bigint53 ∪ real': 1.048596,
			'bigint53 ∪ tinyint': 7,
			'bigint53 ∪ year': 2025,
			'decimalnum ∪ serial': 1,
			'decimalnum ∪ bigint53': 9007199254740991,
			'decimalnum ∪ decimalnum': 9007199254740991,
			'decimalnum ∪ double': 15.35325689124218,
			'decimalnum ∪ float': 1.0485960245132446,
			'decimalnum ∪ int': 621,
			'decimalnum ∪ medint': 560,
			'decimalnum ∪ smallint': 14,
			'decimalnum ∪ real': 1.048596,
			'decimalnum ∪ tinyint': 7,
			'decimalnum ∪ year': 2025,
			'double ∪ serial': 1,
			'double ∪ bigint53': 9007199254740991,
			'double ∪ decimalnum': 9007199254740991,
			'double ∪ double': 15.35325689124218,
			'double ∪ float': 1.0485960245132446,
			'double ∪ int': 621,
			'double ∪ medint': 560,
			'double ∪ smallint': 14,
			'double ∪ real': 1.048596,
			'double ∪ tinyint': 7,
			'double ∪ year': 2025,
			'float ∪ serial': 1,
			'float ∪ bigint53': 9007199000000000,
			'float ∪ decimalnum': 9007199254740991,
			'float ∪ double': 15.35325689124218,
			'float ∪ float': 1.048596,
			'float ∪ int': 621,
			'float ∪ medint': 560,
			'float ∪ smallint': 14,
			'float ∪ real': 1.048596,
			'float ∪ tinyint': 7,
			'float ∪ year': 2025,
			'int ∪ serial': 1,
			'int ∪ bigint53': 9007199254740991,
			'int ∪ decimalnum': 9007199254740991,
			'int ∪ double': 15.35325689124218,
			'int ∪ float': 1.0485960245132446,
			'int ∪ int': 621,
			'int ∪ medint': 560,
			'int ∪ smallint': 14,
			'int ∪ real': 1.048596,
			'int ∪ tinyint': 7,
			'int ∪ year': 2025,
			'medint ∪ serial': 1,
			'medint ∪ bigint53': 9007199254740991,
			'medint ∪ decimalnum': 9007199254740991,
			'medint ∪ double': 15.35325689124218,
			'medint ∪ float': 1.048596,
			'medint ∪ int': 621,
			'medint ∪ medint': 560,
			'medint ∪ smallint': 14,
			'medint ∪ real': 1.048596,
			'medint ∪ tinyint': 7,
			'medint ∪ year': 2025,
			'smallint ∪ serial': 1,
			'smallint ∪ bigint53': 9007199254740991,
			'smallint ∪ decimalnum': 9007199254740991,
			'smallint ∪ double': 15.35325689124218,
			'smallint ∪ float': 1.048596,
			'smallint ∪ int': 621,
			'smallint ∪ medint': 560,
			'smallint ∪ smallint': 14,
			'smallint ∪ real': 1.048596,
			'smallint ∪ tinyint': 7,
			'smallint ∪ year': 2025,
			'real ∪ serial': 1,
			'real ∪ bigint53': 9007199254740991,
			'real ∪ decimalnum': 9007199254740991,
			'real ∪ double': 15.35325689124218,
			'real ∪ float': 1.0485960245132446,
			'real ∪ int': 621,
			'real ∪ medint': 560,
			'real ∪ smallint': 14,
			'real ∪ real': 1.048596,
			'real ∪ tinyint': 7,
			'real ∪ year': 2025,
			'tinyint ∪ serial': 1,
			'tinyint ∪ bigint53': 9007199254740991,
			'tinyint ∪ decimalnum': 9007199254740991,
			'tinyint ∪ double': 15.35325689124218,
			'tinyint ∪ float': 1.048596,
			'tinyint ∪ int': 621,
			'tinyint ∪ medint': 560,
			'tinyint ∪ smallint': 14,
			'tinyint ∪ real': 1.048596,
			'tinyint ∪ tinyint': 7,
			'tinyint ∪ year': 127,
			'year ∪ serial': 1,
			'year ∪ bigint53': 9007199254740991,
			'year ∪ decimalnum': 9007199254740991,
			'year ∪ double': 15.35325689124218,
			'year ∪ float': 1.048596,
			'year ∪ int': 621,
			'year ∪ medint': 560,
			'year ∪ smallint': 14,
			'year ∪ real': 1.048596,
			'year ∪ tinyint': 7,
			'year ∪ year': 2025,
		},
	]));

	// ---- strings ----
	expect(
		await unionAll(
			db.select({
				'bigintstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ bigintstr'),
				'bigintstr ∪ char': allTypesCodecsTable.bigintstr.as('bigintstr ∪ char'),
				'bigintstr ∪ decimal': allTypesCodecsTable.bigintstr.as('bigintstr ∪ decimal'),
				'bigintstr ∪ text': allTypesCodecsTable.bigintstr.as('bigintstr ∪ text'),
				'bigintstr ∪ tinytext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ tinytext'),
				'bigintstr ∪ mediumtext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ mediumtext'),
				'bigintstr ∪ longtext': allTypesCodecsTable.bigintstr.as('bigintstr ∪ longtext'),
				'bigintstr ∪ varchar': allTypesCodecsTable.bigintstr.as('bigintstr ∪ varchar'),
				'bigintstr ∪ varbin': allTypesCodecsTable.bigintstr.as('bigintstr ∪ varbin'),
				'bigintstr ∪ stringblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringblob'),
				'bigintstr ∪ stringtinyblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringtinyblob'),
				'bigintstr ∪ stringmediumblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringmediumblob'),
				'bigintstr ∪ stringlongblob': allTypesCodecsTable.bigintstr.as('bigintstr ∪ stringlongblob'),
				'bigintstr ∪ datestr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ datestr'),
				'bigintstr ∪ datetimestr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ datetimestr'),
				'bigintstr ∪ timestampstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ timestampstr'),
				'bigintstr ∪ time': allTypesCodecsTable.bigintstr.as('bigintstr ∪ time'),
				'char ∪ bigintstr': allTypesCodecsTable.char.as('char ∪ bigintstr'),
				'char ∪ char': allTypesCodecsTable.char.as('char ∪ char'),
				'char ∪ decimal': allTypesCodecsTable.char.as('char ∪ decimal'),
				'char ∪ text': allTypesCodecsTable.char.as('char ∪ text'),
				'char ∪ tinytext': allTypesCodecsTable.char.as('char ∪ tinytext'),
				'char ∪ mediumtext': allTypesCodecsTable.char.as('char ∪ mediumtext'),
				'char ∪ longtext': allTypesCodecsTable.char.as('char ∪ longtext'),
				'char ∪ varchar': allTypesCodecsTable.char.as('char ∪ varchar'),
				'char ∪ varbin': allTypesCodecsTable.char.as('char ∪ varbin'),
				'char ∪ stringblob': allTypesCodecsTable.char.as('char ∪ stringblob'),
				'char ∪ stringtinyblob': allTypesCodecsTable.char.as('char ∪ stringtinyblob'),
				'char ∪ stringmediumblob': allTypesCodecsTable.char.as('char ∪ stringmediumblob'),
				'char ∪ stringlongblob': allTypesCodecsTable.char.as('char ∪ stringlongblob'),
				'char ∪ datestr': allTypesCodecsTable.char.as('char ∪ datestr'),
				'char ∪ datetimestr': allTypesCodecsTable.char.as('char ∪ datetimestr'),
				'char ∪ timestampstr': allTypesCodecsTable.char.as('char ∪ timestampstr'),
				'char ∪ time': allTypesCodecsTable.char.as('char ∪ time'),
				'decimal ∪ bigintstr': allTypesCodecsTable.decimal.as('decimal ∪ bigintstr'),
				'decimal ∪ char': allTypesCodecsTable.decimal.as('decimal ∪ char'),
				'decimal ∪ decimal': allTypesCodecsTable.decimal.as('decimal ∪ decimal'),
				'decimal ∪ text': allTypesCodecsTable.decimal.as('decimal ∪ text'),
				'decimal ∪ tinytext': allTypesCodecsTable.decimal.as('decimal ∪ tinytext'),
				'decimal ∪ mediumtext': allTypesCodecsTable.decimal.as('decimal ∪ mediumtext'),
				'decimal ∪ longtext': allTypesCodecsTable.decimal.as('decimal ∪ longtext'),
				'decimal ∪ varchar': allTypesCodecsTable.decimal.as('decimal ∪ varchar'),
				'decimal ∪ varbin': allTypesCodecsTable.decimal.as('decimal ∪ varbin'),
				'decimal ∪ stringblob': allTypesCodecsTable.decimal.as('decimal ∪ stringblob'),
				'decimal ∪ stringtinyblob': allTypesCodecsTable.decimal.as('decimal ∪ stringtinyblob'),
				'decimal ∪ stringmediumblob': allTypesCodecsTable.decimal.as('decimal ∪ stringmediumblob'),
				'decimal ∪ stringlongblob': allTypesCodecsTable.decimal.as('decimal ∪ stringlongblob'),
				'decimal ∪ datestr': allTypesCodecsTable.decimal.as('decimal ∪ datestr'),
				'decimal ∪ datetimestr': allTypesCodecsTable.decimal.as('decimal ∪ datetimestr'),
				'decimal ∪ timestampstr': allTypesCodecsTable.decimal.as('decimal ∪ timestampstr'),
				'decimal ∪ time': allTypesCodecsTable.decimal.as('decimal ∪ time'),
				'text ∪ bigintstr': allTypesCodecsTable.text.as('text ∪ bigintstr'),
				'text ∪ char': allTypesCodecsTable.text.as('text ∪ char'),
				'text ∪ decimal': allTypesCodecsTable.text.as('text ∪ decimal'),
				'text ∪ text': allTypesCodecsTable.text.as('text ∪ text'),
				'text ∪ tinytext': allTypesCodecsTable.text.as('text ∪ tinytext'),
				'text ∪ mediumtext': allTypesCodecsTable.text.as('text ∪ mediumtext'),
				'text ∪ longtext': allTypesCodecsTable.text.as('text ∪ longtext'),
				'text ∪ varchar': allTypesCodecsTable.text.as('text ∪ varchar'),
				'text ∪ varbin': allTypesCodecsTable.text.as('text ∪ varbin'),
				'text ∪ stringblob': allTypesCodecsTable.text.as('text ∪ stringblob'),
				'text ∪ stringtinyblob': allTypesCodecsTable.text.as('text ∪ stringtinyblob'),
				'text ∪ stringmediumblob': allTypesCodecsTable.text.as('text ∪ stringmediumblob'),
				'text ∪ stringlongblob': allTypesCodecsTable.text.as('text ∪ stringlongblob'),
				'text ∪ datestr': allTypesCodecsTable.text.as('text ∪ datestr'),
				'text ∪ datetimestr': allTypesCodecsTable.text.as('text ∪ datetimestr'),
				'text ∪ timestampstr': allTypesCodecsTable.text.as('text ∪ timestampstr'),
				'text ∪ time': allTypesCodecsTable.text.as('text ∪ time'),
				'tinytext ∪ bigintstr': allTypesCodecsTable.tinytext.as('tinytext ∪ bigintstr'),
				'tinytext ∪ char': allTypesCodecsTable.tinytext.as('tinytext ∪ char'),
				'tinytext ∪ decimal': allTypesCodecsTable.tinytext.as('tinytext ∪ decimal'),
				'tinytext ∪ text': allTypesCodecsTable.tinytext.as('tinytext ∪ text'),
				'tinytext ∪ tinytext': allTypesCodecsTable.tinytext.as('tinytext ∪ tinytext'),
				'tinytext ∪ mediumtext': allTypesCodecsTable.tinytext.as('tinytext ∪ mediumtext'),
				'tinytext ∪ longtext': allTypesCodecsTable.tinytext.as('tinytext ∪ longtext'),
				'tinytext ∪ varchar': allTypesCodecsTable.tinytext.as('tinytext ∪ varchar'),
				'tinytext ∪ varbin': allTypesCodecsTable.tinytext.as('tinytext ∪ varbin'),
				'tinytext ∪ stringblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringblob'),
				'tinytext ∪ stringtinyblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringtinyblob'),
				'tinytext ∪ stringmediumblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringmediumblob'),
				'tinytext ∪ stringlongblob': allTypesCodecsTable.tinytext.as('tinytext ∪ stringlongblob'),
				'tinytext ∪ datestr': allTypesCodecsTable.tinytext.as('tinytext ∪ datestr'),
				'tinytext ∪ datetimestr': allTypesCodecsTable.tinytext.as('tinytext ∪ datetimestr'),
				'tinytext ∪ timestampstr': allTypesCodecsTable.tinytext.as('tinytext ∪ timestampstr'),
				'tinytext ∪ time': allTypesCodecsTable.tinytext.as('tinytext ∪ time'),
				'mediumtext ∪ bigintstr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ bigintstr'),
				'mediumtext ∪ char': allTypesCodecsTable.mediumtext.as('mediumtext ∪ char'),
				'mediumtext ∪ decimal': allTypesCodecsTable.mediumtext.as('mediumtext ∪ decimal'),
				'mediumtext ∪ text': allTypesCodecsTable.mediumtext.as('mediumtext ∪ text'),
				'mediumtext ∪ tinytext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ tinytext'),
				'mediumtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ mediumtext'),
				'mediumtext ∪ longtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ longtext'),
				'mediumtext ∪ varchar': allTypesCodecsTable.mediumtext.as('mediumtext ∪ varchar'),
				'mediumtext ∪ varbin': allTypesCodecsTable.mediumtext.as('mediumtext ∪ varbin'),
				'mediumtext ∪ stringblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringblob'),
				'mediumtext ∪ stringtinyblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringtinyblob'),
				'mediumtext ∪ stringmediumblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringmediumblob'),
				'mediumtext ∪ stringlongblob': allTypesCodecsTable.mediumtext.as('mediumtext ∪ stringlongblob'),
				'mediumtext ∪ datestr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ datestr'),
				'mediumtext ∪ datetimestr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ datetimestr'),
				'mediumtext ∪ timestampstr': allTypesCodecsTable.mediumtext.as('mediumtext ∪ timestampstr'),
				'mediumtext ∪ time': allTypesCodecsTable.mediumtext.as('mediumtext ∪ time'),
				'longtext ∪ bigintstr': allTypesCodecsTable.longtext.as('longtext ∪ bigintstr'),
				'longtext ∪ char': allTypesCodecsTable.longtext.as('longtext ∪ char'),
				'longtext ∪ decimal': allTypesCodecsTable.longtext.as('longtext ∪ decimal'),
				'longtext ∪ text': allTypesCodecsTable.longtext.as('longtext ∪ text'),
				'longtext ∪ tinytext': allTypesCodecsTable.longtext.as('longtext ∪ tinytext'),
				'longtext ∪ mediumtext': allTypesCodecsTable.longtext.as('longtext ∪ mediumtext'),
				'longtext ∪ longtext': allTypesCodecsTable.longtext.as('longtext ∪ longtext'),
				'longtext ∪ varchar': allTypesCodecsTable.longtext.as('longtext ∪ varchar'),
				'longtext ∪ varbin': allTypesCodecsTable.longtext.as('longtext ∪ varbin'),
				'longtext ∪ stringblob': allTypesCodecsTable.longtext.as('longtext ∪ stringblob'),
				'longtext ∪ stringtinyblob': allTypesCodecsTable.longtext.as('longtext ∪ stringtinyblob'),
				'longtext ∪ stringmediumblob': allTypesCodecsTable.longtext.as('longtext ∪ stringmediumblob'),
				'longtext ∪ stringlongblob': allTypesCodecsTable.longtext.as('longtext ∪ stringlongblob'),
				'longtext ∪ datestr': allTypesCodecsTable.longtext.as('longtext ∪ datestr'),
				'longtext ∪ datetimestr': allTypesCodecsTable.longtext.as('longtext ∪ datetimestr'),
				'longtext ∪ timestampstr': allTypesCodecsTable.longtext.as('longtext ∪ timestampstr'),
				'longtext ∪ time': allTypesCodecsTable.longtext.as('longtext ∪ time'),
				'varchar ∪ bigintstr': allTypesCodecsTable.varchar.as('varchar ∪ bigintstr'),
				'varchar ∪ char': allTypesCodecsTable.varchar.as('varchar ∪ char'),
				'varchar ∪ decimal': allTypesCodecsTable.varchar.as('varchar ∪ decimal'),
				'varchar ∪ text': allTypesCodecsTable.varchar.as('varchar ∪ text'),
				'varchar ∪ tinytext': allTypesCodecsTable.varchar.as('varchar ∪ tinytext'),
				'varchar ∪ mediumtext': allTypesCodecsTable.varchar.as('varchar ∪ mediumtext'),
				'varchar ∪ longtext': allTypesCodecsTable.varchar.as('varchar ∪ longtext'),
				'varchar ∪ varchar': allTypesCodecsTable.varchar.as('varchar ∪ varchar'),
				'varchar ∪ varbin': allTypesCodecsTable.varchar.as('varchar ∪ varbin'),
				'varchar ∪ stringblob': allTypesCodecsTable.varchar.as('varchar ∪ stringblob'),
				'varchar ∪ stringtinyblob': allTypesCodecsTable.varchar.as('varchar ∪ stringtinyblob'),
				'varchar ∪ stringmediumblob': allTypesCodecsTable.varchar.as('varchar ∪ stringmediumblob'),
				'varchar ∪ stringlongblob': allTypesCodecsTable.varchar.as('varchar ∪ stringlongblob'),
				'varchar ∪ datestr': allTypesCodecsTable.varchar.as('varchar ∪ datestr'),
				'varchar ∪ datetimestr': allTypesCodecsTable.varchar.as('varchar ∪ datetimestr'),
				'varchar ∪ timestampstr': allTypesCodecsTable.varchar.as('varchar ∪ timestampstr'),
				'varchar ∪ time': allTypesCodecsTable.varchar.as('varchar ∪ time'),
				'varbin ∪ bigintstr': allTypesCodecsTable.varbin.as('varbin ∪ bigintstr'),
				'varbin ∪ char': allTypesCodecsTable.varbin.as('varbin ∪ char'),
				'varbin ∪ decimal': allTypesCodecsTable.varbin.as('varbin ∪ decimal'),
				'varbin ∪ text': allTypesCodecsTable.varbin.as('varbin ∪ text'),
				'varbin ∪ tinytext': allTypesCodecsTable.varbin.as('varbin ∪ tinytext'),
				'varbin ∪ mediumtext': allTypesCodecsTable.varbin.as('varbin ∪ mediumtext'),
				'varbin ∪ longtext': allTypesCodecsTable.varbin.as('varbin ∪ longtext'),
				'varbin ∪ varchar': allTypesCodecsTable.varbin.as('varbin ∪ varchar'),
				'varbin ∪ varbin': allTypesCodecsTable.varbin.as('varbin ∪ varbin'),
				'varbin ∪ stringblob': allTypesCodecsTable.varbin.as('varbin ∪ stringblob'),
				'varbin ∪ stringtinyblob': allTypesCodecsTable.varbin.as('varbin ∪ stringtinyblob'),
				'varbin ∪ stringmediumblob': allTypesCodecsTable.varbin.as('varbin ∪ stringmediumblob'),
				'varbin ∪ stringlongblob': allTypesCodecsTable.varbin.as('varbin ∪ stringlongblob'),
				'varbin ∪ datestr': allTypesCodecsTable.varbin.as('varbin ∪ datestr'),
				'varbin ∪ datetimestr': allTypesCodecsTable.varbin.as('varbin ∪ datetimestr'),
				'varbin ∪ timestampstr': allTypesCodecsTable.varbin.as('varbin ∪ timestampstr'),
				'varbin ∪ time': allTypesCodecsTable.varbin.as('varbin ∪ time'),
				'stringblob ∪ bigintstr': allTypesCodecsTable.stringblob.as('stringblob ∪ bigintstr'),
				'stringblob ∪ char': allTypesCodecsTable.stringblob.as('stringblob ∪ char'),
				'stringblob ∪ decimal': allTypesCodecsTable.stringblob.as('stringblob ∪ decimal'),
				'stringblob ∪ text': allTypesCodecsTable.stringblob.as('stringblob ∪ text'),
				'stringblob ∪ tinytext': allTypesCodecsTable.stringblob.as('stringblob ∪ tinytext'),
				'stringblob ∪ mediumtext': allTypesCodecsTable.stringblob.as('stringblob ∪ mediumtext'),
				'stringblob ∪ longtext': allTypesCodecsTable.stringblob.as('stringblob ∪ longtext'),
				'stringblob ∪ varchar': allTypesCodecsTable.stringblob.as('stringblob ∪ varchar'),
				'stringblob ∪ varbin': allTypesCodecsTable.stringblob.as('stringblob ∪ varbin'),
				'stringblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringblob'),
				'stringblob ∪ stringtinyblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringtinyblob'),
				'stringblob ∪ stringmediumblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringmediumblob'),
				'stringblob ∪ stringlongblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringlongblob'),
				'stringblob ∪ datestr': allTypesCodecsTable.stringblob.as('stringblob ∪ datestr'),
				'stringblob ∪ datetimestr': allTypesCodecsTable.stringblob.as('stringblob ∪ datetimestr'),
				'stringblob ∪ timestampstr': allTypesCodecsTable.stringblob.as('stringblob ∪ timestampstr'),
				'stringblob ∪ time': allTypesCodecsTable.stringblob.as('stringblob ∪ time'),
				'stringtinyblob ∪ bigintstr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ bigintstr'),
				'stringtinyblob ∪ char': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ char'),
				'stringtinyblob ∪ decimal': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ decimal'),
				'stringtinyblob ∪ text': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ text'),
				'stringtinyblob ∪ tinytext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ tinytext'),
				'stringtinyblob ∪ mediumtext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ mediumtext'),
				'stringtinyblob ∪ longtext': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ longtext'),
				'stringtinyblob ∪ varchar': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ varchar'),
				'stringtinyblob ∪ varbin': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ varbin'),
				'stringtinyblob ∪ stringblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringblob'),
				'stringtinyblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringtinyblob'),
				'stringtinyblob ∪ stringmediumblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringmediumblob'),
				'stringtinyblob ∪ stringlongblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringlongblob'),
				'stringtinyblob ∪ datestr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ datestr'),
				'stringtinyblob ∪ datetimestr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ datetimestr'),
				'stringtinyblob ∪ timestampstr': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ timestampstr'),
				'stringtinyblob ∪ time': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ time'),
				'stringmediumblob ∪ bigintstr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ bigintstr'),
				'stringmediumblob ∪ char': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ char'),
				'stringmediumblob ∪ decimal': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ decimal'),
				'stringmediumblob ∪ text': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ text'),
				'stringmediumblob ∪ tinytext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ tinytext'),
				'stringmediumblob ∪ mediumtext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ mediumtext'),
				'stringmediumblob ∪ longtext': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ longtext'),
				'stringmediumblob ∪ varchar': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ varchar'),
				'stringmediumblob ∪ varbin': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ varbin'),
				'stringmediumblob ∪ stringblob': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ stringblob'),
				'stringmediumblob ∪ stringtinyblob': allTypesCodecsTable.stringmediumblob.as(
					'stringmediumblob ∪ stringtinyblob',
				),
				'stringmediumblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
					'stringmediumblob ∪ stringmediumblob',
				),
				'stringmediumblob ∪ stringlongblob': allTypesCodecsTable.stringmediumblob.as(
					'stringmediumblob ∪ stringlongblob',
				),
				'stringmediumblob ∪ datestr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ datestr'),
				'stringmediumblob ∪ datetimestr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ datetimestr'),
				'stringmediumblob ∪ timestampstr': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ timestampstr'),
				'stringmediumblob ∪ time': allTypesCodecsTable.stringmediumblob.as('stringmediumblob ∪ time'),
				'stringlongblob ∪ bigintstr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ bigintstr'),
				'stringlongblob ∪ char': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ char'),
				'stringlongblob ∪ decimal': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ decimal'),
				'stringlongblob ∪ text': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ text'),
				'stringlongblob ∪ tinytext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ tinytext'),
				'stringlongblob ∪ mediumtext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ mediumtext'),
				'stringlongblob ∪ longtext': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ longtext'),
				'stringlongblob ∪ varchar': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ varchar'),
				'stringlongblob ∪ varbin': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ varbin'),
				'stringlongblob ∪ stringblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringblob'),
				'stringlongblob ∪ stringtinyblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringtinyblob'),
				'stringlongblob ∪ stringmediumblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringmediumblob'),
				'stringlongblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringlongblob'),
				'stringlongblob ∪ datestr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ datestr'),
				'stringlongblob ∪ datetimestr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ datetimestr'),
				'stringlongblob ∪ timestampstr': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ timestampstr'),
				'stringlongblob ∪ time': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ time'),
				'datestr ∪ bigintstr': allTypesCodecsTable.datestr.as('datestr ∪ bigintstr'),
				'datestr ∪ char': allTypesCodecsTable.datestr.as('datestr ∪ char'),
				'datestr ∪ decimal': allTypesCodecsTable.datestr.as('datestr ∪ decimal'),
				'datestr ∪ text': allTypesCodecsTable.datestr.as('datestr ∪ text'),
				'datestr ∪ tinytext': allTypesCodecsTable.datestr.as('datestr ∪ tinytext'),
				'datestr ∪ mediumtext': allTypesCodecsTable.datestr.as('datestr ∪ mediumtext'),
				'datestr ∪ longtext': allTypesCodecsTable.datestr.as('datestr ∪ longtext'),
				'datestr ∪ varchar': allTypesCodecsTable.datestr.as('datestr ∪ varchar'),
				'datestr ∪ varbin': allTypesCodecsTable.datestr.as('datestr ∪ varbin'),
				'datestr ∪ stringblob': allTypesCodecsTable.datestr.as('datestr ∪ stringblob'),
				'datestr ∪ stringtinyblob': allTypesCodecsTable.datestr.as('datestr ∪ stringtinyblob'),
				'datestr ∪ stringmediumblob': allTypesCodecsTable.datestr.as('datestr ∪ stringmediumblob'),
				'datestr ∪ stringlongblob': allTypesCodecsTable.datestr.as('datestr ∪ stringlongblob'),
				'datestr ∪ datestr': allTypesCodecsTable.datestr.as('datestr ∪ datestr'),
				'datestr ∪ datetimestr': allTypesCodecsTable.datestr.as('datestr ∪ datetimestr'),
				'datestr ∪ timestampstr': allTypesCodecsTable.datestr.as('datestr ∪ timestampstr'),
				'datetimestr ∪ bigintstr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ bigintstr'),
				'datetimestr ∪ char': allTypesCodecsTable.datetimestr.as('datetimestr ∪ char'),
				'datetimestr ∪ decimal': allTypesCodecsTable.datetimestr.as('datetimestr ∪ decimal'),
				'datetimestr ∪ text': allTypesCodecsTable.datetimestr.as('datetimestr ∪ text'),
				'datetimestr ∪ tinytext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ tinytext'),
				'datetimestr ∪ mediumtext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ mediumtext'),
				'datetimestr ∪ longtext': allTypesCodecsTable.datetimestr.as('datetimestr ∪ longtext'),
				'datetimestr ∪ varchar': allTypesCodecsTable.datetimestr.as('datetimestr ∪ varchar'),
				'datetimestr ∪ varbin': allTypesCodecsTable.datetimestr.as('datetimestr ∪ varbin'),
				'datetimestr ∪ stringblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringblob'),
				'datetimestr ∪ stringtinyblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringtinyblob'),
				'datetimestr ∪ stringmediumblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringmediumblob'),
				'datetimestr ∪ stringlongblob': allTypesCodecsTable.datetimestr.as('datetimestr ∪ stringlongblob'),
				'datetimestr ∪ datestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datestr'),
				'datetimestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datetimestr'),
				'datetimestr ∪ timestampstr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ timestampstr'),
				'timestampstr ∪ bigintstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ bigintstr'),
				'timestampstr ∪ char': allTypesCodecsTable.timestampstr.as('timestampstr ∪ char'),
				'timestampstr ∪ decimal': allTypesCodecsTable.timestampstr.as('timestampstr ∪ decimal'),
				'timestampstr ∪ text': allTypesCodecsTable.timestampstr.as('timestampstr ∪ text'),
				'timestampstr ∪ tinytext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ tinytext'),
				'timestampstr ∪ mediumtext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ mediumtext'),
				'timestampstr ∪ longtext': allTypesCodecsTable.timestampstr.as('timestampstr ∪ longtext'),
				'timestampstr ∪ varchar': allTypesCodecsTable.timestampstr.as('timestampstr ∪ varchar'),
				'timestampstr ∪ varbin': allTypesCodecsTable.timestampstr.as('timestampstr ∪ varbin'),
				'timestampstr ∪ stringblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringblob'),
				'timestampstr ∪ stringtinyblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringtinyblob'),
				'timestampstr ∪ stringmediumblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringmediumblob'),
				'timestampstr ∪ stringlongblob': allTypesCodecsTable.timestampstr.as('timestampstr ∪ stringlongblob'),
				'timestampstr ∪ datestr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ datestr'),
				'timestampstr ∪ datetimestr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ datetimestr'),
				'timestampstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ timestampstr'),
				'time ∪ bigintstr': allTypesCodecsTable.time.as('time ∪ bigintstr'),
				'time ∪ char': allTypesCodecsTable.time.as('time ∪ char'),
				'time ∪ decimal': allTypesCodecsTable.time.as('time ∪ decimal'),
				'time ∪ text': allTypesCodecsTable.time.as('time ∪ text'),
				'time ∪ tinytext': allTypesCodecsTable.time.as('time ∪ tinytext'),
				'time ∪ mediumtext': allTypesCodecsTable.time.as('time ∪ mediumtext'),
				'time ∪ longtext': allTypesCodecsTable.time.as('time ∪ longtext'),
				'time ∪ varchar': allTypesCodecsTable.time.as('time ∪ varchar'),
				'time ∪ varbin': allTypesCodecsTable.time.as('time ∪ varbin'),
				'time ∪ stringblob': allTypesCodecsTable.time.as('time ∪ stringblob'),
				'time ∪ stringtinyblob': allTypesCodecsTable.time.as('time ∪ stringtinyblob'),
				'time ∪ stringmediumblob': allTypesCodecsTable.time.as('time ∪ stringmediumblob'),
				'time ∪ stringlongblob': allTypesCodecsTable.time.as('time ∪ stringlongblob'),
				'time ∪ time': allTypesCodecsTable.time.as('time ∪ time'),
				'binary ∪ binary': allTypesCodecsTable.binary.as('binary ∪ binary'),
			}).from(allTypesCodecsTable),
			db.select({
				'bigintstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('bigintstr ∪ bigintstr'),
				'bigintstr ∪ char': allTypesCodecsTable.char.as('bigintstr ∪ char'),
				'bigintstr ∪ decimal': allTypesCodecsTable.decimal.as('bigintstr ∪ decimal'),
				'bigintstr ∪ text': allTypesCodecsTable.text.as('bigintstr ∪ text'),
				'bigintstr ∪ tinytext': allTypesCodecsTable.tinytext.as('bigintstr ∪ tinytext'),
				'bigintstr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('bigintstr ∪ mediumtext'),
				'bigintstr ∪ longtext': allTypesCodecsTable.longtext.as('bigintstr ∪ longtext'),
				'bigintstr ∪ varchar': allTypesCodecsTable.varchar.as('bigintstr ∪ varchar'),
				'bigintstr ∪ varbin': allTypesCodecsTable.varbin.as('bigintstr ∪ varbin'),
				'bigintstr ∪ stringblob': allTypesCodecsTable.stringblob.as('bigintstr ∪ stringblob'),
				'bigintstr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('bigintstr ∪ stringtinyblob'),
				'bigintstr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('bigintstr ∪ stringmediumblob'),
				'bigintstr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('bigintstr ∪ stringlongblob'),
				'bigintstr ∪ datestr': allTypesCodecsTable.datestr.as('bigintstr ∪ datestr'),
				'bigintstr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('bigintstr ∪ datetimestr'),
				'bigintstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('bigintstr ∪ timestampstr'),
				'bigintstr ∪ time': allTypesCodecsTable.time.as('bigintstr ∪ time'),
				'char ∪ bigintstr': allTypesCodecsTable.bigintstr.as('char ∪ bigintstr'),
				'char ∪ char': allTypesCodecsTable.char.as('char ∪ char'),
				'char ∪ decimal': allTypesCodecsTable.decimal.as('char ∪ decimal'),
				'char ∪ text': allTypesCodecsTable.text.as('char ∪ text'),
				'char ∪ tinytext': allTypesCodecsTable.tinytext.as('char ∪ tinytext'),
				'char ∪ mediumtext': allTypesCodecsTable.mediumtext.as('char ∪ mediumtext'),
				'char ∪ longtext': allTypesCodecsTable.longtext.as('char ∪ longtext'),
				'char ∪ varchar': allTypesCodecsTable.varchar.as('char ∪ varchar'),
				'char ∪ varbin': allTypesCodecsTable.varbin.as('char ∪ varbin'),
				'char ∪ stringblob': allTypesCodecsTable.stringblob.as('char ∪ stringblob'),
				'char ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('char ∪ stringtinyblob'),
				'char ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('char ∪ stringmediumblob'),
				'char ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('char ∪ stringlongblob'),
				'char ∪ datestr': allTypesCodecsTable.datestr.as('char ∪ datestr'),
				'char ∪ datetimestr': allTypesCodecsTable.datetimestr.as('char ∪ datetimestr'),
				'char ∪ timestampstr': allTypesCodecsTable.timestampstr.as('char ∪ timestampstr'),
				'char ∪ time': allTypesCodecsTable.time.as('char ∪ time'),
				'decimal ∪ bigintstr': allTypesCodecsTable.bigintstr.as('decimal ∪ bigintstr'),
				'decimal ∪ char': allTypesCodecsTable.char.as('decimal ∪ char'),
				'decimal ∪ decimal': allTypesCodecsTable.decimal.as('decimal ∪ decimal'),
				'decimal ∪ text': allTypesCodecsTable.text.as('decimal ∪ text'),
				'decimal ∪ tinytext': allTypesCodecsTable.tinytext.as('decimal ∪ tinytext'),
				'decimal ∪ mediumtext': allTypesCodecsTable.mediumtext.as('decimal ∪ mediumtext'),
				'decimal ∪ longtext': allTypesCodecsTable.longtext.as('decimal ∪ longtext'),
				'decimal ∪ varchar': allTypesCodecsTable.varchar.as('decimal ∪ varchar'),
				'decimal ∪ varbin': allTypesCodecsTable.varbin.as('decimal ∪ varbin'),
				'decimal ∪ stringblob': allTypesCodecsTable.stringblob.as('decimal ∪ stringblob'),
				'decimal ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('decimal ∪ stringtinyblob'),
				'decimal ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('decimal ∪ stringmediumblob'),
				'decimal ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('decimal ∪ stringlongblob'),
				'decimal ∪ datestr': allTypesCodecsTable.datestr.as('decimal ∪ datestr'),
				'decimal ∪ datetimestr': allTypesCodecsTable.datetimestr.as('decimal ∪ datetimestr'),
				'decimal ∪ timestampstr': allTypesCodecsTable.timestampstr.as('decimal ∪ timestampstr'),
				'decimal ∪ time': allTypesCodecsTable.time.as('decimal ∪ time'),
				'text ∪ bigintstr': allTypesCodecsTable.bigintstr.as('text ∪ bigintstr'),
				'text ∪ char': allTypesCodecsTable.char.as('text ∪ char'),
				'text ∪ decimal': allTypesCodecsTable.decimal.as('text ∪ decimal'),
				'text ∪ text': allTypesCodecsTable.text.as('text ∪ text'),
				'text ∪ tinytext': allTypesCodecsTable.tinytext.as('text ∪ tinytext'),
				'text ∪ mediumtext': allTypesCodecsTable.mediumtext.as('text ∪ mediumtext'),
				'text ∪ longtext': allTypesCodecsTable.longtext.as('text ∪ longtext'),
				'text ∪ varchar': allTypesCodecsTable.varchar.as('text ∪ varchar'),
				'text ∪ varbin': allTypesCodecsTable.varbin.as('text ∪ varbin'),
				'text ∪ stringblob': allTypesCodecsTable.stringblob.as('text ∪ stringblob'),
				'text ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('text ∪ stringtinyblob'),
				'text ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('text ∪ stringmediumblob'),
				'text ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('text ∪ stringlongblob'),
				'text ∪ datestr': allTypesCodecsTable.datestr.as('text ∪ datestr'),
				'text ∪ datetimestr': allTypesCodecsTable.datetimestr.as('text ∪ datetimestr'),
				'text ∪ timestampstr': allTypesCodecsTable.timestampstr.as('text ∪ timestampstr'),
				'text ∪ time': allTypesCodecsTable.time.as('text ∪ time'),
				'tinytext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('tinytext ∪ bigintstr'),
				'tinytext ∪ char': allTypesCodecsTable.char.as('tinytext ∪ char'),
				'tinytext ∪ decimal': allTypesCodecsTable.decimal.as('tinytext ∪ decimal'),
				'tinytext ∪ text': allTypesCodecsTable.text.as('tinytext ∪ text'),
				'tinytext ∪ tinytext': allTypesCodecsTable.tinytext.as('tinytext ∪ tinytext'),
				'tinytext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('tinytext ∪ mediumtext'),
				'tinytext ∪ longtext': allTypesCodecsTable.longtext.as('tinytext ∪ longtext'),
				'tinytext ∪ varchar': allTypesCodecsTable.varchar.as('tinytext ∪ varchar'),
				'tinytext ∪ varbin': allTypesCodecsTable.varbin.as('tinytext ∪ varbin'),
				'tinytext ∪ stringblob': allTypesCodecsTable.stringblob.as('tinytext ∪ stringblob'),
				'tinytext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('tinytext ∪ stringtinyblob'),
				'tinytext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('tinytext ∪ stringmediumblob'),
				'tinytext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('tinytext ∪ stringlongblob'),
				'tinytext ∪ datestr': allTypesCodecsTable.datestr.as('tinytext ∪ datestr'),
				'tinytext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('tinytext ∪ datetimestr'),
				'tinytext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('tinytext ∪ timestampstr'),
				'tinytext ∪ time': allTypesCodecsTable.time.as('tinytext ∪ time'),
				'mediumtext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('mediumtext ∪ bigintstr'),
				'mediumtext ∪ char': allTypesCodecsTable.char.as('mediumtext ∪ char'),
				'mediumtext ∪ decimal': allTypesCodecsTable.decimal.as('mediumtext ∪ decimal'),
				'mediumtext ∪ text': allTypesCodecsTable.text.as('mediumtext ∪ text'),
				'mediumtext ∪ tinytext': allTypesCodecsTable.tinytext.as('mediumtext ∪ tinytext'),
				'mediumtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('mediumtext ∪ mediumtext'),
				'mediumtext ∪ longtext': allTypesCodecsTable.longtext.as('mediumtext ∪ longtext'),
				'mediumtext ∪ varchar': allTypesCodecsTable.varchar.as('mediumtext ∪ varchar'),
				'mediumtext ∪ varbin': allTypesCodecsTable.varbin.as('mediumtext ∪ varbin'),
				'mediumtext ∪ stringblob': allTypesCodecsTable.stringblob.as('mediumtext ∪ stringblob'),
				'mediumtext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('mediumtext ∪ stringtinyblob'),
				'mediumtext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('mediumtext ∪ stringmediumblob'),
				'mediumtext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('mediumtext ∪ stringlongblob'),
				'mediumtext ∪ datestr': allTypesCodecsTable.datestr.as('mediumtext ∪ datestr'),
				'mediumtext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('mediumtext ∪ datetimestr'),
				'mediumtext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('mediumtext ∪ timestampstr'),
				'mediumtext ∪ time': allTypesCodecsTable.time.as('mediumtext ∪ time'),
				'longtext ∪ bigintstr': allTypesCodecsTable.bigintstr.as('longtext ∪ bigintstr'),
				'longtext ∪ char': allTypesCodecsTable.char.as('longtext ∪ char'),
				'longtext ∪ decimal': allTypesCodecsTable.decimal.as('longtext ∪ decimal'),
				'longtext ∪ text': allTypesCodecsTable.text.as('longtext ∪ text'),
				'longtext ∪ tinytext': allTypesCodecsTable.tinytext.as('longtext ∪ tinytext'),
				'longtext ∪ mediumtext': allTypesCodecsTable.mediumtext.as('longtext ∪ mediumtext'),
				'longtext ∪ longtext': allTypesCodecsTable.longtext.as('longtext ∪ longtext'),
				'longtext ∪ varchar': allTypesCodecsTable.varchar.as('longtext ∪ varchar'),
				'longtext ∪ varbin': allTypesCodecsTable.varbin.as('longtext ∪ varbin'),
				'longtext ∪ stringblob': allTypesCodecsTable.stringblob.as('longtext ∪ stringblob'),
				'longtext ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('longtext ∪ stringtinyblob'),
				'longtext ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('longtext ∪ stringmediumblob'),
				'longtext ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('longtext ∪ stringlongblob'),
				'longtext ∪ datestr': allTypesCodecsTable.datestr.as('longtext ∪ datestr'),
				'longtext ∪ datetimestr': allTypesCodecsTable.datetimestr.as('longtext ∪ datetimestr'),
				'longtext ∪ timestampstr': allTypesCodecsTable.timestampstr.as('longtext ∪ timestampstr'),
				'longtext ∪ time': allTypesCodecsTable.time.as('longtext ∪ time'),
				'varchar ∪ bigintstr': allTypesCodecsTable.bigintstr.as('varchar ∪ bigintstr'),
				'varchar ∪ char': allTypesCodecsTable.char.as('varchar ∪ char'),
				'varchar ∪ decimal': allTypesCodecsTable.decimal.as('varchar ∪ decimal'),
				'varchar ∪ text': allTypesCodecsTable.text.as('varchar ∪ text'),
				'varchar ∪ tinytext': allTypesCodecsTable.tinytext.as('varchar ∪ tinytext'),
				'varchar ∪ mediumtext': allTypesCodecsTable.mediumtext.as('varchar ∪ mediumtext'),
				'varchar ∪ longtext': allTypesCodecsTable.longtext.as('varchar ∪ longtext'),
				'varchar ∪ varchar': allTypesCodecsTable.varchar.as('varchar ∪ varchar'),
				'varchar ∪ varbin': allTypesCodecsTable.varbin.as('varchar ∪ varbin'),
				'varchar ∪ stringblob': allTypesCodecsTable.stringblob.as('varchar ∪ stringblob'),
				'varchar ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('varchar ∪ stringtinyblob'),
				'varchar ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('varchar ∪ stringmediumblob'),
				'varchar ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('varchar ∪ stringlongblob'),
				'varchar ∪ datestr': allTypesCodecsTable.datestr.as('varchar ∪ datestr'),
				'varchar ∪ datetimestr': allTypesCodecsTable.datetimestr.as('varchar ∪ datetimestr'),
				'varchar ∪ timestampstr': allTypesCodecsTable.timestampstr.as('varchar ∪ timestampstr'),
				'varchar ∪ time': allTypesCodecsTable.time.as('varchar ∪ time'),
				'varbin ∪ bigintstr': allTypesCodecsTable.bigintstr.as('varbin ∪ bigintstr'),
				'varbin ∪ char': allTypesCodecsTable.char.as('varbin ∪ char'),
				'varbin ∪ decimal': allTypesCodecsTable.decimal.as('varbin ∪ decimal'),
				'varbin ∪ text': allTypesCodecsTable.text.as('varbin ∪ text'),
				'varbin ∪ tinytext': allTypesCodecsTable.tinytext.as('varbin ∪ tinytext'),
				'varbin ∪ mediumtext': allTypesCodecsTable.mediumtext.as('varbin ∪ mediumtext'),
				'varbin ∪ longtext': allTypesCodecsTable.longtext.as('varbin ∪ longtext'),
				'varbin ∪ varchar': allTypesCodecsTable.varchar.as('varbin ∪ varchar'),
				'varbin ∪ varbin': allTypesCodecsTable.varbin.as('varbin ∪ varbin'),
				'varbin ∪ stringblob': allTypesCodecsTable.stringblob.as('varbin ∪ stringblob'),
				'varbin ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('varbin ∪ stringtinyblob'),
				'varbin ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('varbin ∪ stringmediumblob'),
				'varbin ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('varbin ∪ stringlongblob'),
				'varbin ∪ datestr': allTypesCodecsTable.datestr.as('varbin ∪ datestr'),
				'varbin ∪ datetimestr': allTypesCodecsTable.datetimestr.as('varbin ∪ datetimestr'),
				'varbin ∪ timestampstr': allTypesCodecsTable.timestampstr.as('varbin ∪ timestampstr'),
				'varbin ∪ time': allTypesCodecsTable.time.as('varbin ∪ time'),
				'stringblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringblob ∪ bigintstr'),
				'stringblob ∪ char': allTypesCodecsTable.char.as('stringblob ∪ char'),
				'stringblob ∪ decimal': allTypesCodecsTable.decimal.as('stringblob ∪ decimal'),
				'stringblob ∪ text': allTypesCodecsTable.text.as('stringblob ∪ text'),
				'stringblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringblob ∪ tinytext'),
				'stringblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringblob ∪ mediumtext'),
				'stringblob ∪ longtext': allTypesCodecsTable.longtext.as('stringblob ∪ longtext'),
				'stringblob ∪ varchar': allTypesCodecsTable.varchar.as('stringblob ∪ varchar'),
				'stringblob ∪ varbin': allTypesCodecsTable.varbin.as('stringblob ∪ varbin'),
				'stringblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringblob ∪ stringblob'),
				'stringblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringblob ∪ stringtinyblob'),
				'stringblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('stringblob ∪ stringmediumblob'),
				'stringblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringblob ∪ stringlongblob'),
				'stringblob ∪ datestr': allTypesCodecsTable.datestr.as('stringblob ∪ datestr'),
				'stringblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringblob ∪ datetimestr'),
				'stringblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringblob ∪ timestampstr'),
				'stringblob ∪ time': allTypesCodecsTable.time.as('stringblob ∪ time'),
				'stringtinyblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringtinyblob ∪ bigintstr'),
				'stringtinyblob ∪ char': allTypesCodecsTable.char.as('stringtinyblob ∪ char'),
				'stringtinyblob ∪ decimal': allTypesCodecsTable.decimal.as('stringtinyblob ∪ decimal'),
				'stringtinyblob ∪ text': allTypesCodecsTable.text.as('stringtinyblob ∪ text'),
				'stringtinyblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringtinyblob ∪ tinytext'),
				'stringtinyblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringtinyblob ∪ mediumtext'),
				'stringtinyblob ∪ longtext': allTypesCodecsTable.longtext.as('stringtinyblob ∪ longtext'),
				'stringtinyblob ∪ varchar': allTypesCodecsTable.varchar.as('stringtinyblob ∪ varchar'),
				'stringtinyblob ∪ varbin': allTypesCodecsTable.varbin.as('stringtinyblob ∪ varbin'),
				'stringtinyblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringtinyblob ∪ stringblob'),
				'stringtinyblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringtinyblob ∪ stringtinyblob'),
				'stringtinyblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
					'stringtinyblob ∪ stringmediumblob',
				),
				'stringtinyblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringtinyblob ∪ stringlongblob'),
				'stringtinyblob ∪ datestr': allTypesCodecsTable.datestr.as('stringtinyblob ∪ datestr'),
				'stringtinyblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringtinyblob ∪ datetimestr'),
				'stringtinyblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringtinyblob ∪ timestampstr'),
				'stringtinyblob ∪ time': allTypesCodecsTable.time.as('stringtinyblob ∪ time'),
				'stringmediumblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringmediumblob ∪ bigintstr'),
				'stringmediumblob ∪ char': allTypesCodecsTable.char.as('stringmediumblob ∪ char'),
				'stringmediumblob ∪ decimal': allTypesCodecsTable.decimal.as('stringmediumblob ∪ decimal'),
				'stringmediumblob ∪ text': allTypesCodecsTable.text.as('stringmediumblob ∪ text'),
				'stringmediumblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringmediumblob ∪ tinytext'),
				'stringmediumblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringmediumblob ∪ mediumtext'),
				'stringmediumblob ∪ longtext': allTypesCodecsTable.longtext.as('stringmediumblob ∪ longtext'),
				'stringmediumblob ∪ varchar': allTypesCodecsTable.varchar.as('stringmediumblob ∪ varchar'),
				'stringmediumblob ∪ varbin': allTypesCodecsTable.varbin.as('stringmediumblob ∪ varbin'),
				'stringmediumblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringmediumblob ∪ stringblob'),
				'stringmediumblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringmediumblob ∪ stringtinyblob'),
				'stringmediumblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
					'stringmediumblob ∪ stringmediumblob',
				),
				'stringmediumblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringmediumblob ∪ stringlongblob'),
				'stringmediumblob ∪ datestr': allTypesCodecsTable.datestr.as('stringmediumblob ∪ datestr'),
				'stringmediumblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringmediumblob ∪ datetimestr'),
				'stringmediumblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringmediumblob ∪ timestampstr'),
				'stringmediumblob ∪ time': allTypesCodecsTable.time.as('stringmediumblob ∪ time'),
				'stringlongblob ∪ bigintstr': allTypesCodecsTable.bigintstr.as('stringlongblob ∪ bigintstr'),
				'stringlongblob ∪ char': allTypesCodecsTable.char.as('stringlongblob ∪ char'),
				'stringlongblob ∪ decimal': allTypesCodecsTable.decimal.as('stringlongblob ∪ decimal'),
				'stringlongblob ∪ text': allTypesCodecsTable.text.as('stringlongblob ∪ text'),
				'stringlongblob ∪ tinytext': allTypesCodecsTable.tinytext.as('stringlongblob ∪ tinytext'),
				'stringlongblob ∪ mediumtext': allTypesCodecsTable.mediumtext.as('stringlongblob ∪ mediumtext'),
				'stringlongblob ∪ longtext': allTypesCodecsTable.longtext.as('stringlongblob ∪ longtext'),
				'stringlongblob ∪ varchar': allTypesCodecsTable.varchar.as('stringlongblob ∪ varchar'),
				'stringlongblob ∪ varbin': allTypesCodecsTable.varbin.as('stringlongblob ∪ varbin'),
				'stringlongblob ∪ stringblob': allTypesCodecsTable.stringblob.as('stringlongblob ∪ stringblob'),
				'stringlongblob ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('stringlongblob ∪ stringtinyblob'),
				'stringlongblob ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as(
					'stringlongblob ∪ stringmediumblob',
				),
				'stringlongblob ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('stringlongblob ∪ stringlongblob'),
				'stringlongblob ∪ datestr': allTypesCodecsTable.datestr.as('stringlongblob ∪ datestr'),
				'stringlongblob ∪ datetimestr': allTypesCodecsTable.datetimestr.as('stringlongblob ∪ datetimestr'),
				'stringlongblob ∪ timestampstr': allTypesCodecsTable.timestampstr.as('stringlongblob ∪ timestampstr'),
				'stringlongblob ∪ time': allTypesCodecsTable.time.as('stringlongblob ∪ time'),
				'datestr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('datestr ∪ bigintstr'),
				'datestr ∪ char': allTypesCodecsTable.char.as('datestr ∪ char'),
				'datestr ∪ decimal': allTypesCodecsTable.decimal.as('datestr ∪ decimal'),
				'datestr ∪ text': allTypesCodecsTable.text.as('datestr ∪ text'),
				'datestr ∪ tinytext': allTypesCodecsTable.tinytext.as('datestr ∪ tinytext'),
				'datestr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('datestr ∪ mediumtext'),
				'datestr ∪ longtext': allTypesCodecsTable.longtext.as('datestr ∪ longtext'),
				'datestr ∪ varchar': allTypesCodecsTable.varchar.as('datestr ∪ varchar'),
				'datestr ∪ varbin': allTypesCodecsTable.varbin.as('datestr ∪ varbin'),
				'datestr ∪ stringblob': allTypesCodecsTable.stringblob.as('datestr ∪ stringblob'),
				'datestr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('datestr ∪ stringtinyblob'),
				'datestr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('datestr ∪ stringmediumblob'),
				'datestr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('datestr ∪ stringlongblob'),
				'datestr ∪ datestr': allTypesCodecsTable.datestr.as('datestr ∪ datestr'),
				'datestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datestr ∪ datetimestr'),
				'datestr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('datestr ∪ timestampstr'),
				'datetimestr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('datetimestr ∪ bigintstr'),
				'datetimestr ∪ char': allTypesCodecsTable.char.as('datetimestr ∪ char'),
				'datetimestr ∪ decimal': allTypesCodecsTable.decimal.as('datetimestr ∪ decimal'),
				'datetimestr ∪ text': allTypesCodecsTable.text.as('datetimestr ∪ text'),
				'datetimestr ∪ tinytext': allTypesCodecsTable.tinytext.as('datetimestr ∪ tinytext'),
				'datetimestr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('datetimestr ∪ mediumtext'),
				'datetimestr ∪ longtext': allTypesCodecsTable.longtext.as('datetimestr ∪ longtext'),
				'datetimestr ∪ varchar': allTypesCodecsTable.varchar.as('datetimestr ∪ varchar'),
				'datetimestr ∪ varbin': allTypesCodecsTable.varbin.as('datetimestr ∪ varbin'),
				'datetimestr ∪ stringblob': allTypesCodecsTable.stringblob.as('datetimestr ∪ stringblob'),
				'datetimestr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('datetimestr ∪ stringtinyblob'),
				'datetimestr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('datetimestr ∪ stringmediumblob'),
				'datetimestr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('datetimestr ∪ stringlongblob'),
				'datetimestr ∪ datestr': allTypesCodecsTable.datestr.as('datetimestr ∪ datestr'),
				'datetimestr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('datetimestr ∪ datetimestr'),
				'datetimestr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('datetimestr ∪ timestampstr'),
				'timestampstr ∪ bigintstr': allTypesCodecsTable.bigintstr.as('timestampstr ∪ bigintstr'),
				'timestampstr ∪ char': allTypesCodecsTable.char.as('timestampstr ∪ char'),
				'timestampstr ∪ decimal': allTypesCodecsTable.decimal.as('timestampstr ∪ decimal'),
				'timestampstr ∪ text': allTypesCodecsTable.text.as('timestampstr ∪ text'),
				'timestampstr ∪ tinytext': allTypesCodecsTable.tinytext.as('timestampstr ∪ tinytext'),
				'timestampstr ∪ mediumtext': allTypesCodecsTable.mediumtext.as('timestampstr ∪ mediumtext'),
				'timestampstr ∪ longtext': allTypesCodecsTable.longtext.as('timestampstr ∪ longtext'),
				'timestampstr ∪ varchar': allTypesCodecsTable.varchar.as('timestampstr ∪ varchar'),
				'timestampstr ∪ varbin': allTypesCodecsTable.varbin.as('timestampstr ∪ varbin'),
				'timestampstr ∪ stringblob': allTypesCodecsTable.stringblob.as('timestampstr ∪ stringblob'),
				'timestampstr ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('timestampstr ∪ stringtinyblob'),
				'timestampstr ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('timestampstr ∪ stringmediumblob'),
				'timestampstr ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('timestampstr ∪ stringlongblob'),
				'timestampstr ∪ datestr': allTypesCodecsTable.datestr.as('timestampstr ∪ datestr'),
				'timestampstr ∪ datetimestr': allTypesCodecsTable.datetimestr.as('timestampstr ∪ datetimestr'),
				'timestampstr ∪ timestampstr': allTypesCodecsTable.timestampstr.as('timestampstr ∪ timestampstr'),
				'time ∪ bigintstr': allTypesCodecsTable.bigintstr.as('time ∪ bigintstr'),
				'time ∪ char': allTypesCodecsTable.char.as('time ∪ char'),
				'time ∪ decimal': allTypesCodecsTable.decimal.as('time ∪ decimal'),
				'time ∪ text': allTypesCodecsTable.text.as('time ∪ text'),
				'time ∪ tinytext': allTypesCodecsTable.tinytext.as('time ∪ tinytext'),
				'time ∪ mediumtext': allTypesCodecsTable.mediumtext.as('time ∪ mediumtext'),
				'time ∪ longtext': allTypesCodecsTable.longtext.as('time ∪ longtext'),
				'time ∪ varchar': allTypesCodecsTable.varchar.as('time ∪ varchar'),
				'time ∪ varbin': allTypesCodecsTable.varbin.as('time ∪ varbin'),
				'time ∪ stringblob': allTypesCodecsTable.stringblob.as('time ∪ stringblob'),
				'time ∪ stringtinyblob': allTypesCodecsTable.stringtinyblob.as('time ∪ stringtinyblob'),
				'time ∪ stringmediumblob': allTypesCodecsTable.stringmediumblob.as('time ∪ stringmediumblob'),
				'time ∪ stringlongblob': allTypesCodecsTable.stringlongblob.as('time ∪ stringlongblob'),
				'time ∪ time': allTypesCodecsTable.time.as('time ∪ time'),
				'binary ∪ binary': allTypesCodecsTable.binary.as('binary ∪ binary'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'bigintstr ∪ bigintstr': '5044565289845416380',
			'bigintstr ∪ char': '5044565289845416380',
			'bigintstr ∪ decimal': '5044565289845416380',
			'bigintstr ∪ text': '5044565289845416380',
			'bigintstr ∪ tinytext': '5044565289845416380',
			'bigintstr ∪ mediumtext': '5044565289845416380',
			'bigintstr ∪ longtext': '5044565289845416380',
			'bigintstr ∪ varchar': '5044565289845416380',
			'bigintstr ∪ varbin': '5044565289845416380',
			'bigintstr ∪ stringblob': '5044565289845416380',
			'bigintstr ∪ stringtinyblob': '5044565289845416380',
			'bigintstr ∪ stringmediumblob': '5044565289845416380',
			'bigintstr ∪ stringlongblob': '5044565289845416380',
			'bigintstr ∪ datestr': '5044565289845416380',
			'bigintstr ∪ datetimestr': '5044565289845416380',
			'bigintstr ∪ timestampstr': '5044565289845416380',
			'bigintstr ∪ time': '5044565289845416380',
			'char ∪ bigintstr': 'c',
			'char ∪ char': 'c',
			'char ∪ decimal': 'c',
			'char ∪ text': 'c',
			'char ∪ tinytext': 'c',
			'char ∪ mediumtext': 'c',
			'char ∪ longtext': 'c',
			'char ∪ varchar': 'c',
			'char ∪ varbin': 'c',
			'char ∪ stringblob': 'c',
			'char ∪ stringtinyblob': 'c',
			'char ∪ stringmediumblob': 'c',
			'char ∪ stringlongblob': 'c',
			'char ∪ datestr': 'c',
			'char ∪ datetimestr': 'c',
			'char ∪ timestampstr': 'c',
			'char ∪ time': 'c',
			'decimal ∪ bigintstr': '47521',
			'decimal ∪ char': '47521',
			'decimal ∪ decimal': '47521',
			'decimal ∪ text': '47521',
			'decimal ∪ tinytext': '47521',
			'decimal ∪ mediumtext': '47521',
			'decimal ∪ longtext': '47521',
			'decimal ∪ varchar': '47521',
			'decimal ∪ varbin': '47521',
			'decimal ∪ stringblob': '47521',
			'decimal ∪ stringtinyblob': '47521',
			'decimal ∪ stringmediumblob': '47521',
			'decimal ∪ stringlongblob': '47521',
			'decimal ∪ datestr': '47521',
			'decimal ∪ datetimestr': '47521',
			'decimal ∪ timestampstr': '47521',
			'decimal ∪ time': '47521',
			'text ∪ bigintstr': 'C4-',
			'text ∪ char': 'C4-',
			'text ∪ decimal': 'C4-',
			'text ∪ text': 'C4-',
			'text ∪ tinytext': 'C4-',
			'text ∪ mediumtext': 'C4-',
			'text ∪ longtext': 'C4-',
			'text ∪ varchar': 'C4-',
			'text ∪ varbin': 'C4-',
			'text ∪ stringblob': 'C4-',
			'text ∪ stringtinyblob': 'C4-',
			'text ∪ stringmediumblob': 'C4-',
			'text ∪ stringlongblob': 'C4-',
			'text ∪ datestr': 'C4-',
			'text ∪ datetimestr': 'C4-',
			'text ∪ timestampstr': 'C4-',
			'text ∪ time': 'C4-',
			'tinytext ∪ bigintstr': 'tiny text',
			'tinytext ∪ char': 'tiny text',
			'tinytext ∪ decimal': 'tiny text',
			'tinytext ∪ text': 'tiny text',
			'tinytext ∪ tinytext': 'tiny text',
			'tinytext ∪ mediumtext': 'tiny text',
			'tinytext ∪ longtext': 'tiny text',
			'tinytext ∪ varchar': 'tiny text',
			'tinytext ∪ varbin': 'tiny text',
			'tinytext ∪ stringblob': 'tiny text',
			'tinytext ∪ stringtinyblob': 'tiny text',
			'tinytext ∪ stringmediumblob': 'tiny text',
			'tinytext ∪ stringlongblob': 'tiny text',
			'tinytext ∪ datestr': 'tiny text',
			'tinytext ∪ datetimestr': 'tiny text',
			'tinytext ∪ timestampstr': 'tiny text',
			'tinytext ∪ time': 'tiny text',
			'mediumtext ∪ bigintstr': 'medium text',
			'mediumtext ∪ char': 'medium text',
			'mediumtext ∪ decimal': 'medium text',
			'mediumtext ∪ text': 'medium text',
			'mediumtext ∪ tinytext': 'medium text',
			'mediumtext ∪ mediumtext': 'medium text',
			'mediumtext ∪ longtext': 'medium text',
			'mediumtext ∪ varchar': 'medium text',
			'mediumtext ∪ varbin': 'medium text',
			'mediumtext ∪ stringblob': 'medium text',
			'mediumtext ∪ stringtinyblob': 'medium text',
			'mediumtext ∪ stringmediumblob': 'medium text',
			'mediumtext ∪ stringlongblob': 'medium text',
			'mediumtext ∪ datestr': 'medium text',
			'mediumtext ∪ datetimestr': 'medium text',
			'mediumtext ∪ timestampstr': 'medium text',
			'mediumtext ∪ time': 'medium text',
			'longtext ∪ bigintstr': 'long text',
			'longtext ∪ char': 'long text',
			'longtext ∪ decimal': 'long text',
			'longtext ∪ text': 'long text',
			'longtext ∪ tinytext': 'long text',
			'longtext ∪ mediumtext': 'long text',
			'longtext ∪ longtext': 'long text',
			'longtext ∪ varchar': 'long text',
			'longtext ∪ varbin': 'long text',
			'longtext ∪ stringblob': 'long text',
			'longtext ∪ stringtinyblob': 'long text',
			'longtext ∪ stringmediumblob': 'long text',
			'longtext ∪ stringlongblob': 'long text',
			'longtext ∪ datestr': 'long text',
			'longtext ∪ datetimestr': 'long text',
			'longtext ∪ timestampstr': 'long text',
			'longtext ∪ time': 'long text',
			'varchar ∪ bigintstr': 'VCHAR',
			'varchar ∪ char': 'VCHAR',
			'varchar ∪ decimal': 'VCHAR',
			'varchar ∪ text': 'VCHAR',
			'varchar ∪ tinytext': 'VCHAR',
			'varchar ∪ mediumtext': 'VCHAR',
			'varchar ∪ longtext': 'VCHAR',
			'varchar ∪ varchar': 'VCHAR',
			'varchar ∪ varbin': 'VCHAR',
			'varchar ∪ stringblob': 'VCHAR',
			'varchar ∪ stringtinyblob': 'VCHAR',
			'varchar ∪ stringmediumblob': 'VCHAR',
			'varchar ∪ stringlongblob': 'VCHAR',
			'varchar ∪ datestr': 'VCHAR',
			'varchar ∪ datetimestr': 'VCHAR',
			'varchar ∪ timestampstr': 'VCHAR',
			'varchar ∪ time': 'VCHAR',
			'varbin ∪ bigintstr': '1010110101001101',
			'varbin ∪ char': '1010110101001101',
			'varbin ∪ decimal': '1010110101001101',
			'varbin ∪ text': '1010110101001101',
			'varbin ∪ tinytext': '1010110101001101',
			'varbin ∪ mediumtext': '1010110101001101',
			'varbin ∪ longtext': '1010110101001101',
			'varbin ∪ varchar': '1010110101001101',
			'varbin ∪ varbin': '1010110101001101',
			'varbin ∪ stringblob': '1010110101001101',
			'varbin ∪ stringtinyblob': '1010110101001101',
			'varbin ∪ stringmediumblob': '1010110101001101',
			'varbin ∪ stringlongblob': '1010110101001101',
			'varbin ∪ datestr': '1010110101001101',
			'varbin ∪ datetimestr': '1010110101001101',
			'varbin ∪ timestampstr': '1010110101001101',
			'varbin ∪ time': '1010110101001101',
			'stringblob ∪ bigintstr': 'string',
			'stringblob ∪ char': 'string',
			'stringblob ∪ decimal': 'string',
			'stringblob ∪ text': 'string',
			'stringblob ∪ tinytext': 'string',
			'stringblob ∪ mediumtext': 'string',
			'stringblob ∪ longtext': 'string',
			'stringblob ∪ varchar': 'string',
			'stringblob ∪ varbin': 'string',
			'stringblob ∪ stringblob': 'string',
			'stringblob ∪ stringtinyblob': 'string',
			'stringblob ∪ stringmediumblob': 'string',
			'stringblob ∪ stringlongblob': 'string',
			'stringblob ∪ datestr': 'string',
			'stringblob ∪ datetimestr': 'string',
			'stringblob ∪ timestampstr': 'string',
			'stringblob ∪ time': 'string',
			'stringtinyblob ∪ bigintstr': 'string',
			'stringtinyblob ∪ char': 'string',
			'stringtinyblob ∪ decimal': 'string',
			'stringtinyblob ∪ text': 'string',
			'stringtinyblob ∪ tinytext': 'string',
			'stringtinyblob ∪ mediumtext': 'string',
			'stringtinyblob ∪ longtext': 'string',
			'stringtinyblob ∪ varchar': 'string',
			'stringtinyblob ∪ varbin': 'string',
			'stringtinyblob ∪ stringblob': 'string',
			'stringtinyblob ∪ stringtinyblob': 'string',
			'stringtinyblob ∪ stringmediumblob': 'string',
			'stringtinyblob ∪ stringlongblob': 'string',
			'stringtinyblob ∪ datestr': 'string',
			'stringtinyblob ∪ datetimestr': 'string',
			'stringtinyblob ∪ timestampstr': 'string',
			'stringtinyblob ∪ time': 'string',
			'stringmediumblob ∪ bigintstr': 'string',
			'stringmediumblob ∪ char': 'string',
			'stringmediumblob ∪ decimal': 'string',
			'stringmediumblob ∪ text': 'string',
			'stringmediumblob ∪ tinytext': 'string',
			'stringmediumblob ∪ mediumtext': 'string',
			'stringmediumblob ∪ longtext': 'string',
			'stringmediumblob ∪ varchar': 'string',
			'stringmediumblob ∪ varbin': 'string',
			'stringmediumblob ∪ stringblob': 'string',
			'stringmediumblob ∪ stringtinyblob': 'string',
			'stringmediumblob ∪ stringmediumblob': 'string',
			'stringmediumblob ∪ stringlongblob': 'string',
			'stringmediumblob ∪ datestr': 'string',
			'stringmediumblob ∪ datetimestr': 'string',
			'stringmediumblob ∪ timestampstr': 'string',
			'stringmediumblob ∪ time': 'string',
			'stringlongblob ∪ bigintstr': 'string',
			'stringlongblob ∪ char': 'string',
			'stringlongblob ∪ decimal': 'string',
			'stringlongblob ∪ text': 'string',
			'stringlongblob ∪ tinytext': 'string',
			'stringlongblob ∪ mediumtext': 'string',
			'stringlongblob ∪ longtext': 'string',
			'stringlongblob ∪ varchar': 'string',
			'stringlongblob ∪ varbin': 'string',
			'stringlongblob ∪ stringblob': 'string',
			'stringlongblob ∪ stringtinyblob': 'string',
			'stringlongblob ∪ stringmediumblob': 'string',
			'stringlongblob ∪ stringlongblob': 'string',
			'stringlongblob ∪ datestr': 'string',
			'stringlongblob ∪ datetimestr': 'string',
			'stringlongblob ∪ timestampstr': 'string',
			'stringlongblob ∪ time': 'string',
			'datestr ∪ bigintstr': '2025-03-12',
			'datestr ∪ char': '2025-03-12',
			'datestr ∪ decimal': '2025-03-12',
			'datestr ∪ text': '2025-03-12',
			'datestr ∪ tinytext': '2025-03-12',
			'datestr ∪ mediumtext': '2025-03-12',
			'datestr ∪ longtext': '2025-03-12',
			'datestr ∪ varchar': '2025-03-12',
			'datestr ∪ varbin': '2025-03-12',
			'datestr ∪ stringblob': '2025-03-12',
			'datestr ∪ stringtinyblob': '2025-03-12',
			'datestr ∪ stringmediumblob': '2025-03-12',
			'datestr ∪ stringlongblob': '2025-03-12',
			'datestr ∪ datestr': '2025-03-12',
			'datestr ∪ datetimestr': '2025-03-12 00:00:00.000',
			'datestr ∪ timestampstr': '2025-03-12 00:00:00.000',
			'datetimestr ∪ bigintstr': '2025-03-12 01:32:41.623',
			'datetimestr ∪ char': '2025-03-12 01:32:41.623',
			'datetimestr ∪ decimal': '2025-03-12 01:32:41.623',
			'datetimestr ∪ text': '2025-03-12 01:32:41.623',
			'datetimestr ∪ tinytext': '2025-03-12 01:32:41.623',
			'datetimestr ∪ mediumtext': '2025-03-12 01:32:41.623',
			'datetimestr ∪ longtext': '2025-03-12 01:32:41.623',
			'datetimestr ∪ varchar': '2025-03-12 01:32:41.623',
			'datetimestr ∪ varbin': '2025-03-12 01:32:41.623',
			'datetimestr ∪ stringblob': '2025-03-12 01:32:41.623',
			'datetimestr ∪ stringtinyblob': '2025-03-12 01:32:41.623',
			'datetimestr ∪ stringmediumblob': '2025-03-12 01:32:41.623',
			'datetimestr ∪ stringlongblob': '2025-03-12 01:32:41.623',
			'datetimestr ∪ datestr': '2025-03-12 01:32:41.623',
			'datetimestr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'datetimestr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ bigintstr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ char': '2025-03-12 01:32:41.623',
			'timestampstr ∪ decimal': '2025-03-12 01:32:41.623',
			'timestampstr ∪ text': '2025-03-12 01:32:41.623',
			'timestampstr ∪ tinytext': '2025-03-12 01:32:41.623',
			'timestampstr ∪ mediumtext': '2025-03-12 01:32:41.623',
			'timestampstr ∪ longtext': '2025-03-12 01:32:41.623',
			'timestampstr ∪ varchar': '2025-03-12 01:32:41.623',
			'timestampstr ∪ varbin': '2025-03-12 01:32:41.623',
			'timestampstr ∪ stringblob': '2025-03-12 01:32:41.623',
			'timestampstr ∪ stringtinyblob': '2025-03-12 01:32:41.623',
			'timestampstr ∪ stringmediumblob': '2025-03-12 01:32:41.623',
			'timestampstr ∪ stringlongblob': '2025-03-12 01:32:41.623',
			'timestampstr ∪ datestr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'time ∪ bigintstr': '04:13:22',
			'time ∪ char': '04:13:22',
			'time ∪ decimal': '04:13:22',
			'time ∪ text': '04:13:22',
			'time ∪ tinytext': '04:13:22',
			'time ∪ mediumtext': '04:13:22',
			'time ∪ longtext': '04:13:22',
			'time ∪ varchar': '04:13:22',
			'time ∪ varbin': '04:13:22',
			'time ∪ stringblob': '04:13:22',
			'time ∪ stringtinyblob': '04:13:22',
			'time ∪ stringmediumblob': '04:13:22',
			'time ∪ stringlongblob': '04:13:22',
			'time ∪ time': '04:13:22',
			'binary ∪ binary': '1',
		},
		{
			'bigintstr ∪ bigintstr': '5044565289845416380',
			'bigintstr ∪ char': 'c',
			'bigintstr ∪ decimal': '47521',
			'bigintstr ∪ text': 'C4-',
			'bigintstr ∪ tinytext': 'tiny text',
			'bigintstr ∪ mediumtext': 'medium text',
			'bigintstr ∪ longtext': 'long text',
			'bigintstr ∪ varchar': 'VCHAR',
			'bigintstr ∪ varbin': '1010110101001101',
			'bigintstr ∪ stringblob': 'string',
			'bigintstr ∪ stringtinyblob': 'string',
			'bigintstr ∪ stringmediumblob': 'string',
			'bigintstr ∪ stringlongblob': 'string',
			'bigintstr ∪ datestr': '2025-03-12',
			'bigintstr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'bigintstr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'bigintstr ∪ time': '04:13:22',
			'char ∪ bigintstr': '5044565289845416380',
			'char ∪ char': 'c',
			'char ∪ decimal': '47521',
			'char ∪ text': 'C4-',
			'char ∪ tinytext': 'tiny text',
			'char ∪ mediumtext': 'medium text',
			'char ∪ longtext': 'long text',
			'char ∪ varchar': 'VCHAR',
			'char ∪ varbin': '1010110101001101',
			'char ∪ stringblob': 'string',
			'char ∪ stringtinyblob': 'string',
			'char ∪ stringmediumblob': 'string',
			'char ∪ stringlongblob': 'string',
			'char ∪ datestr': '2025-03-12',
			'char ∪ datetimestr': '2025-03-12 01:32:41.623',
			'char ∪ timestampstr': '2025-03-12 01:32:41.623',
			'char ∪ time': '04:13:22',
			'decimal ∪ bigintstr': '5044565289845416380',
			'decimal ∪ char': 'c',
			'decimal ∪ decimal': '47521',
			'decimal ∪ text': 'C4-',
			'decimal ∪ tinytext': 'tiny text',
			'decimal ∪ mediumtext': 'medium text',
			'decimal ∪ longtext': 'long text',
			'decimal ∪ varchar': 'VCHAR',
			'decimal ∪ varbin': '1010110101001101',
			'decimal ∪ stringblob': 'string',
			'decimal ∪ stringtinyblob': 'string',
			'decimal ∪ stringmediumblob': 'string',
			'decimal ∪ stringlongblob': 'string',
			'decimal ∪ datestr': '2025-03-12',
			'decimal ∪ datetimestr': '2025-03-12 01:32:41.623',
			'decimal ∪ timestampstr': '2025-03-12 01:32:41.623',
			'decimal ∪ time': '04:13:22',
			'text ∪ bigintstr': '5044565289845416380',
			'text ∪ char': 'c',
			'text ∪ decimal': '47521',
			'text ∪ text': 'C4-',
			'text ∪ tinytext': 'tiny text',
			'text ∪ mediumtext': 'medium text',
			'text ∪ longtext': 'long text',
			'text ∪ varchar': 'VCHAR',
			'text ∪ varbin': '1010110101001101',
			'text ∪ stringblob': 'string',
			'text ∪ stringtinyblob': 'string',
			'text ∪ stringmediumblob': 'string',
			'text ∪ stringlongblob': 'string',
			'text ∪ datestr': '2025-03-12',
			'text ∪ datetimestr': '2025-03-12 01:32:41.623',
			'text ∪ timestampstr': '2025-03-12 01:32:41.623',
			'text ∪ time': '04:13:22',
			'tinytext ∪ bigintstr': '5044565289845416380',
			'tinytext ∪ char': 'c',
			'tinytext ∪ decimal': '47521',
			'tinytext ∪ text': 'C4-',
			'tinytext ∪ tinytext': 'tiny text',
			'tinytext ∪ mediumtext': 'medium text',
			'tinytext ∪ longtext': 'long text',
			'tinytext ∪ varchar': 'VCHAR',
			'tinytext ∪ varbin': '1010110101001101',
			'tinytext ∪ stringblob': 'string',
			'tinytext ∪ stringtinyblob': 'string',
			'tinytext ∪ stringmediumblob': 'string',
			'tinytext ∪ stringlongblob': 'string',
			'tinytext ∪ datestr': '2025-03-12',
			'tinytext ∪ datetimestr': '2025-03-12 01:32:41.623',
			'tinytext ∪ timestampstr': '2025-03-12 01:32:41.623',
			'tinytext ∪ time': '04:13:22',
			'mediumtext ∪ bigintstr': '5044565289845416380',
			'mediumtext ∪ char': 'c',
			'mediumtext ∪ decimal': '47521',
			'mediumtext ∪ text': 'C4-',
			'mediumtext ∪ tinytext': 'tiny text',
			'mediumtext ∪ mediumtext': 'medium text',
			'mediumtext ∪ longtext': 'long text',
			'mediumtext ∪ varchar': 'VCHAR',
			'mediumtext ∪ varbin': '1010110101001101',
			'mediumtext ∪ stringblob': 'string',
			'mediumtext ∪ stringtinyblob': 'string',
			'mediumtext ∪ stringmediumblob': 'string',
			'mediumtext ∪ stringlongblob': 'string',
			'mediumtext ∪ datestr': '2025-03-12',
			'mediumtext ∪ datetimestr': '2025-03-12 01:32:41.623',
			'mediumtext ∪ timestampstr': '2025-03-12 01:32:41.623',
			'mediumtext ∪ time': '04:13:22',
			'longtext ∪ bigintstr': '5044565289845416380',
			'longtext ∪ char': 'c',
			'longtext ∪ decimal': '47521',
			'longtext ∪ text': 'C4-',
			'longtext ∪ tinytext': 'tiny text',
			'longtext ∪ mediumtext': 'medium text',
			'longtext ∪ longtext': 'long text',
			'longtext ∪ varchar': 'VCHAR',
			'longtext ∪ varbin': '1010110101001101',
			'longtext ∪ stringblob': 'string',
			'longtext ∪ stringtinyblob': 'string',
			'longtext ∪ stringmediumblob': 'string',
			'longtext ∪ stringlongblob': 'string',
			'longtext ∪ datestr': '2025-03-12',
			'longtext ∪ datetimestr': '2025-03-12 01:32:41.623',
			'longtext ∪ timestampstr': '2025-03-12 01:32:41.623',
			'longtext ∪ time': '04:13:22',
			'varchar ∪ bigintstr': '5044565289845416380',
			'varchar ∪ char': 'c',
			'varchar ∪ decimal': '47521',
			'varchar ∪ text': 'C4-',
			'varchar ∪ tinytext': 'tiny text',
			'varchar ∪ mediumtext': 'medium text',
			'varchar ∪ longtext': 'long text',
			'varchar ∪ varchar': 'VCHAR',
			'varchar ∪ varbin': '1010110101001101',
			'varchar ∪ stringblob': 'string',
			'varchar ∪ stringtinyblob': 'string',
			'varchar ∪ stringmediumblob': 'string',
			'varchar ∪ stringlongblob': 'string',
			'varchar ∪ datestr': '2025-03-12',
			'varchar ∪ datetimestr': '2025-03-12 01:32:41.623',
			'varchar ∪ timestampstr': '2025-03-12 01:32:41.623',
			'varchar ∪ time': '04:13:22',
			'varbin ∪ bigintstr': '5044565289845416380',
			'varbin ∪ char': 'c',
			'varbin ∪ decimal': '47521',
			'varbin ∪ text': 'C4-',
			'varbin ∪ tinytext': 'tiny text',
			'varbin ∪ mediumtext': 'medium text',
			'varbin ∪ longtext': 'long text',
			'varbin ∪ varchar': 'VCHAR',
			'varbin ∪ varbin': '1010110101001101',
			'varbin ∪ stringblob': 'string',
			'varbin ∪ stringtinyblob': 'string',
			'varbin ∪ stringmediumblob': 'string',
			'varbin ∪ stringlongblob': 'string',
			'varbin ∪ datestr': '2025-03-12',
			'varbin ∪ datetimestr': '2025-03-12 01:32:41.623',
			'varbin ∪ timestampstr': '2025-03-12 01:32:41.623',
			'varbin ∪ time': '04:13:22',
			'stringblob ∪ bigintstr': '5044565289845416380',
			'stringblob ∪ char': 'c',
			'stringblob ∪ decimal': '47521',
			'stringblob ∪ text': 'C4-',
			'stringblob ∪ tinytext': 'tiny text',
			'stringblob ∪ mediumtext': 'medium text',
			'stringblob ∪ longtext': 'long text',
			'stringblob ∪ varchar': 'VCHAR',
			'stringblob ∪ varbin': '1010110101001101',
			'stringblob ∪ stringblob': 'string',
			'stringblob ∪ stringtinyblob': 'string',
			'stringblob ∪ stringmediumblob': 'string',
			'stringblob ∪ stringlongblob': 'string',
			'stringblob ∪ datestr': '2025-03-12',
			'stringblob ∪ datetimestr': '2025-03-12 01:32:41.623',
			'stringblob ∪ timestampstr': '2025-03-12 01:32:41.623',
			'stringblob ∪ time': '04:13:22',
			'stringtinyblob ∪ bigintstr': '5044565289845416380',
			'stringtinyblob ∪ char': 'c',
			'stringtinyblob ∪ decimal': '47521',
			'stringtinyblob ∪ text': 'C4-',
			'stringtinyblob ∪ tinytext': 'tiny text',
			'stringtinyblob ∪ mediumtext': 'medium text',
			'stringtinyblob ∪ longtext': 'long text',
			'stringtinyblob ∪ varchar': 'VCHAR',
			'stringtinyblob ∪ varbin': '1010110101001101',
			'stringtinyblob ∪ stringblob': 'string',
			'stringtinyblob ∪ stringtinyblob': 'string',
			'stringtinyblob ∪ stringmediumblob': 'string',
			'stringtinyblob ∪ stringlongblob': 'string',
			'stringtinyblob ∪ datestr': '2025-03-12',
			'stringtinyblob ∪ datetimestr': '2025-03-12 01:32:41.623',
			'stringtinyblob ∪ timestampstr': '2025-03-12 01:32:41.623',
			'stringtinyblob ∪ time': '04:13:22',
			'stringmediumblob ∪ bigintstr': '5044565289845416380',
			'stringmediumblob ∪ char': 'c',
			'stringmediumblob ∪ decimal': '47521',
			'stringmediumblob ∪ text': 'C4-',
			'stringmediumblob ∪ tinytext': 'tiny text',
			'stringmediumblob ∪ mediumtext': 'medium text',
			'stringmediumblob ∪ longtext': 'long text',
			'stringmediumblob ∪ varchar': 'VCHAR',
			'stringmediumblob ∪ varbin': '1010110101001101',
			'stringmediumblob ∪ stringblob': 'string',
			'stringmediumblob ∪ stringtinyblob': 'string',
			'stringmediumblob ∪ stringmediumblob': 'string',
			'stringmediumblob ∪ stringlongblob': 'string',
			'stringmediumblob ∪ datestr': '2025-03-12',
			'stringmediumblob ∪ datetimestr': '2025-03-12 01:32:41.623',
			'stringmediumblob ∪ timestampstr': '2025-03-12 01:32:41.623',
			'stringmediumblob ∪ time': '04:13:22',
			'stringlongblob ∪ bigintstr': '5044565289845416380',
			'stringlongblob ∪ char': 'c',
			'stringlongblob ∪ decimal': '47521',
			'stringlongblob ∪ text': 'C4-',
			'stringlongblob ∪ tinytext': 'tiny text',
			'stringlongblob ∪ mediumtext': 'medium text',
			'stringlongblob ∪ longtext': 'long text',
			'stringlongblob ∪ varchar': 'VCHAR',
			'stringlongblob ∪ varbin': '1010110101001101',
			'stringlongblob ∪ stringblob': 'string',
			'stringlongblob ∪ stringtinyblob': 'string',
			'stringlongblob ∪ stringmediumblob': 'string',
			'stringlongblob ∪ stringlongblob': 'string',
			'stringlongblob ∪ datestr': '2025-03-12',
			'stringlongblob ∪ datetimestr': '2025-03-12 01:32:41.623',
			'stringlongblob ∪ timestampstr': '2025-03-12 01:32:41.623',
			'stringlongblob ∪ time': '04:13:22',
			'datestr ∪ bigintstr': '5044565289845416380',
			'datestr ∪ char': 'c',
			'datestr ∪ decimal': '47521',
			'datestr ∪ text': 'C4-',
			'datestr ∪ tinytext': 'tiny text',
			'datestr ∪ mediumtext': 'medium text',
			'datestr ∪ longtext': 'long text',
			'datestr ∪ varchar': 'VCHAR',
			'datestr ∪ varbin': '1010110101001101',
			'datestr ∪ stringblob': 'string',
			'datestr ∪ stringtinyblob': 'string',
			'datestr ∪ stringmediumblob': 'string',
			'datestr ∪ stringlongblob': 'string',
			'datestr ∪ datestr': '2025-03-12',
			'datestr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'datestr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'datetimestr ∪ bigintstr': '5044565289845416380',
			'datetimestr ∪ char': 'c',
			'datetimestr ∪ decimal': '47521',
			'datetimestr ∪ text': 'C4-',
			'datetimestr ∪ tinytext': 'tiny text',
			'datetimestr ∪ mediumtext': 'medium text',
			'datetimestr ∪ longtext': 'long text',
			'datetimestr ∪ varchar': 'VCHAR',
			'datetimestr ∪ varbin': '1010110101001101',
			'datetimestr ∪ stringblob': 'string',
			'datetimestr ∪ stringtinyblob': 'string',
			'datetimestr ∪ stringmediumblob': 'string',
			'datetimestr ∪ stringlongblob': 'string',
			'datetimestr ∪ datestr': '2025-03-12 00:00:00.000',
			'datetimestr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'datetimestr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ bigintstr': '5044565289845416380',
			'timestampstr ∪ char': 'c',
			'timestampstr ∪ decimal': '47521',
			'timestampstr ∪ text': 'C4-',
			'timestampstr ∪ tinytext': 'tiny text',
			'timestampstr ∪ mediumtext': 'medium text',
			'timestampstr ∪ longtext': 'long text',
			'timestampstr ∪ varchar': 'VCHAR',
			'timestampstr ∪ varbin': '1010110101001101',
			'timestampstr ∪ stringblob': 'string',
			'timestampstr ∪ stringtinyblob': 'string',
			'timestampstr ∪ stringmediumblob': 'string',
			'timestampstr ∪ stringlongblob': 'string',
			'timestampstr ∪ datestr': '2025-03-12 00:00:00.000',
			'timestampstr ∪ datetimestr': '2025-03-12 01:32:41.623',
			'timestampstr ∪ timestampstr': '2025-03-12 01:32:41.623',
			'time ∪ bigintstr': '5044565289845416380',
			'time ∪ char': 'c',
			'time ∪ decimal': '47521',
			'time ∪ text': 'C4-',
			'time ∪ tinytext': 'tiny text',
			'time ∪ mediumtext': 'medium text',
			'time ∪ longtext': 'long text',
			'time ∪ varchar': 'VCHAR',
			'time ∪ varbin': '1010110101001101',
			'time ∪ stringblob': 'string',
			'time ∪ stringtinyblob': 'string',
			'time ∪ stringmediumblob': 'string',
			'time ∪ stringlongblob': 'string',
			'time ∪ time': '04:13:22',
			'binary ∪ binary': '1',
		},
	]));

	// ---- bigint ----
	expect(
		await unionAll(
			db.select({
				'bigint64 ∪ bigint64': allTypesCodecsTable.bigint64.as('bigint64 ∪ bigint64'),
				'bigint64 ∪ decimalbig': allTypesCodecsTable.bigint64.as('bigint64 ∪ decimalbig'),
				'decimalbig ∪ bigint64': allTypesCodecsTable.decimalbig.as('decimalbig ∪ bigint64'),
				'decimalbig ∪ decimalbig': allTypesCodecsTable.decimalbig.as('decimalbig ∪ decimalbig'),
			}).from(allTypesCodecsTable),
			db.select({
				'bigint64 ∪ bigint64': allTypesCodecsTable.bigint64.as('bigint64 ∪ bigint64'),
				'bigint64 ∪ decimalbig': allTypesCodecsTable.decimalbig.as('bigint64 ∪ decimalbig'),
				'decimalbig ∪ bigint64': allTypesCodecsTable.bigint64.as('decimalbig ∪ bigint64'),
				'decimalbig ∪ decimalbig': allTypesCodecsTable.decimalbig.as('decimalbig ∪ decimalbig'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'bigint64 ∪ bigint64': 5044565289845416380n,
			'bigint64 ∪ decimalbig': 5044565289845416380n,
			'decimalbig ∪ bigint64': 5044565289845416380n,
			'decimalbig ∪ decimalbig': 5044565289845416380n,
		},
		{
			'bigint64 ∪ bigint64': 5044565289845416380n,
			'bigint64 ∪ decimalbig': 5044565289845416380n,
			'decimalbig ∪ bigint64': 5044565289845416380n,
			'decimalbig ∪ decimalbig': 5044565289845416380n,
		},
	]));

	// ---- boolean ----
	expect(
		await unionAll(
			db.select({
				'boolean ∪ boolean': allTypesCodecsTable.boolean.as('boolean ∪ boolean'),
			}).from(allTypesCodecsTable),
			db.select({
				'boolean ∪ boolean': allTypesCodecsTable.boolean.as('boolean ∪ boolean'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'boolean ∪ boolean': true,
		},
		{
			'boolean ∪ boolean': true,
		},
	]));

	// ---- date ----
	expect(
		await unionAll(
			db.select({
				'date ∪ date': allTypesCodecsTable.date.as('date ∪ date'),
				'date ∪ datetime': allTypesCodecsTable.date.as('date ∪ datetime'),
				'date ∪ timestamp': allTypesCodecsTable.date.as('date ∪ timestamp'),
				'datetime ∪ date': allTypesCodecsTable.datetime.as('datetime ∪ date'),
				'datetime ∪ datetime': allTypesCodecsTable.datetime.as('datetime ∪ datetime'),
				'datetime ∪ timestamp': allTypesCodecsTable.datetime.as('datetime ∪ timestamp'),
				'timestamp ∪ date': allTypesCodecsTable.timestamp.as('timestamp ∪ date'),
				'timestamp ∪ datetime': allTypesCodecsTable.timestamp.as('timestamp ∪ datetime'),
				'timestamp ∪ timestamp': allTypesCodecsTable.timestamp.as('timestamp ∪ timestamp'),
			}).from(allTypesCodecsTable),
			db.select({
				'date ∪ date': allTypesCodecsTable.date.as('date ∪ date'),
				'date ∪ datetime': allTypesCodecsTable.datetime.as('date ∪ datetime'),
				'date ∪ timestamp': allTypesCodecsTable.timestamp.as('date ∪ timestamp'),
				'datetime ∪ date': allTypesCodecsTable.date.as('datetime ∪ date'),
				'datetime ∪ datetime': allTypesCodecsTable.datetime.as('datetime ∪ datetime'),
				'datetime ∪ timestamp': allTypesCodecsTable.timestamp.as('datetime ∪ timestamp'),
				'timestamp ∪ date': allTypesCodecsTable.date.as('timestamp ∪ date'),
				'timestamp ∪ datetime': allTypesCodecsTable.datetime.as('timestamp ∪ datetime'),
				'timestamp ∪ timestamp': allTypesCodecsTable.timestamp.as('timestamp ∪ timestamp'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'date ∪ date': new Date('2025-03-12'),
			'date ∪ datetime': new Date('2025-03-12'),
			'date ∪ timestamp': new Date('2025-03-12'),
			'datetime ∪ date': new Date(1741743161623),
			'datetime ∪ datetime': new Date(1741743161623),
			'datetime ∪ timestamp': new Date(1741743161623),
			'timestamp ∪ date': new Date(1741743161623),
			'timestamp ∪ datetime': new Date(1741743161623),
			'timestamp ∪ timestamp': new Date(1741743161623),
		},
		{
			'date ∪ date': new Date('2025-03-12'),
			'date ∪ datetime': new Date(1741743161623),
			'date ∪ timestamp': new Date(1741743161623),
			'datetime ∪ date': new Date('2025-03-12'),
			'datetime ∪ datetime': new Date(1741743161623),
			'datetime ∪ timestamp': new Date(1741743161623),
			'timestamp ∪ date': new Date('2025-03-12'),
			'timestamp ∪ datetime': new Date(1741743161623),
			'timestamp ∪ timestamp': new Date(1741743161623),
		},
	]));

	// ---- buffer ----
	expect(
		await unionAll(
			db.select({
				'blob ∪ blob': allTypesCodecsTable.blob.as('blob ∪ blob'),
				'blob ∪ tinyblob': allTypesCodecsTable.blob.as('blob ∪ tinyblob'),
				'blob ∪ mediumblob': allTypesCodecsTable.blob.as('blob ∪ mediumblob'),
				'blob ∪ longblob': allTypesCodecsTable.blob.as('blob ∪ longblob'),
				'tinyblob ∪ blob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ blob'),
				'tinyblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ tinyblob'),
				'tinyblob ∪ mediumblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ mediumblob'),
				'tinyblob ∪ longblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ longblob'),
				'mediumblob ∪ blob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ blob'),
				'mediumblob ∪ tinyblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ tinyblob'),
				'mediumblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ mediumblob'),
				'mediumblob ∪ longblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ longblob'),
				'longblob ∪ blob': allTypesCodecsTable.longblob.as('longblob ∪ blob'),
				'longblob ∪ tinyblob': allTypesCodecsTable.longblob.as('longblob ∪ tinyblob'),
				'longblob ∪ mediumblob': allTypesCodecsTable.longblob.as('longblob ∪ mediumblob'),
				'longblob ∪ longblob': allTypesCodecsTable.longblob.as('longblob ∪ longblob'),
			}).from(allTypesCodecsTable),
			db.select({
				'blob ∪ blob': allTypesCodecsTable.blob.as('blob ∪ blob'),
				'blob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('blob ∪ tinyblob'),
				'blob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('blob ∪ mediumblob'),
				'blob ∪ longblob': allTypesCodecsTable.longblob.as('blob ∪ longblob'),
				'tinyblob ∪ blob': allTypesCodecsTable.blob.as('tinyblob ∪ blob'),
				'tinyblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('tinyblob ∪ tinyblob'),
				'tinyblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('tinyblob ∪ mediumblob'),
				'tinyblob ∪ longblob': allTypesCodecsTable.longblob.as('tinyblob ∪ longblob'),
				'mediumblob ∪ blob': allTypesCodecsTable.blob.as('mediumblob ∪ blob'),
				'mediumblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('mediumblob ∪ tinyblob'),
				'mediumblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('mediumblob ∪ mediumblob'),
				'mediumblob ∪ longblob': allTypesCodecsTable.longblob.as('mediumblob ∪ longblob'),
				'longblob ∪ blob': allTypesCodecsTable.blob.as('longblob ∪ blob'),
				'longblob ∪ tinyblob': allTypesCodecsTable.tinyblob.as('longblob ∪ tinyblob'),
				'longblob ∪ mediumblob': allTypesCodecsTable.mediumblob.as('longblob ∪ mediumblob'),
				'longblob ∪ longblob': allTypesCodecsTable.longblob.as('longblob ∪ longblob'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'blob ∪ blob': Buffer.from('string'),
			'blob ∪ tinyblob': Buffer.from('string'),
			'blob ∪ mediumblob': Buffer.from('string'),
			'blob ∪ longblob': Buffer.from('string'),
			'tinyblob ∪ blob': Buffer.from('string'),
			'tinyblob ∪ tinyblob': Buffer.from('string'),
			'tinyblob ∪ mediumblob': Buffer.from('string'),
			'tinyblob ∪ longblob': Buffer.from('string'),
			'mediumblob ∪ blob': Buffer.from('string'),
			'mediumblob ∪ tinyblob': Buffer.from('string'),
			'mediumblob ∪ mediumblob': Buffer.from('string'),
			'mediumblob ∪ longblob': Buffer.from('string'),
			'longblob ∪ blob': Buffer.from('string'),
			'longblob ∪ tinyblob': Buffer.from('string'),
			'longblob ∪ mediumblob': Buffer.from('string'),
			'longblob ∪ longblob': Buffer.from('string'),
		},
		{
			'blob ∪ blob': Buffer.from('string'),
			'blob ∪ tinyblob': Buffer.from('string'),
			'blob ∪ mediumblob': Buffer.from('string'),
			'blob ∪ longblob': Buffer.from('string'),
			'tinyblob ∪ blob': Buffer.from('string'),
			'tinyblob ∪ tinyblob': Buffer.from('string'),
			'tinyblob ∪ mediumblob': Buffer.from('string'),
			'tinyblob ∪ longblob': Buffer.from('string'),
			'mediumblob ∪ blob': Buffer.from('string'),
			'mediumblob ∪ tinyblob': Buffer.from('string'),
			'mediumblob ∪ mediumblob': Buffer.from('string'),
			'mediumblob ∪ longblob': Buffer.from('string'),
			'longblob ∪ blob': Buffer.from('string'),
			'longblob ∪ tinyblob': Buffer.from('string'),
			'longblob ∪ mediumblob': Buffer.from('string'),
			'longblob ∪ longblob': Buffer.from('string'),
		},
	]));

	// ---- enum ----
	expect(
		await unionAll(
			db.select({
				'enum ∪ enum': allTypesCodecsTable.enum.as('enum ∪ enum'),
			}).from(allTypesCodecsTable),
			db.select({
				'enum ∪ enum': allTypesCodecsTable.enum.as('enum ∪ enum'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'enum ∪ enum': 'enV1',
		},
		{
			'enum ∪ enum': 'enV1',
		},
	]));

	// ---- json ----
	expect(
		await unionAll(
			db.select({
				'json1 ∪ json1': allTypesCodecsTable.json1.as('json1 ∪ json1'),
				'json1 ∪ json2': allTypesCodecsTable.json1.as('json1 ∪ json2'),
				'json1 ∪ json3': allTypesCodecsTable.json1.as('json1 ∪ json3'),
				'json1 ∪ json4': allTypesCodecsTable.json1.as('json1 ∪ json4'),
				'json2 ∪ json1': allTypesCodecsTable.json2.as('json2 ∪ json1'),
				'json2 ∪ json2': allTypesCodecsTable.json2.as('json2 ∪ json2'),
				'json2 ∪ json3': allTypesCodecsTable.json2.as('json2 ∪ json3'),
				'json2 ∪ json4': allTypesCodecsTable.json2.as('json2 ∪ json4'),
				'json3 ∪ json1': allTypesCodecsTable.json3.as('json3 ∪ json1'),
				'json3 ∪ json2': allTypesCodecsTable.json3.as('json3 ∪ json2'),
				'json3 ∪ json3': allTypesCodecsTable.json3.as('json3 ∪ json3'),
				'json3 ∪ json4': allTypesCodecsTable.json3.as('json3 ∪ json4'),
				'json4 ∪ json1': allTypesCodecsTable.json4.as('json4 ∪ json1'),
				'json4 ∪ json2': allTypesCodecsTable.json4.as('json4 ∪ json2'),
				'json4 ∪ json3': allTypesCodecsTable.json4.as('json4 ∪ json3'),
				'json4 ∪ json4': allTypesCodecsTable.json4.as('json4 ∪ json4'),
			}).from(allTypesCodecsTable),
			db.select({
				'json1 ∪ json1': allTypesCodecsTable.json1.as('json1 ∪ json1'),
				'json1 ∪ json2': allTypesCodecsTable.json2.as('json1 ∪ json2'),
				'json1 ∪ json3': allTypesCodecsTable.json3.as('json1 ∪ json3'),
				'json1 ∪ json4': allTypesCodecsTable.json4.as('json1 ∪ json4'),
				'json2 ∪ json1': allTypesCodecsTable.json1.as('json2 ∪ json1'),
				'json2 ∪ json2': allTypesCodecsTable.json2.as('json2 ∪ json2'),
				'json2 ∪ json3': allTypesCodecsTable.json3.as('json2 ∪ json3'),
				'json2 ∪ json4': allTypesCodecsTable.json4.as('json2 ∪ json4'),
				'json3 ∪ json1': allTypesCodecsTable.json1.as('json3 ∪ json1'),
				'json3 ∪ json2': allTypesCodecsTable.json2.as('json3 ∪ json2'),
				'json3 ∪ json3': allTypesCodecsTable.json3.as('json3 ∪ json3'),
				'json3 ∪ json4': allTypesCodecsTable.json4.as('json3 ∪ json4'),
				'json4 ∪ json1': allTypesCodecsTable.json1.as('json4 ∪ json1'),
				'json4 ∪ json2': allTypesCodecsTable.json2.as('json4 ∪ json2'),
				'json4 ∪ json3': allTypesCodecsTable.json3.as('json4 ∪ json3'),
				'json4 ∪ json4': allTypesCodecsTable.json4.as('json4 ∪ json4'),
			}).from(allTypesCodecsTable),
		),
	).toEqual(expect.arrayContaining([
		{
			'json1 ∪ json1': { str: 'strval', arr: ['str', 10] },
			'json1 ∪ json2': { str: 'strval', arr: ['str', 10] },
			'json1 ∪ json3': { str: 'strval', arr: ['str', 10] },
			'json1 ∪ json4': { str: 'strval', arr: ['str', 10] },
			'json2 ∪ json1': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json2 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json2 ∪ json3': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json2 ∪ json4': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json3 ∪ json1': 5,
			'json3 ∪ json2': 5,
			'json3 ∪ json3': 5,
			'json3 ∪ json4': 5,
			'json4 ∪ json1': '5',
			'json4 ∪ json2': '5',
			'json4 ∪ json3': '5',
			'json4 ∪ json4': '5',
		},
		{
			'json1 ∪ json1': { str: 'strval', arr: ['str', 10] },
			'json1 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json1 ∪ json3': 5,
			'json1 ∪ json4': '5',
			'json2 ∪ json1': { str: 'strval', arr: ['str', 10] },
			'json2 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json2 ∪ json3': 5,
			'json2 ∪ json4': '5',
			'json3 ∪ json1': { str: 'strval', arr: ['str', 10] },
			'json3 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json3 ∪ json3': 5,
			'json3 ∪ json4': '5',
			'json4 ∪ json1': { str: 'strval', arr: ['str', 10] },
			'json4 ∪ json2': [{ key: 'value', num: 7 }, 'v', '11', 5],
			'json4 ∪ json3': 5,
			'json4 ∪ json4': '5',
		},
	]));
});

test('Mappers: correct mappers enabled', async () => {
	const jitDb = drizzle({ client, jit: true });

	const dialect: MySqlDialect = (db as any).dialect;
	const jitDialect: MySqlDialect = (jitDb as any).dialect;

	expect(dialect.mapperGenerators.relationalRows === makeDefaultRqbMapper).toStrictEqual(true);
	expect(dialect.mapperGenerators.rows === makeDefaultQueryMapper).toStrictEqual(true);
	expect(jitDialect.mapperGenerators.relationalRows === makeJitRqbMapper).toStrictEqual(true);
	expect(jitDialect.mapperGenerators.rows === makeJitQueryMapper).toStrictEqual(true);
});

test('Mappers: simple select - no rows', async () => {
	const users = mysqlTable('mappers_users_1', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	await push({ users });

	const result = await db.select().from(users);

	expect(result).toStrictEqual([]);
});

test('Mappers: select - nothing to decode - text', async () => {
	const users = mysqlTable('mappers_users_2', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	await push({ users });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	const selected = await db.select({ name: users.name }).from(users);

	expect(selected).toStrictEqual([{ name: 'First' }]);
});

test('Mappers: select - nothing to decode - null', async () => {
	const users = mysqlTable('mappers_users_3', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	await push({ users });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	const selected = await db.select({ isBanned: users.isBanned }).from(users);

	expect(selected).toStrictEqual([{ isBanned: null }]);
});

test('Mappers: insert $returningId + select', async () => {
	const users = mysqlTable('mappers_users_4', (t) => ({
		id: t.bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	await push({ users });

	const insertedIds = await db.insert(users).values([{
		name: 'First',
		createdAt: mappersDate,
	}, {
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

	const selected = await db.select().from(users);

	expect(selected).toStrictEqual([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
		isBanned: null,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
		isBanned: null,
	}]);
});

test('Mappers: select complex selections', async () => {
	const users = mysqlTable('mappers_users_5', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const posts = mysqlTable('mappers_posts_1', (t) => ({
		id: t.int('id').primaryKey(),
		authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
		content: t.text('content'),
	}));

	await push({ users, posts });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	await db.insert(posts).values({
		id: 1,
		authorId: 1,
		content: 'p1',
	});

	const selected1 = await db.select({ user: users, post: posts }).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected2 = await db.select({ user: users, post: posts }).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected3 = await db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected4 = await db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	);

	expect(selected1).toStrictEqual([{
		user: {
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: {
			id: 1,
			authorId: 1,
			content: 'p1',
		},
	}, {
		user: {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		},
		post: null,
	}, {
		user: {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: null,
	}]);
	expect(selected2).toStrictEqual([{
		user: {
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: {
			id: 1,
			authorId: 1,
			content: 'p1',
		},
	}]);
	expect(selected3).toStrictEqual([
		{
			content: 'p1',
			createdAt: mappersDate,
			isBanned: null,
			name: 'First',
			postId: 1,
			userId: 1,
		},
		{
			content: null,
			createdAt: mappersDate,
			isBanned: true,
			name: 'Second',
			postId: null,
			userId: 2,
		},
		{
			content: null,
			createdAt: mappersDate,
			isBanned: null,
			name: 'Third',
			postId: null,
			userId: 3,
		},
	]);
	expect(selected4).toStrictEqual([
		{
			content: 'p1',
			createdAt: mappersDate,
			isBanned: null,
			name: 'First',
			postId: 1,
			userId: 1,
		},
	]);
});

test('Mappers: relational', async () => {
	const users = mysqlTable('mappers_users_6', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const posts = mysqlTable('mappers_posts_2', (t) => ({
		id: t.int('id').primaryKey(),
		authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
		content: t.text('content'),
	}));

	await push({ users, posts });
	const db = drizzle({
		client,
		relations: defineRelations({ users, posts }, (r) => ({
			users: {
				post: r.one.posts({
					from: r.users.id,
					to: r.posts.authorId,
				}),
				posts: r.one.posts({
					from: r.users.id,
					to: r.posts.authorId,
				}),
			},
			posts: {
				author: r.one.users({
					from: r.posts.authorId,
					to: r.users.id,
				}),
				authors: r.many.users({
					from: r.posts.authorId,
					to: r.users.id,
				}),
			},
		})),
	});

	const empty1 = await db.query.users.findFirst();
	const empty2 = await db.query.users.findMany();

	expect(empty1).toStrictEqual(undefined);
	expect(empty2).toStrictEqual([]);

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	await db.insert(posts).values({
		id: 1,
		authorId: 1,
		content: 'p1',
	});

	const simple1 = await db.query.users.findFirst();
	const simple2 = await db.query.users.findMany();

	expect(simple1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
		},
	);
	expect(simple2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
		},
	]);

	const extra1 = await db.query.users.findFirst({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	const extra2 = await db.query.users.findMany({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});

	expect(extra1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			sql: 1,
			sqlWrapper: 2,
		},
	);
	expect(extra2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
			sql: 1,
			sqlWrapper: 2,
		},
	]);

	const nested1 = await db.query.users.findFirst({
		with: {
			post: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
			posts: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	const nested2 = await db.query.users.findMany({
		with: {
			post: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
			posts: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});

	expect(nested1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			post: {
				author: null,
				authorId: 1,
				authors: [],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			posts: {
				author: {
					createdAt: mappersDate,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				authorId: 1,
				authors: [
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			sql: 1,
			sqlWrapper: 2,
		},
	);
	expect(nested2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			post: {
				author: null,
				authorId: 1,
				authors: [],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			posts: {
				author: {
					createdAt: mappersDate,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				authorId: 1,
				authors: [
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
			post: null,
			posts: null,
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
			post: null,
			posts: null,
			sql: 1,
			sqlWrapper: 2,
		},
	]);
});

test('Jit mappers: simple select - no rows', async () => {
	const users = mysqlTable('jit_mappers_users_1', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const db = drizzle({ client, jit: true });
	await push({ users });

	const result = await db.select().from(users);

	expect(result).toStrictEqual([]);
});

test('Jit mappers: select - nothing to decode - text', async () => {
	const users = mysqlTable('jit_mappers_users_2', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const db = drizzle({ client, jit: true });
	await push({ users });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	const selected = await db.select({ name: users.name }).from(users);

	expect(selected).toStrictEqual([{ name: 'First' }]);
});

test('Jit mappers: select - nothing to decode - null', async () => {
	const users = mysqlTable('jit_mappers_users_3', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const db = drizzle({ client, jit: true });
	await push({ users });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	const selected = await db.select({ isBanned: users.isBanned }).from(users);

	expect(selected).toStrictEqual([{ isBanned: null }]);
});

test('Jit mappers: insert $returningId + select', async () => {
	const users = mysqlTable('jit_mappers_users_4', (t) => ({
		id: t.bigint('id', { mode: 'number' }).autoincrement().primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const db = drizzle({ client, jit: true });
	await push({ users });

	const insertedIds = await db.insert(users).values([{
		name: 'First',
		createdAt: mappersDate,
	}, {
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);

	const selected = await db.select().from(users);

	expect(selected).toStrictEqual([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
		isBanned: null,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
		isBanned: null,
	}]);
});

test('Jit mappers: select complex selections', async () => {
	const users = mysqlTable('jit_mappers_users_5', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const posts = mysqlTable('jit_mappers_posts_1', (t) => ({
		id: t.int('id').primaryKey(),
		authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
		content: t.text('content'),
	}));

	const db = drizzle({ client, jit: true });
	await push({ users, posts });

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	await db.insert(posts).values({
		id: 1,
		authorId: 1,
		content: 'p1',
	});

	const selected1 = await db.select({ user: users, post: posts }).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected2 = await db.select({ user: users, post: posts }).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected3 = await db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).leftJoin(
		posts,
		eq(users.id, posts.authorId),
	);
	const selected4 = await db.select({
		userId: users.id,
		postId: posts.id,
		name: users.name,
		isBanned: users.isBanned,
		content: posts.content,
		createdAt: users.createdAt,
	}).from(users).innerJoin(
		posts,
		eq(users.id, posts.authorId),
	);

	expect(selected1).toStrictEqual([{
		user: {
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: {
			id: 1,
			authorId: 1,
			content: 'p1',
		},
	}, {
		user: {
			id: 2,
			name: 'Second',
			createdAt: mappersDate,
			isBanned: true,
		},
		post: null,
	}, {
		user: {
			id: 3,
			name: 'Third',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: null,
	}]);
	expect(selected2).toStrictEqual([{
		user: {
			id: 1,
			name: 'First',
			createdAt: mappersDate,
			isBanned: null,
		},
		post: {
			id: 1,
			authorId: 1,
			content: 'p1',
		},
	}]);
	expect(selected3).toStrictEqual([
		{
			content: 'p1',
			createdAt: mappersDate,
			isBanned: null,
			name: 'First',
			postId: 1,
			userId: 1,
		},
		{
			content: null,
			createdAt: mappersDate,
			isBanned: true,
			name: 'Second',
			postId: null,
			userId: 2,
		},
		{
			content: null,
			createdAt: mappersDate,
			isBanned: null,
			name: 'Third',
			postId: null,
			userId: 3,
		},
	]);
	expect(selected4).toStrictEqual([
		{
			content: 'p1',
			createdAt: mappersDate,
			isBanned: null,
			name: 'First',
			postId: 1,
			userId: 1,
		},
	]);
});

test('Jit mappers: relational', async () => {
	const users = mysqlTable('jit_mappers_users_6', (t) => ({
		id: t.bigint('id', { mode: 'number' }).primaryKey(),
		name: t.text('name').notNull(),
		createdAt: t.timestamp('created_at', { mode: 'date' }).notNull(),
		isBanned: t.boolean('is_banned'),
	}));

	const posts = mysqlTable('jit_mappers_posts_2', (t) => ({
		id: t.int('id').primaryKey(),
		authorId: t.bigint('author_id', { mode: 'number' }).references(() => users.id),
		content: t.text('content'),
	}));

	await push({ users, posts });
	const db = drizzle({
		client,
		jit: true,
		relations: defineRelations({ users, posts }, (r) => ({
			users: {
				post: r.one.posts({
					from: r.users.id,
					to: r.posts.authorId,
				}),
				posts: r.one.posts({
					from: r.users.id,
					to: r.posts.authorId,
				}),
			},
			posts: {
				author: r.one.users({
					from: r.posts.authorId,
					to: r.users.id,
				}),
				authors: r.many.users({
					from: r.posts.authorId,
					to: r.users.id,
				}),
			},
		})),
	});

	const empty1 = await db.query.users.findFirst();
	const empty2 = await db.query.users.findMany();

	expect(empty1).toStrictEqual(undefined);
	expect(empty2).toStrictEqual([]);

	const insertedIds = await db.insert(users).values([{
		id: 1,
		name: 'First',
		createdAt: mappersDate,
	}, {
		id: 2,
		name: 'Second',
		createdAt: mappersDate,
		isBanned: true,
	}, {
		id: 3,
		name: 'Third',
		createdAt: mappersDate,
	}]).$returningId();

	expect(insertedIds).toStrictEqual([]);

	await db.insert(posts).values({
		id: 1,
		authorId: 1,
		content: 'p1',
	});

	const simple1 = await db.query.users.findFirst();
	const simple2 = await db.query.users.findMany();

	expect(simple1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
		},
	);
	expect(simple2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
		},
	]);

	const extra1 = await db.query.users.findFirst({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	const extra2 = await db.query.users.findMany({
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});

	expect(extra1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			sql: 1,
			sqlWrapper: 2,
		},
	);
	expect(extra2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
			sql: 1,
			sqlWrapper: 2,
		},
	]);

	const nested1 = await db.query.users.findFirst({
		with: {
			post: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
			posts: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});
	const nested2 = await db.query.users.findMany({
		with: {
			post: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
						where: {
							RAW: sql`false`,
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
			posts: {
				with: {
					author: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
					authors: {
						extras: {
							sql: sql`SELECT 1`.mapWith(Number),
							sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
						},
					},
				},
				extras: {
					sql: sql`SELECT 1`.mapWith(Number),
					sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
				},
			},
		},
		extras: {
			sql: sql`SELECT 1`.mapWith(Number),
			sqlWrapper: { getSQL: () => sql`SELECT 2`.mapWith(Number) },
		},
	});

	expect(nested1).toStrictEqual(
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			post: {
				author: null,
				authorId: 1,
				authors: [],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			posts: {
				author: {
					createdAt: mappersDate,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				authorId: 1,
				authors: [
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			sql: 1,
			sqlWrapper: 2,
		},
	);
	expect(nested2).toStrictEqual([
		{
			createdAt: mappersDate,
			id: 1,
			isBanned: null,
			name: 'First',
			post: {
				author: null,
				authorId: 1,
				authors: [],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			posts: {
				author: {
					createdAt: mappersDate,
					id: 1,
					isBanned: null,
					name: 'First',
					sql: 1,
					sqlWrapper: 2,
				},
				authorId: 1,
				authors: [
					{
						createdAt: mappersDate,
						id: 1,
						isBanned: null,
						name: 'First',
						sql: 1,
						sqlWrapper: 2,
					},
				],
				content: 'p1',
				id: 1,
				sql: 1,
				sqlWrapper: 2,
			},
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 2,
			isBanned: true,
			name: 'Second',
			post: null,
			posts: null,
			sql: 1,
			sqlWrapper: 2,
		},
		{
			createdAt: mappersDate,
			id: 3,
			isBanned: null,
			name: 'Third',
			post: null,
			posts: null,
			sql: 1,
			sqlWrapper: 2,
		},
	]);
});

test('Column as decoder applies codecs', async () => {
	let customCast = false;
	let customMap = false;

	const codecBypass = customType<{
		data: Date;
		driverData: string;
		jsonData: string;
	}>({
		codec: 'timestamp',
		dataType: () => 'timestamp(3)',
		forJsonSelect: (identifier, sql) => {
			customCast = true;
			return sql`cast(${identifier} as char)`;
		},
		fromJson: (v) => {
			customMap = true;
			return new Date(v + '+0000');
		},
		toDriver: (v) => v.toISOString().replace('T', ' ').replace('Z', ''),
	});

	const users = mysqlTable('users_823', (t) => ({
		id: t.int().primaryKey(),
		name: t.text().notNull(),
		createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
		createdAtStr: t.timestamp('created_at_str', { fsp: 3, mode: 'string' }).notNull(),
		cus: codecBypass('custom').notNull(),
	}));

	const usersView = mysqlView('users_823_v').as((qb) =>
		qb.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxStr: max(users.createdAtStr).as('max_str'),
			sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
		}).from(users).groupBy(users.id)
	);

	await push({ users, usersView });

	const db = drizzle({
		client,
		relations: defineRelations({ users, usersView }, (r) => ({
			users: {
				self: r.one.users({
					from: r.users.id,
					to: r.users.id,
				}),
			},
			usersView: {
				self: r.one.usersView({
					from: r.usersView.id,
					to: r.usersView.id,
				}),
			},
		})),
	});

	const exDateStr = '1970-01-16 16:45:46.351';
	const exDate = new Date(exDateStr);

	await db.insert(users).values({
		id: 1,
		name: 'First',
		createdAt: exDate,
		createdAtStr: exDateStr,
		cus: exDate,
	});

	const res = await db.select({
		...getColumns(users),
		max: max(users.createdAt).as('max'),
		maxStr: max(users.createdAtStr).as('max_str'),
		sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
	}).from(users).groupBy(users.id);

	const viewRes = await db.select().from(usersView);

	const nested = await db.query.users.findFirst({
		with: {
			self: {
				extras: {
					max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
					maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
				},
			},
		},
		extras: {
			max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
			maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
		},
	});

	const viewNested = await db.query.usersView.findFirst({
		columns: {
			sq: false, // TODO: re-enable when supported in RQBv2
		},
		with: {
			self: {
				columns: {
					sq: false, // TODO: re-enable when supported in RQBv2
				},
			},
		},
	});

	expect(res).toStrictEqual([
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			sq: exDate,
			cus: exDate,
		},
	]);
	expect(viewRes).toStrictEqual([
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			sq: exDate,
			cus: exDate,
		},
	]);

	expect(customCast).toBeTruthy();
	expect(customMap).toBeTruthy();

	expect(nested).toStrictEqual(
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			cus: exDate,
			self: {
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
			},
		},
	);
	expect(viewNested).toStrictEqual(
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			cus: exDate,
			self: {
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
			},
		},
	);
});

test('Column as decoder applies codecs - Jit mappers', async () => {
	let customCast = false;
	let customMap = false;

	const codecBypass = customType<{
		data: Date;
		driverData: string;
		jsonData: string;
	}>({
		codec: 'timestamp',
		dataType: () => 'timestamp(3)',
		forJsonSelect: (identifier, sql) => {
			customCast = true;
			return sql`cast(${identifier} as char)`;
		},
		fromJson: (v) => {
			customMap = true;
			return new Date(v + '+0000');
		},
		toDriver: (v) => v.toISOString().replace('T', ' ').replace('Z', ''),
	});

	const users = mysqlTable('users_823_jit', (t) => ({
		id: t.int().primaryKey(),
		name: t.text().notNull(),
		createdAt: t.timestamp('created_at', { fsp: 3 }).notNull(),
		createdAtStr: t.timestamp('created_at_str', { fsp: 3, mode: 'string' }).notNull(),
		cus: codecBypass('custom').notNull(),
	}));

	const usersView = mysqlView('users_823_v_jit').as((qb) =>
		qb.select({
			...getColumns(users),
			max: max(users.createdAt).as('max'),
			maxStr: max(users.createdAtStr).as('max_str'),
			sq: qb.select({ createdAt: users.createdAt }).from(users).as('sq'),
		}).from(users).groupBy(users.id)
	);

	await push({ users, usersView });

	const db = drizzle({
		client,
		jit: true,
		relations: defineRelations({ users, usersView }, (r) => ({
			users: {
				self: r.one.users({
					from: r.users.id,
					to: r.users.id,
				}),
			},
			usersView: {
				self: r.one.usersView({
					from: r.usersView.id,
					to: r.usersView.id,
				}),
			},
		})),
	});

	const exDateStr = '1970-01-16 16:45:46.351';
	const exDate = new Date(exDateStr);

	await db.insert(users).values({
		id: 1,
		name: 'First',
		createdAt: exDate,
		createdAtStr: exDateStr,
		cus: exDate,
	});

	const res = await db.select({
		...getColumns(users),
		max: max(users.createdAt).as('max'),
		maxStr: max(users.createdAtStr).as('max_str'),
		sq: db.select({ createdAt: users.createdAt }).from(users).as('sq'),
	}).from(users).groupBy(users.id);

	const viewRes = await db.select().from(usersView);

	const nested = await db.query.users.findFirst({
		with: {
			self: {
				extras: {
					max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
					maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
				},
			},
		},
		extras: {
			max: () => sql`select max(${users.createdAt}) from ${users}`.mapWith(users.createdAt),
			maxStr: () => sql`select max(${users.createdAtStr}) from ${users}`.mapWith(users.createdAtStr),
		},
	});

	const viewNested = await db.query.usersView.findFirst({
		columns: {
			sq: false, // TODO: re-enable when supported in RQBv2
		},
		with: {
			self: {
				columns: {
					sq: false, // TODO: re-enable when supported in RQBv2
				},
			},
		},
	});

	expect(res).toStrictEqual([
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			sq: exDate,
			cus: exDate,
		},
	]);
	expect(viewRes).toStrictEqual([
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			sq: exDate,
			cus: exDate,
		},
	]);

	expect(customCast).toBeTruthy();
	expect(customMap).toBeTruthy();

	expect(nested).toStrictEqual(
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			cus: exDate,
			self: {
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
			},
		},
	);
	expect(viewNested).toStrictEqual(
		{
			id: 1,
			name: 'First',
			createdAt: exDate,
			createdAtStr: exDateStr,
			max: exDate,
			maxStr: exDateStr,
			cus: exDate,
			self: {
				id: 1,
				name: 'First',
				createdAt: exDate,
				createdAtStr: exDateStr,
				max: exDate,
				maxStr: exDateStr,
				cus: exDate,
			},
		},
	);
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
			db: MySqlAsyncDatabase<any, any>;
			dbGlobalCached: MySqlAsyncDatabase<any, any>;
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
