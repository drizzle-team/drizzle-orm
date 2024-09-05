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
	inet,
	integer,
	interval,
	json,
	jsonb,
	macaddr,
	macaddr8,
	numeric,
	pgEnum,
	pgSchema,
	pgTable,
	real,
	serial,
	smallint,
	smallserial,
	text,
	time,
	timestamp,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { introspectPgToFile } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

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
			date1: date('date1').default('2024-01-01'),
			date2: date('date2').defaultNow(),
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

test('introspect check', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable('users', {
			id: serial('id').primaryKey().notNull(),
			name: varchar('name').notNull(),
			age: integer('age'),
		}, (table) => ({
			minimumAgeCheck: check('public_users_minimum_age_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-check',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect check for different schema', async () => {
	const client = new PGlite();

	const schema2 = pgSchema('schema2');
	const schema = {
		schema2,
		users: schema2.table('users', {
			id: serial('id').primaryKey().notNull(),
			name: varchar('name').notNull(),
			age: integer('age'),
		}, (table) => ({
			minimumAgeCheck: check('schema2_users_minimum_age_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-check-for-different-schema',
		['schema2'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('introspect checks with same names across different schema', async () => {
	const client = new PGlite();

	const schema2 = pgSchema('schema2');
	const schema = {
		schema2,
		usersInSchema2: schema2.table('users', {
			id: serial('id').primaryKey().notNull(),
			name: varchar('name').notNull(),
			age: integer('age'),
		}, (table) => ({
			minimumAgeCheck: check('public_users_minimum_age_check', sql`${table.age} > 21`),
		})),
		usersInPublic: pgTable('users', {
			id: serial('id').primaryKey().notNull(),
			name: varchar('name').notNull(),
			age: integer('age'),
		}, (table) => ({
			minimumAgeCheck: check('public_users_minimum_age_check', sql`${table.age} > 21`),
		})),
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-checks-with-same-names-across-different-schema',
		['schema2', 'public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
