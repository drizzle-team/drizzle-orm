import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	bit,
	char,
	check,
	date,
	datetime,
	datetime2,
	datetimeOffset,
	decimal,
	float,
	index,
	int,
	mssqlSchema,
	mssqlTable,
	mssqlView,
	nchar,
	nText,
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
import { DB } from 'src/utils';
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

			datetime: datetime({ mode: 'date' }).default(new Date()),
			datetime1: datetime({ mode: 'string' }).default('2023-05-05'),

			datetime2: datetime2({ mode: 'date' }).default(new Date()),
			datetime2_1: datetime2({ mode: 'string' }).default('2023-05-05'),

			datetimeOffset: datetimeOffset({ mode: 'date' }).default(new Date()),
			datetimeOffset1: datetimeOffset({ mode: 'string' }).default('2023-05-05'),

			decimal: decimal({ precision: 3, scale: 1 }).default(32.1),

			float: float({ precision: 3 }).default(32.1),

			int: int().default(32),

			numeric: numeric({ precision: 3, scale: 1 }).default(32.1),

			real: real().default(32.4),

			smallint: smallint().default(3),

			text: text().default('hey'),
			nText: nText().default('hey'),

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
			ntext: nText('ntext').default('escape\'s quotes " '),
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

test('introspect primary key with unqiue', async () => {
	const users = mssqlTable('users', {
		id: int('id').primaryKey(),
		name: bigint('users', { mode: 'bigint' }).default(BigInt(2 ** 64)),
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
