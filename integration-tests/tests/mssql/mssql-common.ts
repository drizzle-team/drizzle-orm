import Docker from 'dockerode';
import {
	asc,
	avg,
	avgDistinct,
	count,
	countDistinct,
	eq,
	getTableColumns,
	gt,
	gte,
	inArray,
	max,
	min,
	Name,
	sql,
	sum,
	sumDistinct,
	TransactionRollbackError,
} from 'drizzle-orm';
import {
	alias,
	bit,
	date,
	datetime,
	datetime2,
	except,
	foreignKey,
	getTableConfig,
	getViewConfig,
	int,
	intersect,
	mssqlSchema,
	mssqlTable,
	mssqlTableCreator,
	mssqlView,
	nvarchar,
	primaryKey,
	text,
	time,
	union,
	unionAll,
	unique,
	uniqueIndex,
	uniqueKeyName,
	varchar,
} from 'drizzle-orm/mssql-core';
import type { NodeMsSqlDatabase } from 'drizzle-orm/node-mssql';
import { migrate } from 'drizzle-orm/node-mssql/migrator';
import getPort from 'get-port';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';
import { type Equal, Expect } from '~/utils.ts';

declare module 'vitest' {
	interface TestContext {
		mssql: {
			db: NodeMsSqlDatabase;
		};
	}
}

// const ENABLE_LOGGING = true;

const usersTable = mssqlTable('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { length: 300, mode: 'json' }).$type<string[]>(),
	createdAt: datetime('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

const users2Table = mssqlTable('users2', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
	cityId: int('city_id').default(sql`null`).references(() => citiesTable.id),
});

const citiesTable = mssqlTable('cities', {
	id: int('id').primaryKey(),
	name: varchar('name', { length: 30 }).notNull(),
});

const usersOnUpdate = mssqlTable('users_on_update', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	updateCounter: int('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: datetime('updated_at', { mode: 'date' }).$onUpdate(() => new Date()),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper([name])`),
	alwaysNull: text('always_null').$type<string | null>().$onUpdateFn(() => null), // need to add $type because $onUpdate add a default value
});

const datesTable = mssqlTable('datestable', {
	date: date('date'),
	dateAsString: date('date_as_string', { mode: 'string' }),
	time: time('time', { precision: 1 }),
	timeAsString: time('time_as_string', { mode: 'string', precision: 1 }),
	datetime: datetime('datetime'),
	datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
});

const coursesTable = mssqlTable('courses', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	categoryId: int('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = mssqlTable('course_categories', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
});

const orders = mssqlTable('orders', {
	id: int('id').primaryKey(),
	region: varchar('region', { length: 50 }).notNull(),
	product: varchar('product', { length: 50 }).notNull().$default(() => 'random_string'),
	amount: int('amount').notNull(),
	quantity: int('quantity').notNull(),
});

const usersMigratorTable = mssqlTable('users12', {
	id: int('id').identity().primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
}, (table) => {
	return {
		name: uniqueIndex('').on(table.name).using('btree'),
	};
});

// To test aggregate functions
const aggregateTable = mssqlTable('aggregate_table', {
	id: int('id').identity().notNull(),
	name: varchar('name', { length: 30 }).notNull(),
	a: int('a'),
	b: int('b'),
	c: int('c'),
	nullOnly: int('null_only'),
});

const mySchema = mssqlSchema('mySchema');

const usersSchemaTable = mySchema.table('userstest', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	verified: bit('verified').notNull().default(false),
	jsonb: nvarchar('jsonb', { mode: 'json', length: 100 }).$type<string[]>(),
	createdAt: datetime2('created_at', { precision: 2 }).notNull().defaultCurrentTimestamp(),
});

const users2SchemaTable = mySchema.table('users2', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
	cityId: int('city_id').references(() => citiesTable.id),
});

const citiesSchemaTable = mySchema.table('cities', {
	id: int('id').identity().primaryKey(),
	name: varchar('name', { length: 100 }).notNull(),
});

const tableWithEnums = mySchema.table('enums_test_case', {
	id: int('id').primaryKey(),
	enum1: varchar('enum1', { enum: ['a', 'b', 'c'] }).notNull(),
	enum2: varchar('enum2', { enum: ['a', 'b', 'c'] }).default('a'),
	enum3: varchar('enum3', { enum: ['a', 'b', 'c'] }).notNull().default('b'),
});

let mssqlContainer: Docker.Container;
export async function createDockerDB(): Promise<{ container: Docker.Container; connectionString: string }> {
	const docker = new Docker();
	const port = await getPort({ port: 1434 });
	const image = 'mcr.microsoft.com/mssql/server:2019-latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	mssqlContainer = await docker.createContainer({
		Image: image,
		Env: ['ACCEPT_EULA=Y', 'MSSQL_SA_PASSWORD=drizzle123PASSWORD'],
		name: `drizzle-integration-tests-${uuid()}`,
		platform: 'linux/amd64',
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'1433/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await mssqlContainer.start();

	return {
		connectionString: `Server=localhost,${port};User Id=SA;Password=drizzle123PASSWORD;TrustServerCertificate=True;`,
		container: mssqlContainer,
	};
}

export function tests() {
	describe('common', () => {
		afterAll(async () => {
			await mssqlContainer?.stop().catch(console.error);
		});

		beforeEach(async (ctx) => {
			const { db } = ctx.mssql;
			await db.execute(sql`drop table if exists [userstest]`);
			await db.execute(sql`drop table if exists [users2]`);
			await db.execute(sql`drop table if exists [cities]`);
			await db.execute(sql`drop table if exists [mySchema].[userstest]`);
			await db.execute(sql`drop table if exists [mySchema].[users2]`);
			await db.execute(sql`drop table if exists [mySchema].[cities]`);
			await db.execute(sql`drop schema if exists [mySchema]`);
			await db.execute(sql`create schema [mySchema]`);

			await db.execute(
				sql`
					create table [userstest] (
					  [id] int identity primary key,
					  [name] varchar(30) not null,
					  [verified] bit not null default 0,
					  [jsonb] text,
					  [created_at] datetime not null default current_timestamp
					)
				`,
			);

			await db.execute(
				sql`
					create table [cities] (
					  [id] int primary key,
					  [name] varchar(30) not null
					)
				`,
			);

			await db.execute(
				sql`
					create table [users2] (
					  [id] int primary key,
					  [name] varchar(30) not null,
					  [city_id] int null foreign key references [cities]([id])
					)
				`,
			);

			await db.execute(
				sql`
					create table [mySchema].[userstest] (
						[id] int identity primary key,
						[name] varchar(100) not null,
						[verified] bit not null default 0,
						[jsonb] nvarchar(100),
						[created_at] datetime2(2) not null default current_timestamp
					)
				`,
			);

			await db.execute(
				sql`
					create table [mySchema].[cities] (
						[id] int identity primary key,
						[name] varchar(100) not null
					)
				`,
			);

			await db.execute(
				sql`
					create table [mySchema].[users2] (
						[id] int identity primary key,
						[name] varchar(100) not null,
						[city_id] int references [mySchema].[cities]([id])
					)
				`,
			);
		});

		async function setupSetOperationTest(db: NodeMsSqlDatabase) {
			await db.execute(sql`drop table if exists [users2]`);
			await db.execute(sql`drop table if exists [cities]`);

			await db.execute(
				sql`
					create table [cities] (
						[id] int primary key,
						[name] varchar(30) not null
					)
				`,
			);

			await db.execute(
				sql`
					create table [users2] (
						[id] int primary key,
						[name] varchar(30) not null,
						[city_id] int foreign key references [cities]([id])
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

		async function setupAggregateFunctionsTest(db: NodeMsSqlDatabase) {
			await db.execute(sql`drop table if exists [aggregate_table]`);
			await db.execute(
				sql`
					create table [aggregate_table] (
						[id] int identity primary key not null,
						[name] varchar(30) not null,
						[a] int,
						[b] int,
						[c] int,
						[null_only] int
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

		test('table config: foreign keys name', async () => {
			const table = mssqlTable('cities', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
			}));

			const tableConfig = getTableConfig(table);

			expect(tableConfig.foreignKeys).toHaveLength(1);
			expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
		});

		test('table config: primary keys name', async () => {
			const table = mssqlTable('cities', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: primaryKey({ columns: [t.id, t.name], name: 'custom_pk' }),
			}));

			const tableConfig = getTableConfig(table);

			expect(tableConfig.primaryKeys).toHaveLength(1);
			expect(tableConfig.primaryKeys[0]!.getName()).toBe('custom_pk');
		});

		test('table configs: unique third param', async () => {
			const cities1Table = mssqlTable('cities1', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: unique('custom_name').on(t.name, t.state),
				f1: unique('custom_name1').on(t.name, t.state),
			}));

			const tableConfig = getTableConfig(cities1Table);

			expect(tableConfig.uniqueConstraints).toHaveLength(2);

			expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
			expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

			expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
			expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		});

		test('table configs: unique in column', async () => {
			const cities1Table = mssqlTable('cities1', {
				id: int('id').primaryKey(),
				name: text('name').notNull().unique(),
				state: text('state').unique('custom'),
				field: text('field').unique('custom_field'),
			});

			const tableConfig = getTableConfig(cities1Table);

			const columnName = tableConfig.columns.find((it) => it.name === 'name');
			expect(columnName?.uniqueName).toBe(uniqueKeyName(cities1Table, [columnName!.name]));
			expect(columnName?.isUnique).toBeTruthy();

			const columnState = tableConfig.columns.find((it) => it.name === 'state');
			expect(columnState?.uniqueName).toBe('custom');
			expect(columnState?.isUnique).toBeTruthy();

			const columnField = tableConfig.columns.find((it) => it.name === 'field');
			expect(columnField?.uniqueName).toBe('custom_field');
			expect(columnField?.isUnique).toBeTruthy();
		});

		test('select all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('select sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select typed sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersTable.name})`,
			}).from(usersTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('select distinct', async (ctx) => {
			const { db } = ctx.mssql;

			const usersDistinctTable = mssqlTable('users_distinct', {
				id: int('id').notNull(),
				name: varchar('name', { length: 30 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${usersDistinctTable}`);
			await db.execute(sql`create table ${usersDistinctTable} (id int, name varchar(30))`);

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

			expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
		});

		test('insert returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			const result = await db.insert(usersTable).values({ name: 'John' });

			expect(result.rowsAffected[0]).toEqual(1);
		});

		test('delete returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(users.rowsAffected[0]).toBe(1);
		});

		test('update returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const users = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			expect(users.rowsAffected[0]).toBe(1);
		});

		test('update with returning all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select().from(usersTable).where(eq(usersTable.id, 1));

			expect(updatedUsers.rowsAffected[0]).toBe(1);

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
			expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
		});

		test('update with returning partial', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const updatedUsers = await db.update(usersTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable).where(
				eq(usersTable.id, 1),
			);

			expect(updatedUsers.rowsAffected[0]).toEqual(1);

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('delete with returning all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser.rowsAffected[0]).toBe(1);
		});

		test('delete with returning partial', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser.rowsAffected[0]).toBe(1);
		});

		test('insert + select', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const result = await db.select().from(usersTable);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(usersTable).values({ name: 'Jane' });
			const result2 = await db.select().from(usersTable);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test('json insert', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
			const result = await db.select({
				id: usersTable.id,
				name: usersTable.name,
				jsonb: usersTable.jsonb,
			}).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
		});

		test('insert with overridden default values', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John', verified: true });
			const result = await db.select().from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('insert many', async (ctx) => {
			const { db } = ctx.mssql;

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

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test('insert many with returning', async (ctx) => {
			const { db } = ctx.mssql;

			const result = await db.insert(usersTable).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);

			expect(result.rowsAffected[0]).toBe(4);
		});

		test('select with group by as field', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.name).orderBy(usersTable.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('select with group by as sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`).orderBy(usersTable.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('$default function', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [orders]`);
			await db.execute(
				sql`
					create table [orders] (
						[id] int primary key,
						[region] text not null,
						[product] text not null,
						[amount] int not null,
						[quantity] int not null
					)
				`,
			);

			await db.insert(orders).values({ id: 1, region: 'Ukraine', amount: 1, quantity: 1 });
			const selectedOrder = await db.select().from(orders);

			expect(selectedOrder).toEqual([{
				id: 1,
				amount: 1,
				quantity: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);
		});

		test('$default with empty array', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [s_orders]`);
			await db.execute(
				sql`
					create table [s_orders] (
						[id] int identity primary key,
						[region] text default ('Ukraine'),
						[product] text not null
					)
				`,
			);

			const users = mssqlTable('s_orders', {
				id: int('id').identity().primaryKey(),
				region: text('region').default('Ukraine'),
				product: text('product').$defaultFn(() => 'random_string'),
			});

			await db.insert(users).values({});
			const selectedOrder = await db.select().from(users);

			expect(selectedOrder).toEqual([{
				id: 1,
				region: 'Ukraine',
				product: 'random_string',
			}]);
		});

		test('select with group by as sql + column', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(sql`${usersTable.name}`, usersTable.id);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by as column + sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('select with group by complex query', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, sql`${usersTable.name}`)
				.orderBy(asc(usersTable.name))
				.offset(0).fetch(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test('build query', async (ctx) => {
			const { db } = ctx.mssql;

			const query = db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable)
				.groupBy(usersTable.id, usersTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: `select [id], [name] from [userstest] group by [userstest].[id], [userstest].[name]`,
				params: [],
			});
		});

		test('Query check: Insert all defaults in 1 row', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users', {
				id: int('id').identity().primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			const query = db
				.insert(users)
				.values({})
				.toSQL();

			expect(query).toEqual({
				sql: 'insert into [users] ([name], [state]) values (default, default)',
				params: [],
			});
		});

		test('Query check: Insert all defaults in multiple rows', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users', {
				id: int('id').identity().primaryKey(),
				name: text('name').default('Dan'),
				state: text('state').default('UA'),
			});

			const query = db
				.insert(users)
				.values([{}, {}])
				.toSQL();

			expect(query).toEqual({
				sql: 'insert into [users] ([name], [state]) values (default, default), (default, default)',
				params: [],
			});
		});

		test('Insert all defaults in 1 row', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('empty_insert_single', {
				id: int('id').identity().primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int identity primary key, name text default ('Dan'), state text)`,
			);

			await db.insert(users).values({});

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }]);
		});

		test('Insert all defaults in multiple rows', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('empty_insert_multiple', {
				id: int('id').identity().primaryKey(),
				name: text('name').default('Dan'),
				state: text('state'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int identity primary key, name text default ('Dan'), state text)`,
			);

			await db.insert(users).values([{}, {}]);

			const res = await db.select().from(users);

			expect(res).toEqual([{ id: 1, name: 'Dan', state: null }, { id: 2, name: 'Dan', state: null }]);
		});

		test('insert sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: sql`${'John'}` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('partial join with alias', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('usersForTest', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

			const customerAlias = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select({
					user: {
						id: users.id,
						name: users.name,
					},
					customer: {
						id: customerAlias.id,
						name: customerAlias.name,
					},
				}).from(users)
				.leftJoin(customerAlias, eq(customerAlias.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
				user: { id: 10, name: 'Ivan' },
				customer: { id: 11, name: 'Hans' },
			}]);

			await db.execute(sql`drop table ${users}`);
		});

		test('full join with alias', async (ctx) => {
			const { db } = ctx.mssql;

			const mssqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

			const users = mssqlTable('users', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select().from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
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

		test('select from alias', async (ctx) => {
			const { db } = ctx.mssql;

			const mssqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

			const users = mssqlTable('users', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(user)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(user.id, 10));

			expect(result).toEqual([{
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

		test('insert with spaces', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersTable.id, name: usersTable.name }).from(usersTable);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('prepared statement', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const statement = db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable)
				.prepare();
			const result = await statement.execute();

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('prepared statement reuse', async (ctx) => {
			const { db } = ctx.mssql;

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

			expect(result).toEqual([
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

		test('prepared statement with placeholder in .where', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values({ name: 'John' });
			const stmt = db.select({
				id: usersTable.id,
				name: usersTable.name,
			}).from(usersTable)
				.where(eq(usersTable.id, sql.placeholder('id')))
				.prepare();
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('migrator', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists cities_migration`);
			await db.execute(sql`drop table if exists users_migration`);
			await db.execute(sql`drop table if exists users12`);
			await db.execute(sql`drop table if exists __drizzle_migrations`);

			await migrate(db, { migrationsFolder: './drizzle2/mssql' });

			await db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

			const result = await db.select().from(usersMigratorTable);

			expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);

			await db.execute(sql`drop table cities_migration`);
			await db.execute(sql`drop table users_migration`);
			await db.execute(sql`drop table users12`);
			await db.execute(sql`drop table __drizzle_migrations`);
		});

		test('insert via db.execute + select via db.execute', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`insert into ${usersTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersTable}`);
			expect(result.recordset).toEqual([{ id: 1, name: 'John' }]);
		});

		test('insert via db.execute w/ query builder', async (ctx) => {
			const { db } = ctx.mssql;

			const inserted = await db.execute(
				db.insert(usersTable).values({ name: 'John' }),
			);
			expect(inserted.rowsAffected[0]).toBe(1);
		});

		test('insert + select all possible dates', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [datestable]`);
			await db.execute(
				sql`
					create table [datestable] (
						[date] date,
						[date_as_string] date,
						[time] time,
						[time_as_string] time,
						[datetime] datetime,
						[datetime_as_string] datetime,
					)
				`,
			);

			const date = new Date('2022-11-11');

			await db.insert(datesTable).values({
				date: date,
				dateAsString: '2022-11-11',
				time: '12:12:12',
				timeAsString: '12:12:12',
				datetime: date,
				datetimeAsString: '2022-11-11 12:12:12',
			});

			const res = await db.select().from(datesTable);

			expect(res[0]?.date).toBeInstanceOf(Date);
			expect(res[0]?.datetime).toBeInstanceOf(Date);
			expect(typeof res[0]?.dateAsString).toBe('string');
			expect(typeof res[0]?.datetimeAsString).toBe('string');

			expect(res).toEqual([{
				date: new Date('2022-11-11'),
				dateAsString: '2022-11-11',
				time: new Date('1970-01-01T12:12:12Z'),
				datetime: new Date('2022-11-11'),
				datetimeAsString: '2022-11-11T12:12:12.000Z',
				timeAsString: '12:12:12.000',
			}]);

			await db.execute(sql`drop table if exists [datestable]`);
		});

		test('Mssql enum test case #1', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [enums_test_case]`);

			await db.execute(sql`
				create table [enums_test_case] (
					[id] int primary key,
					[enum1] text not null,
					[enum2] text default 'a',
					[enum3] text not null default 'b'
				)
			`);

			const tableWithEnums = mssqlTable('enums_test_case', {
				id: int('id').primaryKey(),
				enum1: varchar('enum1', { enum: ['a', 'b', 'c'] }).notNull(),
				enum2: varchar('enum2', { enum: ['a', 'b', 'c'] }).default('a'),
				enum3: varchar('enum3', { enum: ['a', 'b', 'c'] }).notNull().default('b'),
			});

			await db.insert(tableWithEnums).values([
				{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
				{ id: 2, enum1: 'a', enum3: 'c' },
				{ id: 3, enum1: 'a' },
			]);

			const res = await db.select().from(tableWithEnums);

			await db.execute(sql`drop table [enums_test_case]`);

			expect(res).toEqual([
				{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
				{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
				{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
			]);
		});

		test('left join (flat object fields)', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

			const res = await db.select({
				userId: users2Table.id,
				userName: users2Table.name,
				cityId: citiesTable.id,
				cityName: citiesTable.name,
			}).from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

			expect(res).toEqual([
				{ userId: 1, userName: 'John', cityId: 1, cityName: 'Paris' },
				{ userId: 2, userName: 'Jane', cityId: null, cityName: null },
			]);
		});

		test('left join (grouped fields)', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

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

			expect(res).toEqual([
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

		test('left join (all fields)', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(citiesTable)
				.values([{ id: 1, name: 'Paris' }, { id: 2, name: 'London' }]);

			await db.insert(users2Table).values([{ id: 1, name: 'John', cityId: 1 }, { id: 2, name: 'Jane' }]);

			const res = await db.select().from(users2Table)
				.leftJoin(citiesTable, eq(users2Table.cityId, citiesTable.id));

			expect(res).toEqual([
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

		test('join subquery', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [courses]`);
			await db.execute(sql`drop table if exists [course_categories]`);

			await db.execute(
				sql`
					create table [course_categories] (
						[id] int identity primary key,
						[name] varchar(50) not null
					)
				`,
			);

			await db.execute(
				sql`
					create table [courses] (
						[id] int identity primary key,
						[name] varchar(50) not null,
						[category_id] int references [course_categories]([id])
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
					total: sql<number>`count(${courseCategoriesTable.id})`.as('count'),
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

			expect(res).toEqual([
				{ courseName: 'Design', categoryId: 1 },
				{ courseName: 'Development', categoryId: 2 },
				{ courseName: 'IT & Software', categoryId: 3 },
				{ courseName: 'Marketing', categoryId: 4 },
			]);

			await db.execute(sql`drop table if exists [courses]`);
			await db.execute(sql`drop table if exists [course_categories]`);
		});

		test('with ... select', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists [orders]`);
			await db.execute(
				sql`
					create table [orders] (
						[id] int primary key,
						[region] varchar(50) not null,
						[product] varchar(50) not null,
						[amount] int not null,
						[quantity] int not null
					)
				`,
			);

			await db.insert(orders).values([
				{ id: 1, region: 'Europe', product: 'A', amount: 10, quantity: 1 },
				{ id: 2, region: 'Europe', product: 'A', amount: 20, quantity: 2 },
				{ id: 3, region: 'Europe', product: 'B', amount: 20, quantity: 2 },
				{ id: 4, region: 'Europe', product: 'B', amount: 30, quantity: 3 },
				{ id: 5, region: 'US', product: 'A', amount: 30, quantity: 3 },
				{ id: 6, region: 'US', product: 'A', amount: 40, quantity: 4 },
				{ id: 7, region: 'US', product: 'B', amount: 40, quantity: 4 },
				{ id: 8, region: 'US', product: 'B', amount: 50, quantity: 5 },
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
					productUnits: sql<number>`cast(sum(${orders.quantity}) as int)`,
					productSales: sql<number>`cast(sum(${orders.amount}) as int)`,
				})
				.from(orders)
				.where(inArray(orders.region, db.select({ region: topRegions.region }).from(topRegions)))
				.groupBy(orders.region, orders.product)
				.orderBy(orders.region, orders.product);

			expect(result).toEqual([
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

		test('select from subquery sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(users2Table).values([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);

			const sq = db
				.select({ name: sql<string>`concat(${users2Table.name}, ' modified')`.as('name') })
				.from(users2Table)
				.as('sq');

			const res = await db.select({ name: sq.name }).from(sq);

			expect(res).toEqual([{ name: 'John modified' }, { name: 'Jane modified' }]);
		});

		test('select a field without joining its table', (ctx) => {
			const { db } = ctx.mssql;

			expect(() => db.select({ name: users2Table.name }).from(usersTable).prepare()).toThrowError();
		});

		test('select all fields from subquery without alias', (ctx) => {
			const { db } = ctx.mssql;

			const sq = db.$with('sq').as(db.select({ name: sql<string>`upper(${users2Table.name})` }).from(users2Table));

			expect(() => db.select().from(sq).prepare()).toThrowError();
		});

		test('select count()', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersTable).values([{ name: 'John' }, { name: 'Jane' }]);

			const res = await db.select({ count: sql`count(*)` }).from(usersTable);

			expect(res).toEqual([{ count: 2 }]);
		});

		test('having', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(citiesTable).values([{ id: 1, name: 'London' }, { id: 2, name: 'Paris' }, {
				id: 3,
				name: 'New York',
			}]);

			await db.insert(users2Table).values([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
				{ id: 3, name: 'Jack', cityId: 2 },
			]);

			const result = await db
				.select({
					id: citiesTable.id,
					name: sql<string>`upper(${citiesTable.name})`.as('upper_name'),
					usersCount: sql<number>`count(${users2Table.id})`.as('users_count'),
				})
				.from(citiesTable)
				.leftJoin(users2Table, eq(users2Table.cityId, citiesTable.id))
				.where(({ name }) => sql`len(${name}) >= 3`)
				.groupBy(citiesTable.id, citiesTable.name)
				.having(({ usersCount }) => sql`${usersCount} > 0`)
				.orderBy(({ name }) => name);

			expect(result).toEqual([
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

		test('view', async (ctx) => {
			const { db } = ctx.mssql;

			const newYorkers1 = mssqlView('new_yorkers')
				.as((qb) => qb.select().from(users2Table).where(eq(users2Table.cityId, 1)));

			const newYorkers2 = mssqlView('new_yorkers', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).as(sql`select * from ${users2Table} where ${eq(users2Table.cityId, 1)}`);

			const newYorkers3 = mssqlView('new_yorkers', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).existing();

			await db.execute(sql`create view new_yorkers as ${getViewConfig(newYorkers1).query}`);

			await db.insert(citiesTable).values([{ id: 1, name: 'New York' }, { id: 2, name: 'Paris' }]);

			await db.insert(users2Table).values([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 2, name: 'Jane', cityId: 1 },
				{ id: 3, name: 'Jack', cityId: 2 },
			]);

			{
				const result = await db.select().from(newYorkers1);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers2);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers3);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
				expect(result).toEqual([
					{ name: 'John' },
					{ name: 'Jane' },
				]);
			}

			await db.execute(sql`drop view ${newYorkers1}`);
		});

		test('select from raw sql', async (ctx) => {
			const { db } = ctx.mssql;

			const result = await db.select({
				id: sql<number>`id`,
				name: sql<string>`name`,
			}).from(sql`(select 1 as id, 'John' as name) as users`);

			Expect<Equal<{ id: number; name: string }[], typeof result>>;

			expect(result).toEqual([
				{ id: 1, name: 'John' },
			]);
		});

		test('select from raw sql with joins', async (ctx) => {
			const { db } = ctx.mssql;

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

			expect(result).toEqual([
				{ id: 1, name: 'John', userCity: 'New York', cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from select', async (ctx) => {
			const { db } = ctx.mssql;

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

			expect(result).toEqual([
				{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
			]);
		});

		test('join on aliased sql from with clause', async (ctx) => {
			const { db } = ctx.mssql;

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

			expect(result).toEqual([
				{ userId: 1, name: 'John', userCity: 'New York', cityId: 1, cityName: 'Paris' },
			]);
		});

		test('prefixed table', async (ctx) => {
			const { db } = ctx.mssql;

			const mssqlTable = mssqlTableCreator((name) => `myprefix_${name}`);

			const users = mssqlTable('test_prefixed_table_with_unique_name', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table myprefix_test_prefixed_table_with_unique_name (id int not null primary key, name text not null)`,
			);

			await db.insert(users).values({ id: 1, name: 'John' });

			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, name: 'John' }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('orderBy with aliased column', (ctx) => {
			const { db } = ctx.mssql;

			const query = db.select({
				test: sql`something`.as('test'),
			}).from(users2Table).orderBy((fields) => fields.test).toSQL();

			expect(query.sql).toEqual('select something as [test] from [users2] order by [test]');
		});

		test('timestamp timezone', async (ctx) => {
			const { db } = ctx.mssql;

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

		test('transaction', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_transactions', {
				id: int('id').identity().primaryKey(),
				balance: int('balance').notNull(),
			});
			const products = mssqlTable('products_transactions', {
				id: int('id').identity().primaryKey(),
				price: int('price').notNull(),
				stock: int('stock').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop table if exists ${products}`);

			await db.execute(
				sql`create table users_transactions (id int identity not null primary key, balance int not null)`,
			);
			await db.execute(
				sql`create table products_transactions (id int identity not null primary key, price int not null, stock int not null)`,
			);

			await db.insert(users).values({ balance: 100 });
			const user = await db.select().from(users).where(eq(users.id, 1)).then((rows) => rows[0]!);
			await db.insert(products).values({ price: 10, stock: 10 });
			const product = await db.select().from(products).where(eq(products.id, 1)).then((rows) => rows[0]!);

			await db.transaction(async (tx) => {
				await tx.update(users).set({ balance: user.balance - product.price }).where(eq(users.id, user.id));
				await tx.update(products).set({ stock: product.stock - 1 }).where(eq(products.id, product.id));
			});

			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, balance: 90 }]);

			await db.execute(sql`drop table ${users}`);
			await db.execute(sql`drop table ${products}`);
		});

		test('transaction rollback', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_transactions_rollback', {
				id: int('id').identity().primaryKey(),
				balance: int('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_transactions_rollback (id int identity not null primary key, balance int not null)`,
			);

			await expect((async () => {
				await db.transaction(async (tx) => {
					await tx.insert(users).values({ balance: 100 });
					tx.rollback();
				});
			})()).rejects.toThrowError(TransactionRollbackError);

			const result = await db.select().from(users);

			expect(result).toEqual([]);

			await db.execute(sql`drop table ${users}`);
		});

		test('nested transaction', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_nested_transactions', {
				id: int('id').identity().primaryKey(),
				balance: int('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_nested_transactions (id int identity not null primary key, balance int not null)`,
			);

			await db.transaction(async (tx) => {
				await tx.insert(users).values({ balance: 100 });

				await tx.transaction(async (tx) => {
					await tx.update(users).set({ balance: 200 });
				});
			});

			const result = await db.select().from(users);

			expect(result).toEqual([{ id: 1, balance: 200 }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('nested transaction rollback', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_nested_transactions_rollback', {
				id: int('id').identity().primaryKey(),
				balance: int('balance').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table users_nested_transactions_rollback (id int identity not null primary key, balance int not null)`,
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

			expect(result).toEqual([{ id: 1, balance: 100 }]);

			await db.execute(sql`drop table ${users}`);
		});

		test('join subquery with join', async (ctx) => {
			const { db } = ctx.mssql;

			const internalStaff = mssqlTable('internal_staff', {
				userId: int('user_id').notNull(),
			});

			const customUser = mssqlTable('custom_user', {
				id: int('id').notNull(),
			});

			const ticket = mssqlTable('ticket', {
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

			expect(mainQuery).toEqual([{
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

		test('subquery with view', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_subquery_view', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			});

			const newYorkers = mssqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop view if exists ${newYorkers}`);

			await db.execute(
				sql`create table ${users} (id int identity not null primary key, name text not null, city_id integer not null)`,
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

			expect(result).toEqual([
				{ id: 1, name: 'John', cityId: 1 },
				{ id: 3, name: 'Jack', cityId: 1 },
			]);

			await db.execute(sql`drop view ${newYorkers}`);
			await db.execute(sql`drop table ${users}`);
		});

		test('join view as subquery', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_join_view', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			});

			const newYorkers = mssqlView('new_yorkers').as((qb) => qb.select().from(users).where(eq(users.cityId, 1)));

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`drop view if exists ${newYorkers}`);

			await db.execute(
				sql`create table ${users} (id int identity not null primary key, name text not null, city_id integer not null)`,
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

			expect(result).toEqual([
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

		test('select iterator', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_iterator', {
				id: int('id').identity().primaryKey(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int identity not null primary key)`);

			await db.insert(users).values({});
			await db.insert(users).values({});
			await db.insert(users).values({});

			const iter = db.select().from(users).iterator();
			const result: typeof users.$inferSelect[] = [];

			for await (const row of iter) {
				result.push(row);
			}

			expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		});

		test('select iterator w/ prepared statement', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('users_iterator', {
				id: int('id').identity(1, 1).primaryKey(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int identity not null primary key)`);

			await db.insert(users).values({});
			await db.insert(users).values({});
			await db.insert(users).values({});

			const prepared = db.select().from(users).prepare();
			const iter = prepared.iterator();
			const result: typeof users.$inferSelect[] = [];

			for await (const row of iter) {
				result.push(row);
			}

			expect(result).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
		});

		test('insert undefined', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('usersForTests', {
				id: int('id').identity().primaryKey(),
				name: text('name'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int identity not null primary key, name text)`,
			);

			await expect((async () => {
				await db.insert(users).values({ name: undefined });
			})()).resolves.not.toThrowError();

			await db.execute(sql`drop table ${users}`);
		});

		test('update undefined', async (ctx) => {
			const { db } = ctx.mssql;

			const users = mssqlTable('usersForTests', {
				id: int('id').primaryKey(),
				name: text('name'),
			});

			await db.execute(sql`drop table if exists ${users}`);

			await db.execute(
				sql`create table ${users} (id int not null primary key, name text)`,
			);

			await expect((async () => {
				await db.update(users).set({ name: undefined });
			})()).rejects.toThrowError();

			await expect((async () => {
				await db.update(users).set({ id: 1, name: undefined });
			})()).resolves.not.toThrowError();

			await db.execute(sql`drop table ${users}`);
		});

		// test('utc config for datetime', async (ctx) => {
		// 	const { db } = ctx.mssql;
		//
		// 	await db.execute(sql`drop table if exists [datestable]`);
		// 	await db.execute(
		// 		sql`
		// 			create table [datestable] (
		// 				[datetime_utc] datetime,
		// 				[datetime] datetime,
		// 				[datetime_as_string] datetime
		// 			)
		// 		`,
		// 	);
		// 	const datesTable = mssqlTable('datestable', {
		// 		datetimeUTC: datetime('datetime_utc', { mode: 'date' }),
		// 		datetime: datetime('datetime'),
		// 		datetimeAsString: datetime('datetime_as_string', { mode: 'string' }),
		// 	});
		//
		// 	const dateObj = new Date('2022-11-11');
		// 	const dateUtc = new Date('2022-11-11T12:12:12.122Z');
		//
		// 	await db.insert(datesTable).values({
		// 		datetimeUTC: dateUtc,
		// 		datetime: dateObj,
		// 		datetimeAsString: '2022-11-11 12:12:12',
		// 	});
		//
		// 	const res = await db.select().from(datesTable);
		//
		// 	const rawSelect = await db.execute(sql`select [datetime_utc] from [datestable]`);
		// 	const selectedRow = rawSelect.recordset[0];
		//
		// 	expect(selectedRow.datetime_utc).toBe('2022-11-11 12:12:12.122');
		// 	expect(new Date(selectedRow.datetime_utc.replace(' ').toEqual('T') + 'Z'), dateUtc);
		//
		// 	t.assert(res[0]?.datetime instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
		// 	t.assert(res[0]?.datetimeUTC instanceof Date); // eslint-disable-line no-instanceof/no-instanceof
		// 	t.assert(typeof res[0]?.datetimeAsString === 'string');
		//
		// 	expect(res).toEqual([{
		// 		datetimeUTC: dateUtc,
		// 		datetime: new Date('2022-11-11'),
		// 		datetimeAsString: '2022-11-11 12:12:12',
		// 	}]);
		//
		// 	await db.execute(sql`drop table if exists [datestable]`);
		// });

		test('set operations (union) from query builder with subquery', async (ctx) => {
			const { db } = ctx.mssql;

			await setupSetOperationTest(db);
			const sq = db
				.select({ id: users2Table.id, name: users2Table.name })
				.from(users2Table).as('sq');

			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).union(
					db.select().from(sq),
				).orderBy(asc(citiesTable.name)).offset(0).fetch(8);

			expect(result).toHaveLength(8);

			expect(result).toEqual([
				{ id: 5, name: 'Ben' },
				{ id: 3, name: 'Jack' },
				{ id: 2, name: 'Jane' },
				{ id: 6, name: 'Jill' },
				{ id: 1, name: 'John' },
				{ id: 2, name: 'London' },
				{ id: 7, name: 'Mary' },
				{ id: 1, name: 'New York' },
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

		test('set operations (union) as function', async (ctx) => {
			const { db } = ctx.mssql;

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
			).orderBy(sql`name`);

			expect(result).toHaveLength(2);

			expect(result).toEqual([
				{ id: 1, name: 'John' },
				{ id: 1, name: 'New York' },
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

		test('set operations (union all) from query builder', async (ctx) => {
			const { db } = ctx.mssql;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).unionAll(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable),
				).orderBy(asc(citiesTable.id)).offset(1).fetch(5);

			expect(result).toHaveLength(5);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
				{ id: 2, name: 'London' },
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 3, name: 'Tampa' },
			]);

			await expect((async () => {
				db
					.select({ id: citiesTable.id, name: citiesTable.name })
					.from(citiesTable).fetch(2).unionAll(
						db
							.select({ name: citiesTable.name, id: citiesTable.id })
							.from(citiesTable).fetch(2),
					).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('set operations (union all) as function', async (ctx) => {
			const { db } = ctx.mssql;

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
			).orderBy(citiesTable.id).offset(0).fetch(1);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'John' },
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
				).orderBy(citiesTable.id).offset(0).fetch(1);
			})()).rejects.toThrowError();
		});

		test('set operations (intersect) from query builder', async (ctx) => {
			const { db } = ctx.mssql;

			await setupSetOperationTest(db);

			const result = await db
				.select({ id: citiesTable.id, name: citiesTable.name })
				.from(citiesTable).intersect(
					db
						.select({ id: citiesTable.id, name: citiesTable.name })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				);

			expect(result).toHaveLength(2);

			expect(result).toEqual([
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

		test('set operations (intersect) as function', async (ctx) => {
			const { db } = ctx.mssql;

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
			).orderBy(citiesTable.id).offset(0).fetch(1);

			expect(result).toHaveLength(0);

			expect(result).toEqual([]);

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
				).orderBy(citiesTable.id).offset(0).fetch(1);
			})()).rejects.toThrowError();
		});

		test('set operations (except) from query builder', async (ctx) => {
			const { db } = ctx.mssql;

			await setupSetOperationTest(db);

			const result = await db
				.select()
				.from(citiesTable).except(
					db
						.select()
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);
		});

		test('set operations (except) as function', async (ctx) => {
			const { db } = ctx.mssql;

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
			).orderBy(citiesTable.id).offset(0).fetch(3);

			expect(result).toHaveLength(2);

			expect(result).toEqual([
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
				).orderBy(citiesTable.id).offset(0).fetch(3);
			})()).rejects.toThrowError();
		});

		test('set operations (mixed) from query builder', async (ctx) => {
			const { db } = ctx.mssql;

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
						),
				);

			expect(result).toHaveLength(1);

			expect(result).toEqual([
				{ id: 1, name: 'New York' },
			]);

			await expect((async () => {
				db
					.select()
					.from(citiesTable).except(
						({ unionAll }) =>
							unionAll(
								db
									.select()
									.from(citiesTable).where(gt(citiesTable.id, 1)),
								db.select({ name: citiesTable.name, id: citiesTable.id })
									.from(citiesTable).where(eq(citiesTable.id, 2)),
							),
					);
			})()).rejects.toThrowError();
		});

		test('set operations (mixed all) as function with subquery', async (ctx) => {
			const { db } = ctx.mssql;

			await setupSetOperationTest(db);

			const sq = union(
				db
					.select({ id: users2Table.id, name: users2Table.name })
					.from(users2Table).where(eq(users2Table.id, 1)),
				except(
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(gte(users2Table.id, 5)),
					db
						.select({ id: users2Table.id, name: users2Table.name })
						.from(users2Table).where(eq(users2Table.id, 7)),
				),
				db
					.select().from(citiesTable).where(gt(citiesTable.id, 1)),
			).as('sq');

			const result = await db.select().from(sq).orderBy(sq.id).offset(1).fetch(4);

			expect(result).toHaveLength(4);

			expect(result).toEqual([
				{ id: 2, name: 'London' },
				{ id: 3, name: 'Tampa' },
				{ id: 5, name: 'Ben' },
				{ id: 6, name: 'Jill' },
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
							.select({ id: users2Table.id, name: users2Table.name })
							.from(users2Table).where(eq(users2Table.id, 7)),
					),
					db
						.select({ name: users2Table.name, id: users2Table.id })
						.from(citiesTable).where(gt(citiesTable.id, 1)),
				).orderBy(asc(sql`id`));
			})()).rejects.toThrowError();
		});

		test('test $onUpdateFn and $onUpdate works as $default', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
					create table ${usersOnUpdate} (
					id int identity not null primary key,
					[name] text not null,
					update_counter integer default 1 not null,
					updated_at datetime,
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

			expect(response).toEqual([
				{ name: 'John', id: 1, updateCounter: 1, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 250;

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test('test $onUpdateFn and $onUpdate works updating', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`drop table if exists ${usersOnUpdate}`);

			await db.execute(
				sql`
					create table ${usersOnUpdate} (
					id int identity not null primary key,
					[name] text not null,
					update_counter integer default 1 not null,
					updated_at datetime,
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

			await db.update(usersOnUpdate).set({ name: 'Angel' }).where(eq(usersOnUpdate.id, 1));

			const justDates = await db.select({ updatedAt }).from(usersOnUpdate);

			const response = await db.select({ ...rest }).from(usersOnUpdate);

			expect(response).toEqual([
				{ name: 'Angel', id: 1, updateCounter: 2, alwaysNull: null },
				{ name: 'Jane', id: 2, updateCounter: 1, alwaysNull: null },
				{ name: 'Jack', id: 3, updateCounter: 1, alwaysNull: null },
				{ name: 'Jill', id: 4, updateCounter: 1, alwaysNull: null },
			]);
			const msDelay = 250;

			expect(initial[0]?.updatedAt?.valueOf()).not.toEqual(justDates[0]?.updatedAt?.valueOf());

			for (const eachUser of justDates) {
				expect(eachUser.updatedAt!.valueOf()).toBeGreaterThan(Date.now() - msDelay);
			}
		});

		test('aggregate function: count', async (ctx) => {
			const { db } = ctx.mssql;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: count() }).from(table);
			const result2 = await db.select({ value: count(table.a) }).from(table);
			const result3 = await db.select({ value: countDistinct(table.name) }).from(table);

			expect(result1[0]?.value).toEqual(7);
			expect(result2[0]?.value).toEqual(5);
			expect(result3[0]?.value).toEqual(6);
		});

		test('aggregate function: avg', async (ctx) => {
			const { db } = ctx.mssql;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: avg(table.b) }).from(table);
			const result2 = await db.select({ value: avg(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: avgDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toEqual('33');
			expect(result2[0]?.value).toEqual(null);
			expect(result3[0]?.value).toEqual('42');
		});

		test('aggregate function: sum', async (ctx) => {
			const { db } = ctx.mssql;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: sum(table.b) }).from(table);
			const result2 = await db.select({ value: sum(table.nullOnly) }).from(table);
			const result3 = await db.select({ value: sumDistinct(table.b) }).from(table);

			expect(result1[0]?.value).toEqual('200');
			expect(result2[0]?.value).toEqual(null);
			expect(result3[0]?.value).toEqual('170');
		});

		test('aggregate function: max', async (ctx) => {
			const { db } = ctx.mssql;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: max(table.b) }).from(table);
			const result2 = await db.select({ value: max(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toEqual(90);
			expect(result2[0]?.value).toEqual(null);
		});

		test('aggregate function: min', async (ctx) => {
			const { db } = ctx.mssql;
			const table = aggregateTable;
			await setupAggregateFunctionsTest(db);

			const result1 = await db.select({ value: min(table.b) }).from(table);
			const result2 = await db.select({ value: min(table.nullOnly) }).from(table);

			expect(result1[0]?.value).toEqual(10);
			expect(result2[0]?.value).toEqual(null);
		});

		test('mySchema :: select all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const result = await db.select().from(usersSchemaTable);

			expect(result[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(result[0]!.createdAt.getTime() - now) < 2000);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: select sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql`upper(${usersSchemaTable.name})`,
			}).from(usersSchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select typed sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const users = await db.select({
				name: sql<string>`upper(${usersSchemaTable.name})`,
			}).from(usersSchemaTable);

			expect(users).toEqual([{ name: 'JOHN' }]);
		});

		test('mySchema :: select distinct', async (ctx) => {
			const { db } = ctx.mssql;

			const usersDistinctTable = mssqlTable('users_distinct', {
				id: int('id').notNull(),
				name: varchar('name', { length: 30 }).notNull(),
			});

			await db.execute(sql`drop table if exists ${usersDistinctTable}`);
			await db.execute(sql`create table ${usersDistinctTable} (id int, name varchar(30))`);

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

			expect(users).toEqual([{ id: 1, name: 'Jane' }, { id: 1, name: 'John' }, { id: 2, name: 'John' }]);
		});

		test('mySchema :: insert returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			const result = await db.insert(usersSchemaTable).values({ name: 'John' });

			expect(result.rowsAffected[0]).toEqual(1);
		});

		test('mySchema :: delete returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const result = await db.delete(usersSchemaTable).where(eq(usersTable.name, 'John'));

			expect(result.rowsAffected[0]).toBe(1);
		});

		test('mySchema :: update returning sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const result = await db.update(usersSchemaTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			expect(result.rowsAffected[0]).toBe(1);
		});

		test('mySchema :: update with returning all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const updatedUsers = await db.update(usersSchemaTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select().from(usersSchemaTable).where(eq(usersTable.id, 1));

			expect(updatedUsers.rowsAffected[0]).toBe(1);

			expect(users[0]!.createdAt).toBeInstanceOf(Date);
			// not timezone based timestamp, thats why it should not work here
			// t.assert(Math.abs(users[0]!.createdAt.getTime() - now) < 2000);
			expect(users).toEqual([{ id: 1, name: 'Jane', verified: false, jsonb: null, createdAt: users[0]!.createdAt }]);
		});

		test('mySchema :: update with returning partial', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const updatedUsers = await db.update(usersSchemaTable).set({ name: 'Jane' }).where(eq(usersTable.name, 'John'));

			const users = await db.select({ id: usersSchemaTable.id, name: usersTable.name }).from(usersSchemaTable).where(
				eq(usersSchemaTable.id, 1),
			);

			expect(updatedUsers.rowsAffected[0]).toBe(1);

			expect(users).toEqual([{ id: 1, name: 'Jane' }]);
		});

		test('mySchema :: delete with returning all fields', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersSchemaTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser.rowsAffected[0]).toBe(1);
		});

		test('mySchema :: delete with returning partial', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const deletedUser = await db.delete(usersSchemaTable).where(eq(usersTable.name, 'John'));

			expect(deletedUser.rowsAffected[0]).toBe(1);
		});

		test('mySchema :: insert + select', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const result = await db.select().from(usersSchemaTable);
			expect(result).toEqual([{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result[0]!.createdAt }]);

			await db.insert(usersSchemaTable).values({ name: 'Jane' });
			const result2 = await db.select().from(usersSchemaTable);
			expect(result2).toEqual([
				{ id: 1, name: 'John', verified: false, jsonb: null, createdAt: result2[0]!.createdAt },
				{ id: 2, name: 'Jane', verified: false, jsonb: null, createdAt: result2[1]!.createdAt },
			]);
		});

		test('mySchema :: json insert', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John', jsonb: ['foo', 'bar'] });
			const result = await db.select({
				id: usersSchemaTable.id,
				name: usersSchemaTable.name,
				jsonb: usersSchemaTable.jsonb,
			}).from(usersSchemaTable);

			expect(result).toEqual([{ id: 1, name: 'John', jsonb: ['foo', 'bar'] }]);
		});

		test('mySchema :: insert with overridden default values', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John', verified: true });
			const result = await db.select().from(usersSchemaTable);

			expect(result).toEqual([{ id: 1, name: 'John', verified: true, jsonb: null, createdAt: result[0]!.createdAt }]);
		});

		test('mySchema :: insert many', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);
			const result = await db.select({
				id: usersSchemaTable.id,
				name: usersSchemaTable.name,
				jsonb: usersSchemaTable.jsonb,
				verified: usersSchemaTable.verified,
			}).from(usersSchemaTable);

			expect(result).toEqual([
				{ id: 1, name: 'John', jsonb: null, verified: false },
				{ id: 2, name: 'Bruce', jsonb: ['foo', 'bar'], verified: false },
				{ id: 3, name: 'Jane', jsonb: null, verified: false },
				{ id: 4, name: 'Austin', jsonb: null, verified: true },
			]);
		});

		test('mySchema :: insert many with returning', async (ctx) => {
			const { db } = ctx.mssql;

			const result = await db.insert(usersSchemaTable).values([
				{ name: 'John' },
				{ name: 'Bruce', jsonb: ['foo', 'bar'] },
				{ name: 'Jane' },
				{ name: 'Austin', verified: true },
			]);

			expect(result.rowsAffected[0]).toBe(4);
		});

		test('mySchema :: select with group by as field', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(usersSchemaTable.name);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('mySchema :: select with group by as sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(sql`${usersSchemaTable.name}`);

			expect(result).toEqual([{ name: 'Jane' }, { name: 'John' }]);
		});

		test('mySchema :: select with group by as sql + column', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(sql`${usersSchemaTable.name}`, usersSchemaTable.id);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('mySchema :: select with group by as column + sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(usersSchemaTable.id, sql`${usersSchemaTable.name}`);

			expect(result).toEqual([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);
		});

		test('mySchema :: select with group by complex query', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values([{ name: 'John' }, { name: 'Jane' }, { name: 'Jane' }]);

			const result = await db.select({ name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(usersSchemaTable.id, sql`${usersSchemaTable.name}`)
				.orderBy(asc(usersSchemaTable.name))
				.offset(0)
				.fetch(1);

			expect(result).toEqual([{ name: 'Jane' }]);
		});

		test('mySchema :: build query', async (ctx) => {
			const { db } = ctx.mssql;

			const query = db.select({ id: usersSchemaTable.id, name: usersSchemaTable.name }).from(usersSchemaTable)
				.groupBy(usersSchemaTable.id, usersSchemaTable.name)
				.toSQL();

			expect(query).toEqual({
				sql: `select [id], [name] from [mySchema].[userstest] group by [userstest].[id], [userstest].[name]`,
				params: [],
			});
		});

		test('mySchema :: insert sql', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: sql`${'John'}` });
			const result = await db.select({ id: usersSchemaTable.id, name: usersSchemaTable.name }).from(usersSchemaTable);
			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('mySchema :: partial join with alias', async (ctx) => {
			const { db } = ctx.mssql;
			const customerAlias = alias(usersSchemaTable, 'customer');

			await db.insert(usersSchemaTable).values([{ name: 'Ivan' }, { name: 'Hans' }]);
			const result = await db
				.select({
					user: {
						id: usersSchemaTable.id,
						name: usersSchemaTable.name,
					},
					customer: {
						id: customerAlias.id,
						name: customerAlias.name,
					},
				}).from(usersSchemaTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 2))
				.where(eq(usersSchemaTable.id, 1));

			expect(result).toEqual([{
				user: { id: 1, name: 'Ivan' },
				customer: { id: 2, name: 'Hans' },
			}]);
		});

		test('mySchema :: full join with alias', async (ctx) => {
			const { db } = ctx.mssql;

			const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

			const users = mysqlTable('users', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select().from(users)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(users.id, 10));

			expect(result).toEqual([{
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

		test('mySchema :: select from alias', async (ctx) => {
			const { db } = ctx.mssql;

			const mysqlTable = mssqlTableCreator((name) => `prefixed_${name}`);

			const users = mysqlTable('users', {
				id: int('id').primaryKey(),
				name: text('name').notNull(),
			});

			await db.execute(sql`drop table if exists ${users}`);
			await db.execute(sql`create table ${users} (id int primary key, name text not null)`);

			const user = alias(users, 'user');
			const customers = alias(users, 'customer');

			await db.insert(users).values([{ id: 10, name: 'Ivan' }, { id: 11, name: 'Hans' }]);
			const result = await db
				.select()
				.from(user)
				.leftJoin(customers, eq(customers.id, 11))
				.where(eq(user.id, 10));

			expect(result).toEqual([{
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

		test('mySchema :: insert with spaces', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: sql`'Jo   h     n'` });
			const result = await db.select({ id: usersSchemaTable.id, name: usersSchemaTable.name }).from(usersSchemaTable);

			expect(result).toEqual([{ id: 1, name: 'Jo   h     n' }]);
		});

		test('mySchema :: prepared statement', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const statement = db.select({
				id: usersSchemaTable.id,
				name: usersSchemaTable.name,
			}).from(usersSchemaTable)
				.prepare();
			const result = await statement.execute();

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('mySchema :: prepared statement reuse', async (ctx) => {
			const { db } = ctx.mssql;

			const stmt = db.insert(usersSchemaTable).values({
				verified: true,
				name: sql.placeholder('name'),
			}).prepare();

			for (let i = 0; i < 10; i++) {
				await stmt.execute({ name: `John ${i}` });
			}

			const result = await db.select({
				id: usersSchemaTable.id,
				name: usersSchemaTable.name,
				verified: usersSchemaTable.verified,
			}).from(usersSchemaTable);

			expect(result).toEqual([
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

		test('mySchema :: prepared statement with placeholder in .where', async (ctx) => {
			const { db } = ctx.mssql;

			await db.insert(usersSchemaTable).values({ name: 'John' });
			const stmt = db.select({
				id: usersSchemaTable.id,
				name: usersSchemaTable.name,
			}).from(usersSchemaTable)
				.where(eq(usersSchemaTable.id, sql.placeholder('id')))
				.prepare();
			const result = await stmt.execute({ id: 1 });

			expect(result).toEqual([{ id: 1, name: 'John' }]);
		});

		test('mySchema :: insert via db.execute + select via db.execute', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`insert into ${usersSchemaTable} (${new Name(usersTable.name.name)}) values (${'John'})`);

			const result = await db.execute<{ id: number; name: string }>(sql`select id, name from ${usersSchemaTable}`);
			expect(result.recordset).toEqual([{ id: 1, name: 'John' }]);
		});

		test('mySchema :: insert via db.execute w/ query builder', async (ctx) => {
			const { db } = ctx.mssql;

			const inserted = await db.execute(
				db.insert(usersSchemaTable).values({ name: 'John' }),
			);
			expect(inserted.rowsAffected[0]).toBe(1);
		});

		test('mySchema :: select from tables with same name from different schema using alias', async (ctx) => {
			const { db } = ctx.mssql;
			await db.execute(sql`drop table if exists [userstest]`);
			await db.execute(
				sql`
					create table [userstest] (
						[id] int identity primary key,
						[name] varchar(100) not null,
						[verified] bit not null default 0,
						[jsonb] nvarchar(100),
						[created_at] datetime2(2) not null default current_timestamp
					)
				`,
			);

			await db.insert(usersSchemaTable).values({ name: 'Ivan' });
			await db.insert(usersTable).values({ name: 'Hans' });

			const customerAlias = alias(usersTable, 'customer');

			const result = await db
				.select().from(usersSchemaTable)
				.leftJoin(customerAlias, eq(customerAlias.id, 1))
				.where(eq(usersSchemaTable.id, 1));

			expect(result).toEqual([{
				userstest: {
					id: 1,
					name: 'Ivan',
					verified: false,
					jsonb: null,
					createdAt: result[0]?.userstest.createdAt,
				},
				customer: {
					id: 1,
					name: 'Hans',
					verified: false,
					jsonb: null,
					createdAt: result[0]?.customer!.createdAt,
				},
			}]);
		});

		test('mySchema :: Mysql enum test case #1', async (ctx) => {
			const { db } = ctx.mssql;

			await db.execute(sql`
				create table ${tableWithEnums} (
					[id] int primary key,
					[enum1] varchar not null,
					[enum2] varchar default 'a',
					[enum3] varchar not null default 'b'
				)
			`);

			await db.insert(tableWithEnums).values([
				{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
				{ id: 2, enum1: 'a', enum3: 'c' },
				{ id: 3, enum1: 'a' },
			]);

			const res = await db.select().from(tableWithEnums);

			await db.execute(sql`drop table ${tableWithEnums}`);

			expect(res).toEqual([
				{ id: 1, enum1: 'a', enum2: 'b', enum3: 'c' },
				{ id: 2, enum1: 'a', enum2: 'a', enum3: 'c' },
				{ id: 3, enum1: 'a', enum2: 'a', enum3: 'b' },
			]);
		});

		test('mySchema :: view', async (ctx) => {
			const { db } = ctx.mssql;

			const newYorkers1 = mySchema.view('new_yorkers')
				.as((qb) => qb.select().from(users2SchemaTable).where(eq(users2Table.cityId, 1)));

			const newYorkers2 = mySchema.view('new_yorkers', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).as(sql`select * from ${users2SchemaTable} where ${eq(users2Table.cityId, 1)}`);

			const newYorkers3 = mySchema.view('new_yorkers', {
				id: int('id').identity().primaryKey(),
				name: text('name').notNull(),
				cityId: int('city_id').notNull(),
			}).existing();

			await db.execute(sql`create view ${newYorkers1} as ${getViewConfig(newYorkers1).query}`);

			await db.insert(citiesSchemaTable).values([{ name: 'New York' }, { name: 'Paris' }]);

			await db.insert(users2SchemaTable).values([
				{ name: 'John', cityId: 1 },
				{ name: 'Jane', cityId: 1 },
				{ name: 'Jack', cityId: 2 },
			]);

			{
				const result = await db.select().from(newYorkers1);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers2);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select().from(newYorkers3);
				expect(result).toEqual([
					{ id: 1, name: 'John', cityId: 1 },
					{ id: 2, name: 'Jane', cityId: 1 },
				]);
			}

			{
				const result = await db.select({ name: newYorkers1.name }).from(newYorkers1);
				expect(result).toEqual([
					{ name: 'John' },
					{ name: 'Jane' },
				]);
			}

			await db.execute(sql`drop view ${newYorkers1}`);
		});
	});
}
