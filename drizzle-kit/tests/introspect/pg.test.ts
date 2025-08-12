import { PGlite } from '@electric-sql/pglite';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	bigserial,
	boolean,
	char,
	check,
	cidr,
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
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import fs from 'fs';
import { introspectPgToFile } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

if (!fs.existsSync('tests/introspect/postgres')) {
	fs.mkdirSync('tests/introspect/postgres');
}

test('basic introspect test', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').notNull(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity always test', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-identity-always-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic identity by default test', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
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
		}, (table) => ({
			singleColumn: index('single_column').on(table.firstName),
			multiColumn: index('multi_column').on(table.firstName, table.lastName),
			singleExpression: index('single_expression').on(sql`lower(${table.firstName})`),
			multiExpression: index('multi_expression').on(sql`lower(${table.firstName})`, sql`lower(${table.lastName})`),
			expressionWithComma: index('expression_with_comma').on(
				sql`(lower(${table.firstName}) || ', '::text || lower(${table.lastName}))`,
			),
			expressionWithDoubleQuote: index('expression_with_double_quote').on(sql`('"'::text || ${table.firstName})`),
			expressionWithJsonbOperator: index('expression_with_jsonb_operator').on(
				sql`(${table.data} #>> '{a,b,1}'::text[])`,
			),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-index-introspect',
	);

	expect(statements.length).toBe(10);
	expect(sqlStatements.length).toBe(10);
});

test('identity always test: few params', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({
				startWith: 100,
				name: 'custom_name',
			}),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'identity-always-few-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity by default test: few params', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				maxValue: 10000,
				name: 'custom_name',
			}),
			email: text('email'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'identity-default-few-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity always test: all params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'identity-always-all-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('identity by default test: all params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'identity-default-all-params-introspect',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('generated column: link to another column', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity(),
			email: text('email'),
			generatedEmail: text('generatedEmail').generatedAlwaysAs(
				(): SQL => sql`email`,
			),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'generated-link-column',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect all column types', async () => {
	const client = new PGlite();

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
			text: text('test').default('abc'),
			varchar: varchar('varchar', { length: 25 }).default('abc'),
			char: char('char', { length: 3 }).default('abc'),
			serial: serial('serial'),
			bigserial: bigserial('bigserial', { mode: 'number' }),
			smallserial: smallserial('smallserial'),
			doublePrecision: doublePrecision('doublePrecision').default(100),
			real: real('real').default(100),
			json: json('json').$type<{ attr: string }>().default({ attr: 'value' }),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default({ attr: 'value' }),
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
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-all-columns-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect all column array types', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-all-columns-array-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect columns with name with non-alphanumeric characters', async () => {
	const client = new PGlite();
	const schema = {
		users: pgTable('users', {
			'not:allowed': integer('not:allowed'),
			'nuh--uh': integer('nuh-uh'),
			'1_nope': integer('1_nope'),
			valid: integer('valid'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-column-with-name-with-non-alphanumeric-characters',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect enum from different schema', async () => {
	const client = new PGlite();

	const schema2 = pgSchema('schema2');
	const myEnumInSchema2 = schema2.enum('my_enum', ['a', 'b', 'c']);
	const schema = {
		schema2,
		myEnumInSchema2,
		users: pgTable('users', {
			col: myEnumInSchema2('col'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-enum-from-different-schema',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect enum with same names across different schema', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-enum-with-same-names-across-different-schema',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect enum with similar name to native type', async () => {
	const client = new PGlite();

	const timeLeft = pgEnum('time_left', ['short', 'medium', 'long']);
	const schema = {
		timeLeft,
		auction: pgTable('auction', {
			col: timeLeft('col1'),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-enum-with-similar-name-to-native-type',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect strings with single quotes', async () => {
	const client = new PGlite();

	const myEnum = pgEnum('my_enum', ['escape\'s quotes " ']);
	const schema = {
		enum_: myEnum,
		columns: pgTable('columns', {
			enum: myEnum('my_enum').default('escape\'s quotes " '),
			text: text('text').default('escape\'s quotes " '),
			varchar: varchar('varchar').default('escape\'s quotes " '),
		}),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-strings-with-single-quotes',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: serial('id'),
			name: varchar('name'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-checks',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks from different schemas with same names', async () => {
	const client = new PGlite();

	const mySchema = pgSchema('schema2');
	const schema = {
		mySchema,
		users: pgTable('users', {
			id: serial('id'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
		usersInMySchema: mySchema.table('users', {
			id: serial('id'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} < 1`),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-checks-diff-schema-same-names',
		['public', 'schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view #1', async () => {
	const client = new PGlite();

	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgView('some_view').as((qb) => qb.select().from(users));
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-view',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view #2', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-view-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect view in other schema', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-view-in-other-schema',
		['new_schema'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view in other schema', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-mat-view-in-other-schema',
		['new_schema'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view #1', async () => {
	const client = new PGlite();

	const users = pgTable('users', {
		id: serial('id').primaryKey().notNull(),
		name: varchar('users'),
	});

	const view = pgMaterializedView('some_view').using('heap').withNoData().as((qb) => qb.select().from(users));
	const schema = {
		view,
		users,
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-materialized-view',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect materialized view #2', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-materialized-view-2',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test'),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-policy',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "as"', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-policy-as',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test.todo('basic policy with CURRENT_USER role', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { to: 'current_user' }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-policy',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with all fields except "using" and "with"', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', for: 'all', to: ['postgres'] }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-policy-all-fields',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic policy with "using" and "with"', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-policy-using-withcheck',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
			rlsPolicy: pgPolicy('newRls'),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'multiple-policies',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles', async () => {
	const client = new PGlite();

	client.query(`CREATE ROLE manager;`);

	const schema = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
			rlsPolicy: pgPolicy('newRls', { to: ['postgres', 'manager'] }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'multiple-policies-with-roles',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('basic roles', async () => {
	const client = new PGlite();

	const schema = {
		usersRole: pgRole('user'),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'basic-roles',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('role with properties', async () => {
	const client = new PGlite();

	const schema = {
		usersRole: pgRole('user', { inherit: false, createDb: true, createRole: true }),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'roles-with-properties',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('role with a few properties', async () => {
	const client = new PGlite();

	const schema = {
		usersRole: pgRole('user', { inherit: false, createRole: true }),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'roles-with-few-properties',
		['public'],
		{ roles: { include: ['user'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('multiple policies with roles from schema', async () => {
	const client = new PGlite();

	const usersRole = pgRole('user_role', { inherit: false, createRole: true });

	const schema = {
		usersRole,

		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { using: sql`true`, withCheck: sql`true` }),
			rlsPolicy: pgPolicy('newRls', { to: ['postgres', usersRole] }),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'multiple-policies-with-roles-from-schema',
		['public'],
		{ roles: { include: ['user_role'] } },
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('verify table declarations are in alphabetical order', async () => {
	const client = new PGlite();

	const schema = {
		f: pgTable('f', { id: integer('id').notNull() }),
		e: pgTable('e', { id: integer('id').notNull() }),
		d: pgTable('d', { id: integer('id').notNull() }),
		c: pgTable('b', { id: integer('id').notNull() }),
		b: pgTable('c', { id: integer('id').notNull() }),
		a: pgTable('a', { id: integer('id').notNull() }),
	};

	const { statements, sqlStatements, file } = await introspectPgToFile(
		client,
		schema,
		'alphabetical-table-order-test',
		['public'],
		undefined,
		undefined,
		true,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
	if (!file) {
		throw new Error('File is missing');
	}

	// Extract table variable names from the declarations string
	const declarations = file.declarations;
	const exportPattern = /export const (\w+) = pgTable/g;
	const tableNames: string[] = [];
	let match;

	while ((match = exportPattern.exec(declarations)) !== null) {
		tableNames.push(match[1]);
	}
	expect(tableNames.length).toBe(6);

	// Verify tables are declared in alphabetical order
	const sortedTableNames = [...tableNames].sort();
	expect(tableNames).toEqual(sortedTableNames);

	// Additional assertion with descriptive message
	if (JSON.stringify(tableNames) !== JSON.stringify(sortedTableNames)) {
		throw new Error(
			`Tables are not in alphabetical order. Found: [${tableNames.join(', ')}], Expected: [${
				sortedTableNames.join(', ')
			}]`,
		);
	}
});
test('verify column declarations are in alphabetical order', async () => {
	const client = new PGlite();

	const schema = {
		z: pgTable('z', {
			f: integer('f').notNull(),
			e: integer('e').notNull(),
		}),
		y: pgTable('y', {
			b: integer('b').notNull(),
			d: integer('d').notNull(),
			c: integer('c').notNull(),
			a: integer('a').notNull(),
		}),
	};

	const { statements, sqlStatements, file } = await introspectPgToFile(
		client,
		schema,
		'alphabetical-column-order-test',
		['public'],
		undefined,
		undefined,
		true,
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements.length).toBe(0);
	if (!file) {
		throw new Error('File is missing');
	}

	// Extract column variable names from the declarations string
	const declarations = file.declarations;
	const exportPattern = /(\w+):\s+integer/g;
	const columnNames: string[] = [];
	let match;

	while ((match = exportPattern.exec(declarations)) !== null) {
		columnNames.push(match[1]);
	}
	expect(columnNames.length).toBe(6);

	// Verify columns are declared in alphabetical order
	const sortedColumnNames = [...columnNames].sort();
	expect(columnNames).toEqual(sortedColumnNames);

	// Additional assertion with descriptive message
	if (JSON.stringify(columnNames) !== JSON.stringify(sortedColumnNames)) {
		throw new Error(
			`Columns are not in alphabetical order. Found: [${columnNames.join(', ')}], Expected: [${
				sortedColumnNames.join(', ')
			}]`,
		);
	}
});

test('verify policy declarations are in alphabetical order', async () => {
	const client = new PGlite();

	const schema = {
		z: pgTable('z', {
			f: integer('f').notNull(),
			e: integer('e').notNull(),
		}, () => ({
			rls: pgPolicy('test_B', {
				as: 'permissive',
				for: 'update',
				to: 'public',
				using: sql`1 + 2 = 3`,
				withCheck: sql`4 + 5 = 9`,
			}),
			rls2: pgPolicy('test_A', { as: 'permissive', for: 'select', to: 'public', using: sql`6 + 7 = 13` }),
		})),
		y: pgTable('y', {
			b: integer('b').notNull(),
			d: integer('d').notNull(),
			c: integer('c').notNull(),
			a: integer('a').notNull(),
		}, () => ({
			rls: pgPolicy('test_R', { as: 'permissive', for: 'delete', to: 'public', using: sql`11 + 21 = 32` }),
			rls2: pgPolicy('test_M', {
				as: 'permissive',
				for: 'update',
				to: 'public',
				using: sql`67 + 72 = 143`,
				withCheck: sql`48 + 49 = 147`,
			}),
		})),
	};

	const { statements, sqlStatements, file } = await introspectPgToFile(
		client,
		schema,
		'alphabetical-policy-order-test',
		['public'],
		undefined,
		undefined,
		true,
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements.length).toBe(0);
	if (!file) {
		throw new Error('File is missing');
	}

	const declarations = file.declarations.replace(/^[\t ]+/mg, '').replace(/ {2}/g, ' ').trim();
	const expectedCode = `export const y = pgTable("y", {
a: integer().notNull(),
b: integer().notNull(),
c: integer().notNull(),
d: integer().notNull(),
}, (table) => [
pgPolicy("test_M", { as: "permissive", for: "update", to: ["public"], using: sql\`((67 + 72) = 143)\`, withCheck: sql\`((48 + 49) = 147)\`  }),
pgPolicy("test_R", { as: "permissive", for: "delete", to: ["public"], using: sql\`((11 + 21) = 32)\` }),
]);

export const z = pgTable("z", {
e: integer().notNull(),
f: integer().notNull(),
}, (table) => [
pgPolicy("test_A", { as: "permissive", for: "select", to: ["public"], using: sql\`((6 + 7) = 13)\` }),
pgPolicy("test_B", { as: "permissive", for: "update", to: ["public"], using: sql\`((1 + 2) = 3)\`, withCheck: sql\`((4 + 5) = 9)\`  }),
]);`.replace(/ {2}/g, ' ').trim();

	// This is a crude comparison, but it provides all the assertions needed for the test. The tables, columns and policies are alphabetized
	// and importantly the policies' full `using` and `withCheck` properties are populated. In an attempt to prevent this from failing if there are
	// whitespace changes in the generator, both strings have all double spaces removed and are trimmed. The generated code has leading whitespace removed.
	expect(declarations).toEqual(expectedCode);
});

test('verify that keys are generated in alphabetical order by name but columns are in the order defined by the schema definition', async () => {
	const client = new PGlite();

	const child = pgTable('child', {
		key2: integer('key2').notNull(),
		key1: integer('key1').notNull(),
		keyA: integer('keyA').notNull(),
		keyD: uuid('keyD').notNull(),
		keyC: integer('keyC').notNull(),
	}, (table) => [
		foreignKey({
			columns: [table.key2, table.key1],
			foreignColumns: [parent1.key4, parent1.key3],
			name: 'child_parent1_fkey',
		}),
		foreignKey({
			columns: [table.key2, table.key1],
			foreignColumns: [parent2.key5, parent2.key6],
			name: 'child_parent2_fkey',
		}),
		primaryKey({ columns: [table.key2, table.key1], name: 'child_pkey' }),
		uniqueIndex('child_keyA_uniq').using(
			'btree',
			table.keyA.asc().nullsLast().op('int4_ops'),
		),
		index('child_keyC_keyD').using(
			'btree',
			table.keyC.asc().nullsLast().op('int4_ops'),
			table.keyD.asc().nullsLast().op('uuid_ops'),
		),
	]);

	const parent1 = pgTable('parent1', {
		key4: integer('key4').notNull(),
		key3: integer('key3').notNull(),
	}, (table) => [
		primaryKey({ columns: [table.key4, table.key3], name: 'parent1_pkey' }),
	]);
	const parent2 = pgTable('parent2', {
		key5: integer('key5').notNull(),
		key6: integer('key6').notNull(),
	}, (table) => [
		primaryKey({ columns: [table.key5, table.key6], name: 'parent2_pkey' }),
	]);
	const schema = { child, parent1, parent2 };

	const { statements, sqlStatements, file } = await introspectPgToFile(
		client,
		schema,
		'alphabetical-key-order-test',
		['public'],
		undefined,
		undefined,
		true,
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements.length).toBe(0);
	if (!file) {
		throw new Error('File is missing');
	}

	const declarations = file.declarations.replace(/^[\t ]+/mg, '').replace(/ {2}/g, ' ').trim();
	const expectedCode = `export const child = pgTable("child", {
key1: integer().notNull(),
key2: integer().notNull(),
keyA: integer().notNull(),
keyC: integer().notNull(),
keyD: uuid().notNull(),
}, (table) => [
uniqueIndex("child_keyA_uniq").using("btree", table.keyA.asc().nullsLast().op("int4_ops")),
index("child_keyC_keyD").using("btree", table.keyC.asc().nullsLast().op("int4_ops"), table.keyD.asc().nullsLast().op("uuid_ops")),
foreignKey({
columns: [table.key2, table.key1],
foreignColumns: [parent1.key4, parent1.key3],
name: "child_parent1_fkey"
}),
foreignKey({
columns: [table.key2, table.key1],
foreignColumns: [parent2.key5, parent2.key6],
name: "child_parent2_fkey"
}),
primaryKey({ columns: [table.key2, table.key1], name: "child_pkey"}),
]);

export const parent1 = pgTable("parent1", {
key3: integer().notNull(),
key4: integer().notNull(),
}, (table) => [
primaryKey({ columns: [table.key4, table.key3], name: "parent1_pkey"}),
]);

export const parent2 = pgTable("parent2", {
key5: integer().notNull(),
key6: integer().notNull(),
}, (table) => [
primaryKey({ columns: [table.key5, table.key6], name: "parent2_pkey"}),
]);`.replace(/ {2}/g, ' ').trim();

	// This is a crude comparison, but it provides all the assertions needed for the test. The tables, columns and policies are alphabetized
	// and importantly the policies' full `using` and `withCheck` properties are populated. In an attempt to prevent this from failing if there are
	// whitespace changes in the generator, both strings have all double spaces removed and are trimmed. The generated code has leading whitespace removed.
	expect(declarations).toEqual(expectedCode);
});
