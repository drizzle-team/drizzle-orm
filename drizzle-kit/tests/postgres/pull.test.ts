import { PGlite } from '@electric-sql/pglite';
import { SQL, sql } from 'drizzle-orm';
import {
	AnyPgColumn,
	bigint,
	bigserial,
	boolean,
	char,
	check,
	cidr,
	customType,
	date,
	doublePrecision,
	foreignKey,
	index,
	inet,
	integer,
	interval,
	json,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgMaterializedView,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	unique,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import fs from 'fs';
import { fromDatabase, fromDatabaseForDrizzle } from 'src/dialects/postgres/introspect';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { DB } from 'src/utils';
import { diffIntrospect, prepareTestDatabase, push, TestDatabase } from 'tests/postgres/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';

// @vitest-environment-options {"max-concurrency":1}

if (!fs.existsSync('tests/postgres/tmp')) {
	fs.mkdirSync(`tests/postgres/tmp`, { recursive: true });
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
		users: pgTable('users', {
			id: integer('id').notNull(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity always test', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'basic-identity-always-introspect');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity always test: few schemas', async () => {
	const testSchema = pgSchema('test');
	const schema = {
		testSchema,
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
			email: text('email'),
		}),
		usersInTestSchema: testSchema.table('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
			email: text('email'),
		}),
	};
	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'identity always test: few schemas', [
		'public',
		'test',
	]);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity by default test', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
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

// https://github.com/drizzle-team/drizzle-orm/issues/3240
test('basic index test', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
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

// TODO: Refactor this test
test('advanced index test', async () => {
	db.query('CREATE table job (name text, start_after text, priority text, created_on text, id text, state text);');
	db.query("CREATE INDEX job_i5 ON job (name, start_after) INCLUDE (priority, created_on, id) WHERE state < 'active';");

	const { indexes } = await fromDatabase(db, () => true);

	expect(indexes).toStrictEqual([
		{
			name: 'job_i5',
			table: 'job',
			columns: [
				{
					asc: true,
					isExpression: false,
					nullsFirst: false,
					opclass: null,
					value: 'name',
				},
				{
					asc: true,
					isExpression: false,
					nullsFirst: false,
					opclass: null,
					value: 'start_after',
				},
			],
			concurrently: false,
			entityType: 'indexes',
			forPK: false,
			isUnique: false,
			method: 'btree',
			forUnique: false,
			nameExplicit: true,
			schema: 'public',
			where: "(state < 'active'::text)",
			with: '',
		} satisfies typeof indexes[number],
	]);
});

test('identity always test: few params', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({
				startWith: 100,
				name: 'custom_name',
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
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				maxValue: 10000,
				name: 'custom_name',
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
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({
				startWith: 10,
				increment: 4,
				minValue: 10,
				maxValue: 10000,
				cache: 100,
				cycle: true,
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
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				startWith: 10,
				increment: 4,
				minValue: 10,
				maxValue: 10000,
				cache: 100,
				cycle: true,
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
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
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

test('generated column: link to another jsonb column', async () => {
	const schema = {
		users: pgTable('users', {
			predict: jsonb('predict'),
			predictions: jsonb('predictions')
				.generatedAlwaysAs((): SQL => sql`predict -> 'predictions'`),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'generated-link-jsonb-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5149
// https://github.com/drizzle-team/drizzle-orm/issues/3593
// https://github.com/drizzle-team/drizzle-orm/issues/4349
// https://github.com/drizzle-team/drizzle-orm/issues/4632
// https://github.com/drizzle-team/drizzle-orm/issues/4644
// https://github.com/drizzle-team/drizzle-orm/issues/4730
// https://github.com/drizzle-team/drizzle-orm/issues/4760
// https://github.com/drizzle-team/drizzle-orm/issues/4916
test('introspect all column types', async () => {
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		// NOTE: Types from extensions aren't tested due to PGlite not supporting at the moment
		columns: pgTable('columns', {
			enum: myEnum('my_enum').default('a'),
			smallint: smallint('smallint').default(10),
			integer: integer('integer').default(10),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).default('99.9'),
			numeric2: numeric('numeric2', { precision: 1, scale: 1 }).default('99.9'),
			numeric3: numeric('numeric3').default('99.9'),
			bigint: bigint('bigint', { mode: 'number' }).default(100),
			boolean: boolean('boolean').default(true),
			text: text('text').default('abc'),
			text1: text('text1').default(sql`gen_random_uuid()`),
			text2: text('text2').default('``'),
			text3: text('text3').default(''),
			varchar: varchar('varchar', { length: 25 }).default('abc'),
			varchar1: varchar('varchar1', { length: 25 }).default(''),
			varchar2: varchar('varchar2').default(sql`md5((random())::text)`),
			char: char('char', { length: 3 }).default('abc'),
			char1: char('char1', { length: 3 }).default(''),
			serial: serial('serial'),
			bigserial: bigserial('bigserial', { mode: 'number' }),
			smallserial: smallserial('smallserial'),
			doublePrecision: doublePrecision('doublePrecision').default(100),
			real: real('real').default(100),
			json: json('json').$type<{ attr: string }>().default({ attr: 'value' }),
			json1: json('json1').default(sql`jsonb_build_object()`),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default({ attr: 'value' }),
			jsonb1: jsonb('jsonb1').default(sql`jsonb_build_object()`),
			jsonb2: jsonb('jsonb2').default({}),
			jsonb3: jsonb('jsonb3').default({ confirmed: true, not_received: true }).notNull(),
			time1: time('time1').default('00:00:00'),
			time2: time('time2').defaultNow(),
			timestamp1: timestamp('timestamp1', { withTimezone: true, precision: 6 }).default(new Date()),
			timestamp2: timestamp('timestamp2', { withTimezone: true, precision: 6 }).defaultNow(),
			timestamp3: timestamp('timestamp3', { withTimezone: true, precision: 6 }).default(
				sql`timezone('utc'::text, now())`,
			),
			date1: date('date1').default('2024-01-01'),
			date2: date('date2').defaultNow(),
			date3: date('date3').default(sql`CURRENT_TIMESTAMP`),
			uuid1: uuid('uuid1').default('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
			uuid2: uuid('uuid2').defaultRandom(),
			inet: inet('inet').default('127.0.0.1'),
			cidr: cidr('cidr').default('127.0.0.1/32'),
			macaddr: macaddr('macaddr').default('00:00:00:00:00:00'),
			macaddr8: macaddr8('macaddr8').default('00:00:00:ff:fe:00:00:00'),
			interval: interval('interval').default('1 day 01:00:00'),
			customType: customType({
				dataType: () => 'tsvector',
			})().default("to_tsvector('english', 'The Fat Rats')"),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-all-columns-types',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5093
test('introspect uuid column with custom default function', async () => {
	await db.query(`CREATE OR REPLACE FUNCTION uuidv7()
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'::uuid;
$$;`);

	const schema = {
		columns: pgTable('columns', {
			uuid1: uuid().default(sql`uuidv7()`),
			text: text().default(sql`uuidv7()`),
			char: char().default(sql`uuidv7()`),
			varchar: varchar().default(sql`uuidv7()`),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-uuid-column-custom-default',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4231#:~:text=Scenario%201%3A%20jsonb().array().default(%5B%5D)
// https://github.com/drizzle-team/drizzle-orm/issues/4529
test('introspect all column array types', async () => {
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		// NOTE: Types from extensions aren't tested due to PGlite not supporting at the moment
		columns: pgTable('columns', {
			enum: myEnum('my_enum').array().default(['a', 'b']),
			smallint: smallint('smallint').array().default([10, 20]),
			integer: integer('integer').array().default([10, 20]),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).array().default(['99.9', '88.8']),
			bigint: bigint('bigint', { mode: 'number' }).array().default([100, 200]),
			boolean: boolean('boolean').array().default([true, false]),
			text: text('test').array().default(['abc', 'def']),
			varchar: varchar('varchar', { length: 25 }).array().default(['abc', 'def']),
			char: char('char', { length: 3 }).array().default(['abc', 'def']),
			doublePrecision: doublePrecision('doublePrecision').array().default([100, 200]),
			real: real('real').array().default([100, 200]),
			json: json('json').$type<{ attr: string }>().array().default([{ attr: 'value1' }, { attr: 'value2' }]),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().array().default([{ attr: 'value1' }, { attr: 'value2' }]),
			jsonb1: jsonb('jsonb1').array().default(sql`'{}'`),
			jsonb2: jsonb('jsonb2').array().default([]),
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
			cidr: cidr('cidr').array().default(['127.0.0.1/32', '127.0.0.2/32']),
			macaddr: macaddr('macaddr').array().default(['00:00:00:00:00:00', '00:00:00:00:00:01']),
			macaddr8: macaddr8('macaddr8').array().default(['00:00:00:ff:fe:00:00:00', '00:00:00:ff:fe:00:00:01']),
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
		users: pgTable('users', {
			'not:allowed': integer('not:allowed'),
			'nuh--uh': integer('nuh-uh'),
			'1_nope': integer('1_nope'),
			valid: integer('valid'),
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
	const schema2 = pgSchema('schema2');
	const myEnumInSchema2 = schema2.enum('my_enum', ['a', 'b', 'c']);
	const schema = {
		schema2,
		myEnumInSchema2,
		users: pgTable('users', {
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
	const schema2 = pgSchema('schema2');
	const myEnumInSchema2 = schema2.enum('my_enum', ['a', 'b', 'c']);
	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		schema2,
		myEnumInSchema2,
		myEnum,
		users: pgTable('users', {
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
	const timeLeft = pgEnum('time_left', ['short', 'medium', 'long']);
	const schema = {
		timeLeft,
		auction: pgTable('auction', {
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

test('introspect strings with single quotes', async () => {
	const myEnum = pgEnum('my_enum', ['escape\'s quotes " ']);
	const schema = {
		enum_: myEnum,
		columns: pgTable('columns', {
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
		users: pgTable('users', {
			id: serial('id'),
			name: varchar('name'),
			age: integer('age'),
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
	const mySchema = pgSchema('schema2');
	const schema = {
		mySchema,
		users: pgTable('users', {
			id: serial('id'),
			age: integer('age'),
		}, (table) => [check('some_check', sql`${table.age} > 21`)]),
		usersInMySchema: mySchema.table('users', {
			id: serial('id'),
			age: integer('age'),
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
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgView('some_view').as((qb) => qb.select().from(users));
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
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgView('some_view', { id: integer('asd') }).with({ checkOption: 'cascaded' }).as(
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

// https://github.com/drizzle-team/drizzle-orm/issues/4764
test('introspect view #3', async () => {
	const enum1 = pgEnum('enum_1', ['text', 'not_text']);

	const test = pgTable('test', {
		column1: enum1().array(),
		column2: enum1().array('[][]'),
	});
	const publicJobsWithCompanies = pgView('public_jobs_with_companies').as((qb) => qb.select().from(test));

	const schema = { enum1, test, publicJobsWithCompanies };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-view-3');

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	// TODO: we need to check actual types generated;
});

// https://github.com/drizzle-team/drizzle-orm/issues/4262
// postopone
// Need to write discussion/guide on this and add ts comment in typescript file
test.skipIf(Date.now() < +new Date('2026-01-20'))('introspect view #4', async () => {
	const table = pgTable('table', {
		column1: text().notNull(),
		column2: text(),
	});
	const myView = pgView('public_table_view_4', { column1: text(), column2: text() }).as(
		sql`select column1, column2 from "table"`,
	);

	const schema = { table, myView };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-view-4');

	throw Error('');
	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	// TODO: we need to check actual types generated;
});

test('introspect view in other schema', async () => {
	const newSchema = pgSchema('new_schema');
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = newSchema.view('some_view', { id: integer('asd') }).with({ checkOption: 'cascaded' }).as(
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
	const newSchema = pgSchema('new_schema');
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = newSchema.materializedView('some_view', { id: integer('asd') }).with({ autovacuumEnabled: true }).as(
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
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgMaterializedView('some_view').using('heap').withNoData().as((qb) => qb.select().from(users));
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
	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgMaterializedView('some_view', { id: integer('asd') }).with({ autovacuumFreezeMinAge: 1 }).as(
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

test('basic policy #1', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-#1',
		['public'],
		{ roles: { include: ['test'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "as"', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-as',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy', async () => {
	const schema = {
		role: pgRole('test2'),
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: 'test2' })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy',
		['public'],
		{ roles: { include: ['test2'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with all fields except "using" and "with"', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'all', to: ['postgres'] })]),
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
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { using: sql`true`, withCheck: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'basic-policy-using-withcheck',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies #1', async () => {
	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { using: sql`true`, withCheck: sql`true` }), pgPolicy('newRls')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4407
test('multiple policies #2', async () => {
	const users = pgTable('users', {
		id: integer(),
	}, (table) => [
		pgPolicy('insert_policy_for_users', { for: 'insert', withCheck: sql`true` }),
		pgPolicy('update_policy_for_users', { for: 'update', using: sql`true`, withCheck: sql`true` }),
	]);
	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { using: sql`true`, withCheck: sql`true` }), pgPolicy('newRls')]),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'multiple-policies-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles', async () => {
	db.query(`CREATE ROLE manager;`);

	const schema = {
		users: pgTable(
			'users',
			{
				id: integer('id').primaryKey(),
			},
			() => [
				pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				pgPolicy('newRls', { to: ['postgres', 'manager'] }),
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
		usersRole: pgRole('user'),
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
		usersRole: pgRole('user', { inherit: false, createDb: true, createRole: true }),
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
		usersRole: pgRole('user', { inherit: false, createRole: true }),
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
	const usersRole = pgRole('user_role', { inherit: false, createRole: true });

	const schema = {
		usersRole,
		users: pgTable(
			'users',
			{
				id: integer('id').primaryKey(),
			},
			() => [
				pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
				pgPolicy('newRls', { to: ['postgres', usersRole] }),
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

test('case sensitive schema name + identity column', async () => {
	const mySchema = pgSchema('CaseSensitiveSchema');
	const schema = {
		mySchema,
		users: mySchema.table('users', {
			id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
			name: text('name'),
		}),
	};

	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'case-sensitive-schema-name',
		['CaseSensitiveSchema'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect without any schema', async () => {
	await db.query(`DROP SCHEMA "public" cascade`);
	const schema = {};
	const { statements, sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-without-any-schema',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect composite pk', async () => {
	const firstToSecondTable = pgTable(
		'firstToSecond',
		{
			firstId: integer('firstId'),
			secondId: integer('secondId'),
		},
		(table) => [primaryKey({ columns: [table.firstId, table.secondId] })],
	);

	const schema = { firstToSecondTable };

	const { sqlStatements } = await diffIntrospect(
		db,
		schema,
		'introspect-composite-pk',
	);

	expect(sqlStatements).toStrictEqual([]);
});

test('introspect foreign keys', async () => {
	const mySchema = pgSchema('my_schema');
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
		name: text('name'),
	});
	const schema = {
		mySchema,
		users,
		posts: mySchema.table('posts', {
			id: integer('id').primaryKey(),
			userId: integer('user_id').references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
		}),
	};
	const { statements, sqlStatements, ddlAfterPull } = await diffIntrospect(
		db,
		schema,
		'introspect-foreign-keys',
		['my_schema', 'public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(ddlAfterPull.fks.one({
		schema: 'my_schema',
		table: 'posts',
		columns: ['user_id'],
		schemaTo: 'public',
		tableTo: 'users',
		columnsTo: ['id'],
	})).not.toBeNull();
});

// https://github.com/drizzle-team/drizzle-orm/issues/5082
test('introspect foreign keys #2', async () => {
	const test = pgTable('test', {
		col1: integer(),
		col2: integer(),
		col3: integer(),
	}, (table) => [
		unique('composite_unique').on(table.col2, table.col3),
		unique('test_col1_key').on(table.col1),
	]);

	const test1 = pgTable('test1', {
		col1: integer().references(() => test.col1),
		col2: integer(),
		col3: integer(),
	}, (table) => [
		foreignKey({
			columns: [table.col2, table.col3],
			foreignColumns: [test.col2, test.col3],
			name: 'composite_fk',
		}),
	]);

	const schema = { test, test1 };
	const { statements, sqlStatements, ddlAfterPull } = await diffIntrospect(
		db,
		schema,
		'introspect-foreign-keys-2',
		['public'],
	);
	console.log(ddlAfterPull.fks);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	expect(ddlAfterPull.fks.list({ schema: 'public' }).length).toBe(2);
	const predicate = ddlAfterPull.fks.list({ schema: 'public' }).map((fk) =>
		fk.columns.length !== 0 && fk.columnsTo.length !== 0
	).every((val) => val === true);
	expect(predicate).toBe(true);
});

test('introspect table with self reference', async () => {
	const users = pgTable('users', {
		id: integer().primaryKey(),
		name: text(),
		invited_id: integer().references((): AnyPgColumn => users.id),
	});
	const schema = { users };
	const { statements, sqlStatements, ddlAfterPull } = await diffIntrospect(db, schema, 'introspect-self-ref');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect partitioned tables', async () => {
	await db.query(`
		CREATE TABLE measurement (
			city_id         int not null,
			logdate         date not null,
			peaktemp        int,
			unitsales       int
		) PARTITION BY RANGE (logdate);
	`);

	const { tables } = await fromDatabase(db);

	expect(tables).toStrictEqual([
		{
			name: 'measurement',
			schema: 'public',
			entityType: 'tables',
			isRlsEnabled: false,
		} satisfies typeof tables[number],
	]);
});

test('default sequence nextval', async () => {
	const seqOrgCode = pgSequence('seq_org_code', {
		startWith: '1000',
		increment: '1',
		minValue: '1',
		maxValue: '9223372036854775807',
		cache: '1',
		cycle: false,
	});

	const organizations = pgTable('organizations', {
		code: bigint({ mode: 'number' }).default(sql`nextval('seq_org_code'::regclass)`).notNull(),
	});

	const { sqlStatements } = await diffIntrospect(db, { seqOrgCode, organizations }, 'default_sequence_nextval');

	expect(sqlStatements).toStrictEqual([]);
});

test('policy', async () => {
	const organizationsInCore = pgTable('organizations', {
		domain: text(),
	}, (table) => [
		unique('organizations_domain_key').on(table.domain),
	]);

	const policy = pgPolicy('new_policy', {
		as: 'restrictive',
		to: 'postgres',
		withCheck: sql`1 = 1`,
		for: 'all',
	}).link(organizationsInCore);

	const { sqlStatements } = await diffIntrospect(db, { organizationsInCore, policy }, 'policy');
	expect(sqlStatements).toStrictEqual([]);
});

// test('introspect foreign tables', async () => {
// 	await db.query('CREATE EXTENSION postgres_fdw;');
// 	await db.query("CREATE SERVER film_server FOREIGN DATA WRAPPER postgres_fdw OPTIONS (host 'foo', dbname 'foodb', port '5432');");
// 	await db.query(`
// 		CREATE FOREIGN TABLE films (
// 			code        char(5) NOT NULL,
// 			title       varchar(40) NOT NULL,
// 			did         integer NOT NULL,
// 			date_prod   date,
// 			kind        varchar(10),
// 			len         interval hour to minute
// 		) SERVER film_server;
// 	`);

// 	const { tables } = await fromDatabase(db);

// 	expect(tables).toStrictEqual([
// 		{
// 			name: 'films',
// 			schema: 'public',
// 			entityType: 'tables',
// 			isRlsEnabled: false,
// 		} satisfies typeof tables[number],
// 	]);
// });

// https://github.com/drizzle-team/drizzle-orm/issues/4170
test('introspect view with table filter', async () => {
	const table1 = pgTable('table1', {
		column1: serial().primaryKey(),
	});
	const view1 = pgView('view1', { column1: serial() }).as(sql`select column1 from ${table1}`);
	const table2 = pgTable('table2', {
		column1: serial().primaryKey(),
	});
	const view2 = pgView('view2', { column1: serial() }).as(sql`select column1 from ${table2}`);
	const schema1 = { table1, view1, table2, view2 };
	await push({ db, to: schema1 });

	let tables, views;
	let filter = prepareEntityFilter('postgresql', {
		tables: ['table1'],
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	({ tables, views } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	));
	const expectedTables = [
		{
			entityType: 'tables',
			schema: 'public',
			name: 'table1',
			isRlsEnabled: false,
		},
	];
	expect(tables).toStrictEqual(expectedTables);
	expect(views).toStrictEqual([]);

	filter = prepareEntityFilter('postgresql', {
		tables: ['table1', 'view1'],
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	({ tables, views } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	));
	const expectedViews = [
		{
			entityType: 'views',
			schema: 'public',
			name: 'view1',
			definition: 'SELECT column1 FROM table1',
			with: null,
			materialized: false,
			tablespace: null,
			using: null,
			withNoData: null,
		},
	];
	expect(tables).toStrictEqual(expectedTables);
	expect(views).toStrictEqual(expectedViews);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4144
test.skipIf(Date.now() < +new Date('2026-01-20'))('introspect sequences with table filter', async () => {
	// can filter sequences with select pg_get_serial_sequence('"schema_name"."table_name"', 'column_name')

	// const seq1 = pgSequence('seq1');
	const table1 = pgTable('table1', {
		column1: serial().primaryKey(),
		// column1: integer().default(sql`nextval('${sql.raw(seq1.seqName!)}'::regclass)`).primaryKey(),
	});
	const table2 = pgTable('prefix_table2', {
		column1: serial().primaryKey(),
		// column1: integer().default(sql`nextval('${sql.raw(seq2.seqName!)}'::regclass)`).primaryKey(),
	});
	const schema1 = { table1, table2 };
	await push({ db, to: schema1 });

	const filter = prepareEntityFilter('postgresql', {
		tables: ['!prefix_*'],
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { tables, sequences } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect(tables).toStrictEqual([
		{
			entityType: 'tables',
			schema: 'public',
			name: 'table1',
			isRlsEnabled: false,
		},
	]);
	expect(sequences).toBe([
		{
			entityType: 'sequences',
			schema: 'public',
			name: 'table1_column1_seq',
			startWith: '1',
			minValue: '1',
			maxValue: '2147483647',
			incrementBy: '1',
			cycle: false,
			cacheSize: 1,
		},
	]);
	// 	console.log(await db.query(`select pg_get_serial_sequence('"public"."table1"', 'column1');`));
	// 	console.log(await db.query(`select pg_get_serial_sequence('"public"."table2"', 'column1');`));
	// 	console.log(
	// 		await db.query(`SELECT *
	// FROM pg_sequences
	// WHERE schemaname = 'public' AND sequencename = 'table1_column1_seq';`),
	// 	);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4215
test('introspect _{dataType} columns type as {dataType}[]', async () => {
	await db.query(`CREATE TYPE mood_enum AS ENUM('ok', 'bad', 'good');`);
	await db.query(`CREATE TABLE "_array_data_types" (
			integer_array          _int4,
			smallint_array         _int2,
			bigint_array           _int8,
			numeric_array          _numeric,
			real_array             _float4,
			double_precision_array double precision[],
			boolean_array          _bool,
			char_array             _bpchar,-- char with no length restriction
			varchar_array          _varchar,
			text_array             _text,
			bit_array              _bit,
			json_array             _json,
			jsonb_array            _jsonb,
			time_array             _time,
			timestamp_array        _timestamp,
			date_array             _date,
			interval_array         _interval,
			point_array            _point,
			line_array             _line,
			mood_enum_array        _mood_enum,
			uuid_array             _uuid,
			inet_array             _inet
	);`);

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { columns } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	const columnTypes = columns.map((col) => col.type);
	const columnDimensions = columns.map((col) => col.dimensions);

	expect(columnTypes).toStrictEqual([
		'integer',
		'smallint',
		'bigint',
		'numeric',
		'real',
		'double precision',
		'boolean',
		'bpchar',
		'varchar',
		'text',
		'bit',
		'json',
		'jsonb',
		'time',
		'timestamp',
		'date',
		'interval',
		'point',
		'line',
		'mood_enum',
		'uuid',
		'inet',
	]);
	expect(columnDimensions.every((dim) => dim === 1)).toBe(true);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5149
test('jsonb default with boolean literals', async () => {
	const JSONB = pgTable('organizations1', {
		notifications: jsonb().default({ confirmed: true, not_received: true }).notNull(),
	});
	const JSON = pgTable('organizations2', {
		notifications: json().default({ confirmed: true, not_received: true }).notNull(),
	});
	const JSONBARRAY = pgTable('organizations3', {
		notifications: jsonb().array().default([{ confirmed: true, not_received: true }]).notNull(),
	});
	const JSONARRAY = pgTable('organizations4', {
		notifications: json().array().default([{ confirmed: true, not_received: true }]).notNull(),
	});

	const { sqlStatements } = await diffIntrospect(
		db,
		{ JSONB, JSONBARRAY, JSON, JSONARRAY },
		'jsonb_default_with_boolean_literals',
	);

	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5053
test('single quote default', async () => {
	const group = pgTable('group', {
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

// https://github.com/drizzle-team/drizzle-orm/issues/3418
test('introspect enum within schema', async () => {
	const mySchema = pgSchema('my_schema');
	const myEnum = mySchema.enum('my_enum', ['bad', 'sad', 'mad']);
	const myTable = mySchema.table('my_table', { col1: myEnum() });
	const myView = mySchema.view('my_view').as((qb) => qb.select().from(myTable));
	const table1 = pgTable('table1', {
		column1: serial().primaryKey(),
	});
	const schema = { mySchema, myEnum, myTable, myView, table1 };
	await push({ db, to: schema });

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: ['!my_schema'],
		entities: undefined,
		extensions: undefined,
	}, []);
	const { tables, enums, views } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect(tables).toStrictEqual([
		{
			entityType: 'tables',
			schema: 'public',
			name: 'table1',
			isRlsEnabled: false,
		},
	]);
	expect(enums).toStrictEqual([]);
	expect(views).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5196
test('index with option', async () => {
	const table1 = pgTable('table1', {
		column1: integer(),
		column2: integer(),
		column3: integer(),
	}, (t) => [
		index('book_author_id').using('btree', t.column1.asc().nullsLast()).with({ deduplicate_items: true }),
		index('book_title_search').using('btree', t.column2.asc().nullsLast()),
		index('created_at').using('brin', t.column3.asc().nullsLast()).with({ autosummarize: false }),
	]);

	const { sqlStatements } = await diffIntrospect(db, { table1 }, 'index_with_option');
	expect(sqlStatements).toStrictEqual([]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5224
test('functional index', async () => {
	const table1 = pgTable('table1', {
		normalized_address: text(),
		state: text(),
	}, (t) => [
		uniqueIndex('idx_addresses_natural_key')
			.using(
				'btree',
				sql.raw(`upper(normalized_address)`),
				sql.raw(`upper((state)::text)`),
			)
			.where(sql.raw(`((normalized_address IS NOT NULL) AND (state IS NOT NULL))`)),
	]);

	const { sqlStatements, schema2 } = await diffIntrospect(db, { table1 }, 'functional_index');
	expect(sqlStatements).toStrictEqual([]);
	expect(schema2.indexes).toStrictEqual([{
		columns: [
			{
				asc: true,
				isExpression: true,
				nullsFirst: false,
				opclass: null,
				value: 'upper(normalized_address)',
			},
			{
				asc: true,
				isExpression: true,
				nullsFirst: false,
				opclass: null,
				value: 'upper(state)',
			},
		],
		concurrently: false,
		entityType: 'indexes',
		forPK: false,
		forUnique: false,
		isUnique: true,
		method: 'btree',
		name: 'idx_addresses_natural_key',
		nameExplicit: true,
		schema: 'public',
		table: 'table1',
		where: '((normalized_address IS NOT NULL) AND (state IS NOT NULL))',
		with: '',
	}]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5193
test('check definition', async () => {
	const table1 = pgTable('table1', {
		column1: serial().primaryKey(),
	}, (t) => [check('check_positive', sql`${t.column1} > 0`)]);
	const schema = { table1 };
	await push({ db, to: schema });

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { checks } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect(checks).toStrictEqual([
		{
			entityType: 'checks',
			schema: 'public',
			name: 'check_positive',
			table: 'table1',
			value: '(column1 > 0)',
		},
	]);
});

// other tables in migration schema
test('pull after migrate with custom migrations table #1', async () => {
	await db.query(`CREATE SCHEMA drizzle;`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS drizzle.users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { pks, columns, tables, schemas } = await fromDatabaseForDrizzle(
		db,
		filter,
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
			isRlsEnabled: false,
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
		CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS public.users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { schemas, tables, pks } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect([...schemas, ...tables, ...pks]).toStrictEqual([
		{
			entityType: 'tables',
			isRlsEnabled: false,
			name: 'users',
			schema: 'public',
		},
		{
			columns: [
				'id',
			],
			entityType: 'pks',
			name: 'users_pkey',
			nameExplicit: true,
			schema: 'public',
			table: 'users',
		},
	]);
});

// other tables in custom migration schema
test('pull after migrate with custom migrations table #3', async () => {
	await db.query(`CREATE SCHEMA custom;`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS custom.custom_migrations (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL,
			applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
		);
	`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS custom.users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);
	await db.query(`
		CREATE TABLE IF NOT EXISTS public.users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { schemas, tables, pks } = await fromDatabaseForDrizzle(
		db,
		filter,
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
			isRlsEnabled: false,
			name: 'users',
			schema: 'custom',
		},
		{
			entityType: 'tables',
			isRlsEnabled: false,
			name: 'users',
			schema: 'public',
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
			schema: 'public',
			table: 'users',
		},
	]);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5190
test('pscale_extensions schema', async () => {
	await db.query(`CREATE SCHEMA test;`);
	await db.query(`CREATE SCHEMA pscale_extensions;`);

	await db.query(`
		CREATE TABLE IF NOT EXISTS public.users (
			id SERIAL PRIMARY KEY,
			name TEXT NOT NULL
		);
	`);

	const schema1 = {
		table1: pgTable('table1', {
			id: text().primaryKey(),
		}),
	};

	const filter = prepareEntityFilter('postgresql', {
		tables: undefined,
		schemas: undefined,
		entities: undefined,
		extensions: undefined,
	}, []);
	const { schemas } = await fromDatabaseForDrizzle(
		db,
		filter,
		() => {},
		{
			table: '__drizzle_migrations',
			schema: 'drizzle',
		},
	);

	expect(schemas).toStrictEqual([{ name: 'test', entityType: 'schemas' }]);
});
