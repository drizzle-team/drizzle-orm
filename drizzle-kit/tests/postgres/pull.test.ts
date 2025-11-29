import { PGlite } from '@electric-sql/pglite';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	char,
	check,
	cidr,
	customType,
	date,
	doublePrecision,
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
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	unique,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import fs from 'fs';
import { fromDatabase } from 'src/dialects/postgres/introspect';
import { DB } from 'src/utils';
import { diffIntrospect, prepareTestDatabase, TestDatabase } from 'tests/postgres/mocks';
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
			char: char('char', { length: 3 }).default('abc'),
			char1: char('char1', { length: 3 }).default(''),
			serial: serial('serial'),
			bigserial: bigserial('bigserial', { mode: 'number' }),
			smallserial: smallserial('smallserial'),
			doublePrecision: doublePrecision('doublePrecision').default(100),
			real: real('real').default(100),
			json: json('json').$type<{ attr: string }>().default({ attr: 'value' }),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default({ attr: 'value' }),
			jsonb1: jsonb('jsonb1').default(sql`jsonb_build_object()`),
			jsonb2: jsonb('jsonb2').default({}),
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
			jsonb1: jsonb('jsonb3').array().default(sql`'{}'`),
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
		column2: enum1().array().array(),
	});
	const publicJobsWithCompanies = pgView('public_jobs_with_companies').as((qb) => qb.select().from(test));

	const schema = { enum1, test, publicJobsWithCompanies };

	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-view-3');

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

test('multiple policies', async () => {
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
