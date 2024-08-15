import { PGlite } from '@electric-sql/pglite';
import { SQL, sql } from 'drizzle-orm';
import { bigint, bigserial, boolean, char, cidr, date, decimal, doublePrecision, inet, integer, interval, json, jsonb, macaddr, macaddr8, numeric, pgEnum, pgTable, real, serial, smallint, smallserial, text, time, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
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
		// NOTE: Types from extensions aren't tested due to PGLite not supporting at the moment
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
		})
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
		// NOTE: Types from extensions aren't tested due to PGLite not supporting at the moment
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
			uuid: uuid('uuid').array().default(['a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12']),
			inet: inet('inet').array().default(['127.0.0.1', '127.0.0.2']),
			cidr: cidr('cidr').array().default(['127.0.0.1/32', '127.0.0.2/32']),
			macaddr: macaddr('macaddr').array().default(['00:00:00:00:00:00', '00:00:00:00:00:01']),
			macaddr8: macaddr8('macaddr8').array().default(['00:00:00:ff:fe:00:00:00', '00:00:00:ff:fe:00:00:01']),
			interval: interval('interval').array().default(['1 day 01:00:00', '1 day 02:00:00']),
		})
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-all-columns-array-types',
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('instrospect all column types with sql defaults', async () => {
	const client = new PGlite();
	await client.query(`
		CREATE OR REPLACE FUNCTION return_string()
		RETURNS text AS $$
		BEGIN
				RETURN 'abc';
		END;
		$$ LANGUAGE plpgsql;		
	`);
	await client.query(`
		CREATE OR REPLACE FUNCTION return_int()
		RETURNS integer AS $$
		BEGIN
				RETURN 1;
		END;
		$$ LANGUAGE plpgsql;		
	`);
	await client.query(`
		CREATE OR REPLACE FUNCTION return_json()
		RETURNS json AS $$
		BEGIN
				RETURN '{"attr":"value"}'::json;
		END;
		$$ LANGUAGE plpgsql;		
	`);
	await client.query(`
		CREATE OR REPLACE FUNCTION return_int_array()
		RETURNS integer[] AS $$
		BEGIN
				RETURN '{1,2,3}'::integer[];
		END;
		$$ LANGUAGE plpgsql;		
	`);

	const myEnum = pgEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		// NOTE: Types from extensions aren't tested due to PGLite not supporting at the moment
		columns: pgTable('columns', {
			enum: myEnum('my_enum').default(sql`return_string()::my_enum`),
			smallint: smallint('smallint').default(sql`return_int()::smallint`),
			integer: integer('integer').default(sql`return_int()`),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).default(sql`return_int()::numeric`),
			bigint: bigint('bigint', { mode: 'number' }).default(sql`return_int()::bigint`),
			boolean: boolean('boolean').default(sql`return_int()::boolean`),
			text: text('text').default(sql`return_string()`),
			varchar: varchar('varchar', { length: 25 }).default(sql`return_string()::varchar(25)`),
			char: char('char', { length: 3 }).default(sql`return_string()::char(3)`),
			doublePrecision: doublePrecision('doublePrecision').default(sql`return_int()::double precision`),
			real: real('real').default(sql`return_int()::real`),
			json: json('json').$type<{ attr: string }>().default(sql`return_json()`),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default(sql`return_json()::jsonb`),
			time: time('time').default(sql`return_string()::time`),
			timestamp: timestamp('timestamp', { withTimezone: true, precision: 6 }).default(sql`return_string()::timestamp`),
			date: date('date').default(sql`return_string()::date`),
			uuid: uuid('uuid').default(sql`return_string()::uuid`),
			inet: inet('inet').default(sql`return_string()::inet`),
			cidr: cidr('cidr').default(sql`return_string()::cidr`),
			macaddr: macaddr('macaddr').default(sql`return_string()::macaddr`),
			macaddr8: macaddr8('macaddr8').default(sql`return_string()::macaddr8`),
			interval: interval('interval').default(sql`return_string()::interval`),
			array: integer('array').array().default(sql`return_int_array()`),
			nullAsDefault: integer('nullAsDefault').default(sql`null::integer`),
		})
	};

	const { statements, sqlStatements } = await introspectPgToFile(
		client,
		schema,
		'introspect-all-columns-types-with-sql-defaults',
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
