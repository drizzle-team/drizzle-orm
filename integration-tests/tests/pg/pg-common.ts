import Docker from 'dockerode';
import { sql } from 'drizzle-orm';
import type { PgDatabase, QueryResultHKT } from 'drizzle-orm/pg-core';
import {
	boolean,
	char,
	cidr,
	foreignKey,
	getTableConfig,
	inet,
	integer,
	jsonb,
	macaddr,
	macaddr8,
	pgTable,
	serial,
	text,
	timestamp,
	unique,
	uniqueKeyName,
} from 'drizzle-orm/pg-core';
import getPort from 'get-port';
import { v4 as uuidV4 } from 'uuid';
import { afterAll, beforeEach, describe, expect, test } from 'vitest';

declare module 'vitest' {
	interface TestContext {
		pg: {
			db: PgDatabase<QueryResultHKT>;
		};
	}
}

const usersTable = pgTable('users', {
	id: serial('id' as string).primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	jsonb: jsonb('jsonb').$type<string[]>(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

const usersOnUpdate = pgTable('users_on_update', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	updateCounter: integer('update_counter').default(sql`1`).$onUpdateFn(() => sql`update_counter + 1`),
	updatedAt: timestamp('updated_at', { mode: 'date', precision: 3 }).$onUpdate(() => new Date()),
	alwaysNull: text('always_null').$type<string | null>().$onUpdate(() => null),
	// uppercaseName: text('uppercase_name').$onUpdateFn(() => sql`upper(name)`), looks like this is not supported in pg
});

const citiesTable = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

const cities2Table = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const users2Table = pgTable('users2', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => citiesTable.id),
});

const coursesTable = pgTable('courses', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	categoryId: integer('category_id').references(() => courseCategoriesTable.id),
});

const courseCategoriesTable = pgTable('course_categories', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

const orders = pgTable('orders', {
	id: serial('id').primaryKey(),
	region: text('region').notNull(),
	product: text('product').notNull().$default(() => 'random_string'),
	amount: integer('amount').notNull(),
	quantity: integer('quantity').notNull(),
});

const network = pgTable('network_table', {
	inet: inet('inet').notNull(),
	cidr: cidr('cidr').notNull(),
	macaddr: macaddr('macaddr').notNull(),
	macaddr8: macaddr8('macaddr8').notNull(),
});

const salEmp = pgTable('sal_emp', {
	name: text('name'),
	payByQuarter: integer('pay_by_quarter').array(),
	schedule: text('schedule').array().array(),
});

const _tictactoe = pgTable('tictactoe', {
	squares: integer('squares').array(3).array(3),
});

const usersMigratorTable = pgTable('users12', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
});

// To test aggregate functions
const aggregateTable = pgTable('aggregate_table', {
	id: serial('id').notNull(),
	name: text('name').notNull(),
	a: integer('a'),
	b: integer('b'),
	c: integer('c'),
	nullOnly: integer('null_only'),
});

let pgContainer: Docker.Container;

export async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 5432 });
	const image = 'postgres:14';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => (err ? reject(err) : resolve(err)))
	);

	pgContainer = await docker.createContainer({
		Image: image,
		Env: ['POSTGRES_PASSWORD=postgres', 'POSTGRES_USER=postgres', 'POSTGRES_DB=postgres'],
		name: `drizzle-integration-tests-${uuidV4()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'5432/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await pgContainer.start();

	return `postgres://postgres:postgres@localhost:${port}/postgres`;
}

afterAll(async () => {
	await pgContainer?.stop().catch(console.error);
});

export function tests() {
	describe('common', () => {
		beforeEach(async (ctx) => {
			const { db } = ctx.pg;
			await db.execute(sql`drop schema public cascade`);
			await db.execute(sql`create schema public`);
			await db.execute(
				sql`
					create table users (
						id serial primary key,
						name text not null,
						verified boolean not null default false, 
						jsonb jsonb,
						created_at timestamptz not null default now()
					)
				`,
			);
			await db.execute(
				sql`
					create table cities (
						id serial primary key,
						name text not null,
						state char(2)
					)
				`,
			);
			await db.execute(
				sql`
					create table users2 (
						id serial primary key,
						name text not null,
						city_id integer references cities(id)
					)
				`,
			);
			await db.execute(
				sql`
					create table course_categories (
						id serial primary key,
						name text not null
					)
				`,
			);
			await db.execute(
				sql`
					create table courses (
						id serial primary key,
						name text not null,
						category_id integer references course_categories(id)
					)
				`,
			);
			await db.execute(
				sql`
					create table orders (
						id serial primary key,
						region text not null,
						product text not null,
						amount integer not null,
						quantity integer not null
					)
				`,
			);
			await db.execute(
				sql`
					create table network_table (
						inet inet not null,
						cidr cidr not null,
						macaddr macaddr not null,
						macaddr8 macaddr8 not null
					)
				`,
			);
			await db.execute(
				sql`
					create table sal_emp (
						name text not null,
						pay_by_quarter integer[] not null,
						schedule text[][] not null
					)
				`,
			);
			await db.execute(
				sql`
					create table tictactoe (
						squares integer[3][3] not null
					)
				`,
			);
		});

		async function setupSetOperationTest(db: PgDatabase<QueryResultHKT>) {
			await db.execute(sql`drop table if exists users2`);
			await db.execute(sql`drop table if exists cities`);
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
						city_id integer references cities(id)
					)
				`,
			);

			await db.insert(cities2Table).values([
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

		async function setupAggregateFunctionsTest(db: PgDatabase<QueryResultHKT>) {
			await db.execute(sql`drop table if exists "aggregate_table"`);
			await db.execute(
				sql`
					create table "aggregate_table" (
						"id" serial not null,
						"name" text not null,
						"a" integer,
						"b" integer,
						"c" integer,
						"null_only" integer
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

		test('table configs: unique third param', async () => {
			const cities1Table = pgTable('cities1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: char('state', { length: 2 }),
			}, (t) => ({
				f: unique('custom_name').on(t.name, t.state).nullsNotDistinct(),
				f1: unique('custom_name1').on(t.name, t.state),
			}));

			const tableConfig = getTableConfig(cities1Table);

			expect(tableConfig.uniqueConstraints).toHaveLength(2);

			expect(tableConfig.uniqueConstraints[0]?.name).toBe('custom_name');
			expect(tableConfig.uniqueConstraints[0]?.nullsNotDistinct).toBe(true);
			expect(tableConfig.uniqueConstraints[0]?.columns.map((t) => t.name)).toEqual(['name', 'state']);

			expect(tableConfig.uniqueConstraints[1]?.name).toBe('custom_name1');
			expect(tableConfig.uniqueConstraints[1]?.nullsNotDistinct).toBe(false);
			expect(tableConfig.uniqueConstraints[1]?.columns.map((t) => t.name)).toEqual(['name', 'state']);
		});

		test('table configs: unique in column', async () => {
			const cities1Table = pgTable('cities1', {
				id: serial('id').primaryKey(),
				name: text('name').notNull().unique(),
				state: char('state', { length: 2 }).unique('custom'),
				field: char('field', { length: 2 }).unique('custom_field', { nulls: 'not distinct' }),
			});

			const tableConfig = getTableConfig(cities1Table);

			const columnName = tableConfig.columns.find((it) => it.name === 'name');

			expect(columnName?.uniqueName).toBe(uniqueKeyName(cities1Table, [columnName!.name]));
			expect(columnName?.isUnique).toBe(true);

			const columnState = tableConfig.columns.find((it) => it.name === 'state');
			expect(columnState?.uniqueName).toBe('custom');
			expect(columnState?.isUnique).toBe(true);

			const columnField = tableConfig.columns.find((it) => it.name === 'field');
			expect(columnField?.uniqueName).toBe('custom_field');
			expect(columnField?.isUnique).toBe(true);
			expect(columnField?.uniqueType).toBe('not distinct');
		});

		test('table config: foreign keys name', async () => {
			const table = pgTable('cities', {
				id: serial('id').primaryKey(),
				name: text('name').notNull(),
				state: text('state'),
			}, (t) => ({
				f: foreignKey({ foreignColumns: [t.id], columns: [t.id], name: 'custom_fk' }),
			}));

			const tableConfig = getTableConfig(table);

			expect(tableConfig.foreignKeys).toHaveLength(1);
			expect(tableConfig.foreignKeys[0]!.getName()).toBe('custom_fk');
		});
	});
}
