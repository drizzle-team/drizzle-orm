import { SQL, sql } from 'drizzle-orm';
import {
	AnyMsSqlColumn,
	bigint,
	binary,
	bit,
	char,
	check,
	date,
	datetime,
	datetime2,
	datetimeoffset,
	decimal,
	float,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlView,
	nchar,
	ntext,
	numeric,
	nvarchar,
	real,
	smallint,
	text,
	time,
	tinyint,
	uniqueIndex,
	varbinary,
	varchar,
} from 'drizzle-orm/mssql-core';
import fs from 'fs';
import { fromDatabaseForDrizzle } from 'src/dialects/mssql/introspect';
import type { DB } from 'src/utils';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from 'tests/mssql/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}

if (!fs.existsSync('tests/mssql/tmp')) {
	fs.mkdirSync(`tests/mssql/tmp`, { recursive: true });
}

let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('basic introspect test', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').notNull(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity always test', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity({ increment: 1, seed: 2 }),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-identity-always-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity by default test', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity({ increment: 1, seed: 2 }),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-identity-default-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic index test', async () => {
	const schema = {
		users: mssqlTable('users', {
			firstName: nvarchar('first_name', { length: 244 }),
			lastName: nvarchar('last_name', { length: 244 }),
			data: nvarchar('data', { mode: 'json' }),
		}, (table) => [
			index('single_column').on(table.firstName),
			index('multi_column').on(table.firstName, table.lastName),
		]),
	};

	const { sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-index-introspect',
	);

	expect(sqlStatements).toStrictEqual([]);
});

test('identity always test: few params', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity({
				seed: 100,
				increment: 1,
			}),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'identity-always-few-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity by default test: few params', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity({
				seed: 10000,
				increment: 1,
			}),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'identity-default-few-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity always test: all params', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'identity-always-all-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity by default test: all params', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'identity-default-all-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('generated column: link to another column', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id').identity(),
			email: varchar({ length: 255 }),
			generatedEmail: varchar('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`[email]`,
			),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'generated-link-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect all column types', async () => {
	const schema = {
		columns: mssqlTable('columns', {
			bigint: bigint({ mode: 'number' }).default(1),
			bigint1: bigint({ mode: 'bigint' }).default(BigInt(1)),
			bigint2: bigint({ mode: 'string' }).default('1'),

			binary: binary({ length: 123 }).default(Buffer.from('hello, world')),

			bit: bit().default(false),
			bit1: bit().default(true),

			char: char({ length: 2 }).default('1'),
			nChar: nchar({ length: 2 }).default('1'),

			date: date({ mode: 'date' }).default(new Date()),
			date1: date({ mode: 'string' }).default('2023-05-05'),
			date2: date({ mode: 'string' }).defaultGetDate(),

			datetime: datetime({ mode: 'date' }).default(new Date()),
			datetime1: datetime({ mode: 'string' }).default('2023-05-05'),
			datetime12: datetime({ mode: 'string' }).defaultGetDate(),

			datetime2: datetime2({ mode: 'date' }).default(new Date()),
			datetime21: datetime2({ mode: 'string' }).default('2023-05-05'),
			datetime22: datetime2({ mode: 'string' }).defaultGetDate(),

			datetimeoffset: datetimeoffset({ mode: 'date' }).default(new Date()),
			datetimeoffset1: datetimeoffset({ mode: 'string' }).default('2023-05-05'),
			datetimeoffset2: datetimeoffset({ mode: 'string' }).defaultGetDate(),

			decimal: decimal({ precision: 3, scale: 1 }).default('32.1'),

			float: float({ precision: 3 }).default(32.1),

			int: int().default(32),

			numeric: numeric({ precision: 3, scale: 1 }).default('32.1'),

			real: real().default(32.4),

			smallint: smallint().default(3),

			text: text().default('hey'),
			nText: ntext().default('hey'),

			time: time({ mode: 'date', precision: 2 }).default(new Date()),
			time1: time({ mode: 'string', precision: 2 }).default('14:53:00.000'),

			tinyint: tinyint().default(123),

			varbinary: varbinary({ length: 213 }).default(Buffer.from('hey')),

			varchar: varchar({ length: 213 }).default('hey'),
			nvarchar: nvarchar({ length: 213 }).default('hey'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-all-columns-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect columns with name with non-alphanumeric characters', async () => {
	const schema = {
		users: mssqlTable('users', {
			'not:allowed': int('not:allowed'),
			'nuh--uh': int('nuh-uh'),
			'1_nope': int('1_nope'),
			valid: int('valid'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-column-with-name-with-non-alphanumeric-characters',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect strings with single quotes', async () => {
	const schema = {
		columns: mssqlTable('columns', {
			text: text('text').default('escape\'s quotes " '),
			varchar: varchar('varchar').default('escape\'s quotes " '),
			ntext: ntext('ntext').default('escape\'s quotes " '),
			nvarchar: nvarchar('nvarchar').default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-strings-with-single-quotes',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks', async () => {
	const schema = {
		users: mssqlTable('users', {
			id: int('id'),
			name: varchar('name'),
			age: int('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-checks',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks from different schemas with same names', async () => {
	const mySchema = mssqlSchema('schema2');
	const schema = {
		mySchema,
		users: mssqlTable('users', {
			id: int('id'),
			age: int('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
		usersInMySchema: mySchema.table('users', {
			id: int('id'),
			age: int('age'),
		}, (table) => [check('some_check', sql`${table.age} < 1`)]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-checks-diff-schema-same-names',
		['dbo', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view #1', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = mssqlView('some_view').as((qb) => qb.select().from(users));
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-view',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view #2', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = mssqlView('some_view', { id: int('asd') }).with({ checkOption: true }).as(
		sql`SELECT * FROM ${users}`,
	);
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-view-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect primary key with unqiue', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: varchar('users'),
	}, (t) => [
		index('some_name').on(t.name),
		uniqueIndex('some_name1').on(t.name),
	]);

	const schema = {
		users,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-pk',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect fk with onUpdate, onDelete set', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: varchar('users'),
	});

	const schema = {
		users,
		posts: mssqlTable('posts', {
			id: int(),
			usersId: int().references(() => users.id, { onDelete: 'cascade', onUpdate: 'no action' }),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-fk',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect table with self reference', async () => {
	const table1 = mssqlTable('table1', {
		column1: int().primaryKey(),
		column2: int().references((): AnyMsSqlColumn => table1.column1),
	});

	const schema = { table1 };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-table-with-self-ref');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('introspect empty db', async () => {
	const { introspectDDL } = await diffIntrospect(
		db,
		{},
		'introspect-empty-db',
	);

	expect(introspectDDL.entities.list().length).toBe(0);
});

test('indexes #2', async () => {
	const table1 = mssqlTable('table1', {
		col1: int(),
		col2: int(),
	}, () => [
		index1,
		index2,
		index3,
		index4,
		index5,
		index6,
	]);

	const index1 = uniqueIndex('index1').on(table1.col1);
	const index2 = uniqueIndex('index2').on(table1.col1, table1.col2);
	const index3 = index('index3').on(table1.col1);
	const index4 = index('index4').on(table1.col1, table1.col2);
	const index5 = index('index5').on(sql`${table1.col1} asc`);
	const index6 = index('index6').on(sql`${table1.col1} asc`, sql`${table1.col2} desc`);

	const schema = { table1 };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'sql-in-index');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5053
test('single quote default', async () => {
	const group = mssqlTable('group', {
		id: text().notNull(),
		fk_organizaton_group: text().notNull(),
		saml_identifier: text().default('').notNull(),
		display_name: text().default('').notNull(),
	});

	const { sqlStatements } = await diffIntrospect(
		db,
		{ group },
		'single_quote_default',
	);

	expect(sqlStatements).toStrictEqual([]);
});

// other tables in migration schema
test('pull after migrate with custom migrations table #1', async () => {
	await db.query(`CREATE SCHEMA drizzle;`);
	await db.query(`
		CREATE TABLE drizzle.__drizzle_migrations (
			id INTEGER CONSTRAINT custom_migrations_pkey PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME
		);
	`);
	await db.query(`
		CREATE TABLE drizzle.users (
			id INTEGER CONSTRAINT users_pkey PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const { pks, columns, tables, schemas } = await fromDatabaseForDrizzle(
		db,
		() => true,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect([...schemas, ...tables, ...pks]).toStrictEqual([
		{
			entityType: 'schemas',
			name: 'drizzle',
		},
		{
			entityType: 'tables',

			name: 'users',
			schema: 'drizzle',
		},
		{
			columns: [
				'id',
			],
			entityType: 'pks',
			name: 'users_pkey',
			nameExplicit: true,
			schema: 'drizzle',
			table: 'users',
		},
	]);
});

// no tables in migration schema
test('pull after migrate with custom migrations table #2', async () => {
	await db.query(`CREATE SCHEMA drizzle;`);
	await db.query(`
		CREATE TABLE drizzle.__drizzle_migrations (
			id INTEGER CONSTRAINT custom_migrations_pkey PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME
		);
	`);
	await db.query(`
		CREATE TABLE dbo.users (
			id INTEGER CONSTRAINT users_pkey PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const { schemas, tables, pks } = await fromDatabaseForDrizzle(
		db,
		() => true,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect([...schemas, ...tables, ...pks]).toStrictEqual([
		{
			entityType: 'tables',

			name: 'users',
			schema: 'dbo',
		},
		{
			columns: [
				'id',
			],
			entityType: 'pks',
			name: 'users_pkey',
			nameExplicit: true,
			schema: 'dbo',
			table: 'users',
		},
	]);
});

// other tables in custom migration schema
test('pull after migrate with custom migrations table #3', async () => {
	await db.query(`CREATE SCHEMA [custom];`);
	await db.query(`
		CREATE TABLE [custom].[custom_migrations] (
			id INTEGER CONSTRAINT custom_migrations_pkey PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at DATETIME
		);
	`);
	await db.query(`
		CREATE TABLE [custom].[users] (
			id INTEGER CONSTRAINT users_pkey PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);
	await db.query(`
		CREATE TABLE [users] (
			id INTEGER CONSTRAINT users_pkey PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const { schemas, tables, pks } = await fromDatabaseForDrizzle(
		db,
		() => true,
		() => {},
		{
			table: 'custom_migrations',
			schema: 'custom',
		},
	);

	expect([...schemas, ...tables, ...pks]).toStrictEqual([
		{
			entityType: 'schemas',
			name: 'custom',
		},
		{
			entityType: 'tables',
			name: 'users',
			schema: 'custom',
		},
		{
			entityType: 'tables',
			name: 'users',
			schema: 'dbo',
		},
		{
			columns: [
				'id',
			],
			entityType: 'pks',
			name: 'users_pkey',
			nameExplicit: true,
			schema: 'custom',
			table: 'users',
		},
		{
			columns: [
				'id',
			],
			entityType: 'pks',
			name: 'users_pkey',
			nameExplicit: true,
			schema: 'dbo',
			table: 'users',
		},
	]);
});
