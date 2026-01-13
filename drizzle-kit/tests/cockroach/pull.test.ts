import { SQL, sql } from 'drizzle-orm';
import {
	AnyCockroachColumn,
	bigint,
	bit,
	bool,
	char,
	check,
	cockroachEnum,
	cockroachMaterializedView,
	cockroachRole,
	cockroachSchema,
	cockroachTable,
	cockroachView,
	date,
	decimal,
	doublePrecision,
	float,
	geometry,
	index,
	inet,
	int4,
	interval,
	jsonb,
	numeric,
	real,
	smallint,
	string,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varbit,
	varchar,
} from 'drizzle-orm/cockroach-core';
import { fromDatabaseForDrizzle } from 'src/dialects/cockroach/introspect';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { diffIntrospect, push, test } from 'tests/cockroach/mocks';
import { expect } from 'vitest';

test.concurrent('basic introspect test', async ({ dbc: db }) => {
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

test.concurrent('basic identity always test', async ({ dbc: db }) => {
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

test.concurrent('basic identity by default test', async ({ dbc: db }) => {
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

test.concurrent('basic index test', async ({ dbc: db }) => {
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

test.concurrent('identity always test: few params', async ({ dbc: db }) => {
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

test.concurrent('identity by default test: few params', async ({ dbc: db }) => {
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

test.concurrent('identity always test: all params', async ({ dbc: db }) => {
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

test.concurrent('identity by default test: all params', async ({ dbc: db }) => {
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

test.concurrent('generated column: link to another column', async ({ dbc: db }) => {
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

test.concurrent('introspect all column types', async ({ dbc: db }) => {
	const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		columns: cockroachTable('columns', {
			bigint: bigint('bigint', { mode: 'number' }).default(100),
			bool: bool('bool').default(true),
			geometry: geometry({ srid: 213, mode: 'tuple' }),
			char: char('char', { length: 3 }).default('abc'),
			date1: date('date1').default('2024-01-01'),
			date2: date('date2').defaultNow(),
			date3: date('date3').default(sql`current_timestamp`),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).default('99.9'),
			numeric2: numeric('numeric2', { precision: 1, scale: 1 }).default('0.9'),
			numeric3: numeric('numeric3').default('99.9'),
			decimal: decimal('decimal', { precision: 3, scale: 1 }).default('99.9'),
			decimal2: decimal('decimal2', { precision: 1, scale: 1 }).default('0.9'),
			decimal3: decimal('decimal3').default('99.9'),
			enum: myEnum('my_enum').default('a'),
			bit: bit('bit').default('1'),
			varit: varbit('varbit').default('1'),
			float: float('float').default(100),
			doublePrecision: doublePrecision('doublePrecision').default(100),
			inet: inet('inet').default('127.0.0.1'),
			int4: int4('int4').default(10),
			interval: interval('interval').default('1 day 01:00:00'),
			jsonb: jsonb('jsonb').$type<{ attr: string }>().default({ attr: 'value' }),
			real: real('real').default(100),
			smallint: smallint('smallint').default(10),
			string: string('string').default('value'),
			text: text('test').default('abc'),
			time1: time('time1').default('00:00:00'),
			timestamp1: timestamp('timestamp1', { withTimezone: true, precision: 6 }).default(new Date()),
			timestamp2: timestamp('timestamp2', { withTimezone: true, precision: 6 }).defaultNow(),
			timestamp3: timestamp('timestamp3', { withTimezone: true, precision: 6 }).default(
				sql`timezone('utc'::text, now())`,
			),
			uuid1: uuid('uuid1').default('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'),
			uuid2: uuid('uuid2').defaultRandom(),
			varchar: varchar('varchar', { length: 25 }).default('abc'),
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

test.concurrent('introspect all column array types', async ({ dbc: db }) => {
	const myEnum = cockroachEnum('my_enum', ['a', 'b', 'c']);
	const schema = {
		enum_: myEnum,
		columns: cockroachTable('columns', {
			bigint: bigint('bigint', { mode: 'number' }).default(100).array(),
			bit: bit().array(),
			varbit: varbit().array(),
			geometry: geometry().array(),
			bool: bool('bool').default(true).array(),
			char: char('char', { length: 3 }).default('abc').array(),
			date1: date('date1').default('2024-01-01').array(),
			date2: date('date2').defaultNow().array(),
			date3: date('date3').default(sql`current_timestamp`).array(),
			numeric: numeric('numeric', { precision: 3, scale: 1 }).default('99.9').array(),
			numeric2: numeric('numeric2', { precision: 1, scale: 1 }).default('0.9').array(),
			numeric3: numeric('numeric3').default('99.9').array(),
			decimal: decimal('decimal', { precision: 3, scale: 1 }).default('99.9').array(),
			decimal2: decimal('decimal2', { precision: 1, scale: 1 }).default('0.9').array(),
			decimal3: decimal('decimal3').default('99.9').array(),
			enum: myEnum('my_enum').default('a').array(),
			float: float('float').default(100).array(),
			doublePrecision: doublePrecision('doublePrecision').default(100).array(),
			inet: inet('inet').default('127.0.0.1').array(),
			int4: int4('int4').default(10).array(),
			interval: interval('interval').default('1 day 01:00:00').array(),
			real: real('real').default(100).array(),
			smallint: smallint('smallint').default(10).array(),
			string: string('string').default('value').array(),
			text: text('test').default('abc').array(),
			time1: time('time1').default('00:00:00').array(),
			timestamp1: timestamp('timestamp1', { withTimezone: true, precision: 6 }).default(new Date()).array(),
			timestamp2: timestamp('timestamp2', { withTimezone: true, precision: 6 }).defaultNow().array(),
			timestamp3: timestamp('timestamp3', { withTimezone: true, precision: 6 }).default(
				sql`timezone('utc'::text, now())`,
			).array(),
			uuid1: uuid('uuid1').default('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11').array(),
			uuid2: uuid('uuid2').defaultRandom().array(),
			varchar: varchar('varchar', { length: 25 }).default('abc').array(),
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

test.concurrent('introspect columns with name with non-alphanumeric characters', async ({ dbc: db }) => {
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

test.concurrent('introspect enum from different schema', async ({ dbc: db }) => {
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

test.concurrent('introspect enum with same names across different schema', async ({ dbc: db }) => {
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

test.concurrent('introspect enum with similar name to native type', async ({ dbc: db }) => {
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

test.concurrent('introspect strings with single quotes', async ({ dbc: db }) => {
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

test.concurrent('introspect checks', async ({ dbc: db }) => {
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

test.concurrent('introspect checks from different schemas with same names', async ({ dbc: db }) => {
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

test.concurrent('introspect view #1', async ({ dbc: db }) => {
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

test.concurrent('introspect view #2', async ({ dbc: db }) => {
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

test.concurrent('introspect view in other schema', async ({ dbc: db }) => {
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
		['new_schema', 'public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test.concurrent('introspect materialized view in other schema', async ({ db }) => {
	const newSchema = cockroachSchema('new_schema');
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		name: varchar(),
	});

	const view = newSchema.materializedView('some_view', { id: int4() }).as(
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
		['new_schema', 'public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test.concurrent('introspect materialized view #1', async ({ db }) => {
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

test.concurrent('introspect materialized view #2', async ({ db }) => {
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

test.concurrent('basic roles', async ({ dbc: db }) => {
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

test.concurrent('role with properties', async ({ dbc: db }) => {
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

test.concurrent('role with a few properties', async ({ dbc: db }) => {
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

test.concurrent('case sensitive schema name + identity column', async ({ dbc: db }) => {
	const mySchema = cockroachSchema('CaseSensitiveSchema');
	const schema = {
		mySchema,
		users: mySchema.table('users', {
			id: int4('id').primaryKey().generatedAlwaysAsIdentity(),
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

test.concurrent('introspect foreign keys', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4('id').primaryKey(),
		name: text('name'),
	});
	const schema = {
		users,
		posts: cockroachTable('posts', {
			id: int4('id').primaryKey(),
			userId: int4('user_id').references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),
		}),
	};
	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-foreign-keys');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test.concurrent('introspect table with self reference', async ({ dbc: db }) => {
	const users = cockroachTable('users', {
		id: int4().primaryKey(),
		name: text(),
		invited_id: int4().references((): AnyCockroachColumn => users.id),
	});
	const schema = { users };
	const { statements, sqlStatements } = await diffIntrospect(db, schema, 'introspect-self-ref');

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/5053
test.concurrent('single quote default', async ({ dbc: db }) => {
	const group = cockroachTable('group', {
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

// https://github.com/drizzle-team/drizzle-orm/issues/5193
test('check definition', async ({ db }) => {
	const table1 = cockroachTable('table1', {
		column1: int4().primaryKey(),
	}, (t) => [check('check_positive', sql`${t.column1} > 0`)]);
	const schema = { table1 };
	await push({ db, to: schema });

	const filter = prepareEntityFilter('cockroach', {
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
test('pull after migrate with custom migrations table #1', async ({ db }) => {
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

	const filter = prepareEntityFilter('cockroach', {
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
test('pull after migrate with custom migrations table #2', async ({ db }) => {
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

	const filter = prepareEntityFilter('cockroach', {
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
test('pull after migrate with custom migrations table #3', async ({ db }) => {
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

	const filter = prepareEntityFilter('cockroach', {
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
			schema: 'public',
			table: 'users',
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
	]);
});
