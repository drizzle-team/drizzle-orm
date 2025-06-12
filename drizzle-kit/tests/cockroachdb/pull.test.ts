import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	boolean,
	char,
	check,
	cockroachEnum,
	cockroachMaterializedView,
	cockroachPolicy,
	cockroachRole,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	date,
	doublePrecision,
	index,
	inet,
	int4,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/cockroach-core';
import fs from 'fs';
import { DB } from 'src/utils';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from 'tests/cockroachdb/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}

if (!fs.existsSync('tests/cockroachdb/tmp')) {
	fs.mkdirSync(`tests/cockroachdb/tmp`, { recursive: true });
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
		users: cockroachTable('users', {
			id: int4('id').notNull(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity always test', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').generatedAlwaysAsIdentity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-identity-always-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity by default test', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').generatedByDefaultAsIdentity(),
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
		users: cockroachTable('users', {
			firstName: text('first_name'),
			lastName: text('last_name'),
			data: jsonb('data'),
		}, (table) => [
			index('single_column').on(table.firstName),
			index('multi_column').on(table.firstName, table.lastName),
			index('single_expression').on(sql`lower(${table.firstName})`),
			index('multi_expression').on(sql`lower(${table.firstName})`, sql`lower(${table.lastName})`),
			index('expression_with_comma').on(
				sql`(lower(${table.firstName}) || ', '::text || lower(${table.lastName}))`,
			),
			index('expression_with_double_quote').on(sql`('"'::text || ${table.firstName})`),
			index('expression_with_jsonb_operator').on(
				sql`(${table.data} #>> '{a,b,1}'::text[])`,
			),
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
		users: cockroachTable('users', {
			id: int4('id').generatedAlwaysAsIdentity({
				startWith: 100,
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
		users: cockroachTable('users', {
			id: int4('id').generatedByDefaultAsIdentity({
				maxValue: 10000,
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
		users: cockroachTable('users', {
			id: int4('id').generatedAlwaysAsIdentity({
				startWith: 10,
				increment: 4,
				minValue: 10,
				maxValue: 10000,
				cache: 100,
			}),
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
		users: cockroachTable('users', {
			id: int4('id').generatedByDefaultAsIdentity({
				startWith: 10,
				increment: 4,
				minValue: 10,
				maxValue: 10000,
				cache: 100,
			}),
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
		users: cockroachTable('users', {
			id: int4('id').generatedAlwaysAsIdentity(),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`email`,
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

// defaults mismatch
test.todo('introspect all column types', async () => {
	const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		columns: cockroachTable('columns', {
			enum: myEnum('my_enum').default('a'),
			smallint: smallint('smallint').default(10),
			int4: int4('int4').default(10),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).default('99.9'),
			numeric2: numeric('numeric2', { precision: 1, scale: 1 }).default('0.9'),
			numeric3: numeric('numeric3').default('99.9'),
			bigint: bigint('bigint', { mode: 'number' }).default(100),
			boolean: boolean('boolean').default(true),
			text: text('test').default('abc'),
			varchar: varchar('varchar', { length: 25 }).default('abc'),
			char: char('char', { length: 3 }).default('abc'),
			doublePrecision: doublePrecision('doublePrecision').default(100),
			real: real('real').default(100),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default({ attr: 'value' }),
			time1: time('time1').default('00:00:00'),
			timestamp1: timestamp('timestamp1', { withTimezone: true, precision: 6 }).default(new Date()),
			timestamp2: timestamp('timestamp2', { withTimezone: true, precision: 6 }).defaultNow(),
			timestamp3: timestamp('timestamp3', { withTimezone: true, precision: 6 }).default(
				sql`timezone('utc'::text, now())`,
			),
			date1: date('date1').default('2024-01-01'),
			date2: date('date2').defaultNow(),
			date3: date('date3').default(sql`current_timestamp`),
			uuid1: uuid('uuid1').default('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
			uuid2: uuid('uuid2').defaultRandom(),
			inet: inet('inet').default('127.0.0.1'),
			interval: interval('interval').default('1 day 01:00:00'),
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

test('introspect all column array types', async () => {
	const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		// TODO test extensions
		columns: cockroachTable('columns', {
			enum: myEnum('my_enum').array().default(['a', 'b']),
			smallint: smallint('smallint').array().default([10, 20]),
			int4: int4('int4').array().default([10, 20]),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).array().default(['99.9', '88.8']),
			bigint: bigint('bigint', { mode: 'number' }).array().default([100, 200]),
			boolean: boolean('boolean').array().default([true, false]),
			text: text('test').array().default(['abc', 'def']),
			varchar: varchar('varchar', { length: 25 }).array().default(['abc', 'def']),
			char: char('char', { length: 3 }).array().default(['abc', 'def']),
			doublePrecision: doublePrecision('doublePrecision').array().default([100, 200]),
			real: real('real').array().default([100, 200]),
			time: time('time').array().default(['00:00:00', '01:00:00']),
			timestamp: timestamp('timestamp', { withTimezone: true, precision: 6 })
				.array()
				.default([new Date(), new Date()]),
			date: date('date').array().default(['2024-01-01', '2024-01-02']),
			uuid: uuid('uuid').array().default([
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
				'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12',
			]),
			inet: inet('inet').array().default(['127.0.0.1', '127.0.0.2']),
			interval: interval('interval').array().default(['1 day 01:00:00', '1 day 02:00:00']),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-all-columns-array-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect columns with name with non-alphanumeric characters', async () => {
	const schema = {
		users: cockroachTable('users', {
			'not:allowed': int4('not:allowed'),
			'nuh--uh': int4('nuh-uh'),
			'1_nope': int4('1_nope'),
			valid: int4('valid'),
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

test('introspect enum from different schema', async () => {
	const schema2 = cockroachSchema('schema2');
	const myEnumInSchema2 = schema2.enum('my_enum', ['a', 'b', 'c']);
	const schema = {
		schema2,
		myEnumInSchema2,
		users: cockroachTable('users', {
			col: myEnumInSchema2('col'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-enum-from-different-schema',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect enum with same names across different schema', async () => {
	const schema2 = cockroachSchema('schema2');
	const myEnumInSchema2 = schema2.enum('my_enum', ['a', 'b', 'c']);
	const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		schema2,
		myEnumInSchema2,
		myEnum,
		users: cockroachTable('users', {
			col1: myEnumInSchema2('col1'),
			col2: myEnum('col2'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-enum-with-same-names-across-different-schema',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect enum with similar name to native type', async () => {
	const timeLeft = cockroachEnum('time_left', ['short', 'medium', 'long']);
	const schema = {
		timeLeft,
		auction: cockroachTable('auction', {
			col: timeLeft('col1'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-enum-with-similar-name-to-native-type',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// defaults mismatch
test.todo('introspect strings with single quotes', async () => {
	const myEnum = cockroachEnum('my_enum', ['escape\'s quotes " ']);
	const schema = {
		enum_: myEnum,
		columns: cockroachTable('columns', {
			enum: myEnum('my_enum').default('escape\'s quotes " '),
			text: text('text').default('escape\'s quotes " '),
			varchar: varchar('varchar').default('escape\'s quotes " '),
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
		users: cockroachTable('users', {
			id: int4('id'),
			name: varchar('name'),
			age: int4('age'),
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
	const mySchema = cockroachSchema('schema2');
	const schema = {
		mySchema,
		users: cockroachTable('users', {
			id: int4('id'),
			age: int4('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
		usersInMySchema: mySchema.table('users', {
			id: int4('id'),
			age: int4('age'),
		}, (table) => [check('some_check', sql`${table.age} < 1`)]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-checks-diff-schema-same-names',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view #1', async () => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = cockroachView('some_view').as((qb) => qb.select().from(users));
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
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = cockroachView('some_view', { id: int4('asd') }).as(
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

test('introspect view in other schema', async () => {
	const newSchema = cockroachSchema('new_schema');
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = newSchema.view('some_view', { id: int4('asd') }).as(
		sql`SELECT * FROM ${users}`,
	);
	const schema = {
		view,
		users,
		newSchema,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-view-in-other-schema',
		['new_schema'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view in other schema', async () => {
	const newSchema = cockroachSchema('new_schema');
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = newSchema.materializedView('some_view', { id: int4('asd') }).as(
		sql`SELECT * FROM ${users}`,
	);
	const schema = {
		view,
		users,
		newSchema,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-mat-view-in-other-schema',
		['new_schema'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view #1', async () => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = cockroachMaterializedView('some_view').withNoData().as((qb) => qb.select().from(users));
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-materialized-view',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view #2', async () => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = cockroachMaterializedView('some_view', { id: int4('asd') }).as(
		sql`SELECT * FROM ${users}`,
	);
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-materialized-view-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "as"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-as',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with CURRENT_USER role', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { to: 'current_user' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-with-current-user-role',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with all fields except "using" and "with"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { as: 'permissive', for: 'all', to: ['root'] })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-all-fields',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "using" and "with"', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-using-withcheck',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies', async () => {
	const schema = {
		users: cockroachTable('users', {
			id: int4('id').primaryKey(),
		}, () => [cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }), cockroachPolicy('newRls')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles', async () => {
	await db.query(`CREATE ROLE new_manager;`);

	const schema = {
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
			},
			() => [
				cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				cockroachPolicy('newRls', { to: ['root', 'new_manager'] }),
			],
		),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies-with-roles',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic roles', async () => {
	const schema = {
		usersRole: cockroachRole('user'),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-roles',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('role with properties', async () => {
	const schema = {
		usersRole: cockroachRole('user', { createDb: true, createRole: true }),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'roles-with-properties',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('role with a few properties', async () => {
	const schema = {
		usersRole: cockroachRole('user', { createRole: true }),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'roles-with-few-properties',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles from schema', async () => {
	const usersRole = cockroachRole('user_role', { createRole: true });

	const schema = {
		usersRole,
		users: cockroachTable(
			'users',
			{
				id: int4('id').primaryKey(),
			},
			() => [
				cockroachPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				cockroachPolicy('newRls', { to: ['root', usersRole] }),
			],
		),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies-with-roles-from-schema',
		['public'],
		{ roles: { include: ['user_role'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
