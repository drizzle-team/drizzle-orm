import { createClient } from '@libsql/client';
import chalk from 'chalk';
import { sql } from 'drizzle-orm';
import {
	blob,
	check,
	foreignKey,
	getTableConfig,
	index,
	int,
	integer,
	numeric,
	real,
	sqliteTable,
	sqliteView,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { diffTestSchemasPushLibSQL } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

test('nothing changed in schema', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const users = sqliteTable('users', {
		id: integer('id').primaryKey().notNull(),
		name: text('name').notNull(),
		email: text('email'),
		textJson: text('text_json', { mode: 'json' }),
		blobJon: blob('blob_json', { mode: 'json' }),
		blobBigInt: blob('blob_bigint', { mode: 'bigint' }),
		numeric: numeric('numeric'),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }),
		real: real('real'),
		text: text('text', { length: 255 }),
		role: text('role', { enum: ['admin', 'user'] }).default('user'),
		isConfirmed: integer('is_confirmed', {
			mode: 'boolean',
		}),
	});

	const schema1 = {
		users,

		customers: sqliteTable('customers', {
			id: integer('id').primaryKey(),
			address: text('address').notNull(),
			isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
			registrationDate: integer('registration_date', { mode: 'timestamp_ms' })
				.notNull()
				.$defaultFn(() => new Date()),
			userId: integer('user_id')
				.references(() => users.id)
				.notNull(),
		}),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const {
		sqlStatements,
		statements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(turso, schema1, schema1, [], false);
	expect(sqlStatements.length).toBe(0);
	expect(statements.length).toBe(0);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
});

test('added, dropped index', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const users = sqliteTable('users', {
		id: integer('id').primaryKey().notNull(),
		name: text('name').notNull(),
		email: text('email'),
		textJson: text('text_json', { mode: 'json' }),
		blobJon: blob('blob_json', { mode: 'json' }),
		blobBigInt: blob('blob_bigint', { mode: 'bigint' }),
		numeric: numeric('numeric'),
		createdAt: integer('created_at', { mode: 'timestamp' }),
		createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }),
		real: real('real'),
		text: text('text', { length: 255 }),
		role: text('role', { enum: ['admin', 'user'] }).default('user'),
		isConfirmed: integer('is_confirmed', {
			mode: 'boolean',
		}),
	});

	const schema1 = {
		users,
		customers: sqliteTable(
			'customers',
			{
				id: integer('id').primaryKey(),
				address: text('address').notNull(),
				isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
				registrationDate: integer('registration_date', { mode: 'timestamp_ms' })
					.notNull()
					.$defaultFn(() => new Date()),
				userId: integer('user_id').notNull(),
			},
			(table) => ({
				uniqueIndex: uniqueIndex('customers_address_unique').on(table.address),
			}),
		),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const schema2 = {
		users,
		customers: sqliteTable(
			'customers',
			{
				id: integer('id').primaryKey(),
				address: text('address').notNull(),
				isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
				registrationDate: integer('registration_date', { mode: 'timestamp_ms' })
					.notNull()
					.$defaultFn(() => new Date()),
				userId: integer('user_id').notNull(),
			},
			(table) => ({
				uniqueIndex: uniqueIndex('customers_is_confirmed_unique').on(
					table.isConfirmed,
				),
			}),
		),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const {
		sqlStatements,
		statements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(turso, schema1, schema2, [], false);

	expect(statements.length).toBe(2);
	expect(statements[0]).toStrictEqual({
		type: 'drop_index',
		tableName: 'customers',
		data: 'customers_address_unique;address;true;',
		schema: '',
	});
	expect(statements[1]).toStrictEqual({
		type: 'create_index',
		tableName: 'customers',
		data: 'customers_is_confirmed_unique;is_confirmed;true;',
		schema: '',
		internal: { indexes: {} },
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(
		`DROP INDEX \`customers_address_unique\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE UNIQUE INDEX \`customers_is_confirmed_unique\` ON \`customers\` (\`is_confirmed\`);`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('added column not null and without default to table with data', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
			age: integer('age').notNull(),
		}),
	};

	const table = getTableConfig(schema1.companies);

	const seedStatements = [
		`INSERT INTO \`${table.name}\` ("${schema1.companies.name.name}") VALUES ('drizzle');`,
		`INSERT INTO \`${table.name}\` ("${schema1.companies.name.name}") VALUES ('turso');`,
	];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		seedStatements,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'companies',
		column: {
			name: 'age',
			type: 'integer',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
		referenceData: undefined,
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`delete from companies;`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`companies\` ADD \`age\` integer NOT NULL;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(
		`· You're about to add not-null ${
			chalk.underline(
				'age',
			)
		} column without default value, which contains 2 items`,
	);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(1);
	expect(tablesToTruncate![0]).toBe('companies');
});

test('added column not null and without default to table without data', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey(),
			name: text('name').notNull(),
			age: integer('age').notNull(),
		}),
	};

	const {
		sqlStatements,
		statements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(turso, schema1, schema2, [], false);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'sqlite_alter_table_add_column',
		tableName: 'companies',
		column: {
			name: 'age',
			type: 'integer',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
		referenceData: undefined,
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`companies\` ADD \`age\` integer NOT NULL;`,
	);

	expect(infoToPrint!.length).toBe(0);
	expect(columnsToRemove!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('drop autoincrement. drop column with data', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey({ autoIncrement: false }),
		}),
	};

	const table = getTableConfig(schema1.companies);
	const seedStatements = [
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (1, 'drizzle');`,
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (2, 'turso');`,
	];

	const {
		sqlStatements,
		statements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		seedStatements,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		tableName: 'companies',
		columns: [
			{
				name: 'id',
				type: 'integer',
				autoincrement: false,
				notNull: true,
				primaryKey: true,
				generated: undefined,
			},
		],
		compositePKs: [],
		referenceData: [],
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`CREATE TABLE \`__new_companies\` (
\t\`id\` integer PRIMARY KEY NOT NULL
);\n`,
	);
	expect(sqlStatements[1]).toBe(`INSERT INTO \`__new_companies\`("id") SELECT "id" FROM \`companies\`;`);
	expect(sqlStatements[2]).toBe(`DROP TABLE \`companies\`;`);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE \`__new_companies\` RENAME TO \`companies\`;`,
	);

	expect(columnsToRemove!.length).toBe(1);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(
		`· You're about to delete ${
			chalk.underline(
				'name',
			)
		} column in companies table with 2 items`,
	);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('change autoincrement. table is part of foreign key', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const companies1 = sqliteTable('companies', {
		id: integer('id').primaryKey({ autoIncrement: true }),
	});
	const users1 = sqliteTable('users', {
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').unique(),
		companyId: integer('company_id').references(() => companies1.id),
	});
	const schema1 = {
		companies: companies1,
		users: users1,
	};

	const companies2 = sqliteTable('companies', {
		id: integer('id').primaryKey({ autoIncrement: false }),
	});
	const users2 = sqliteTable('users', {
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').unique(),
		companyId: integer('company_id').references(() => companies2.id),
	});
	const schema2 = {
		companies: companies2,
		users: users2,
	};

	const { name: usersTableName } = getTableConfig(users1);
	const { name: companiesTableName } = getTableConfig(companies1);
	const seedStatements = [
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ('drizzle');`,
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ('turso');`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES (1);`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES (2);`,
	];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		seedStatements,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'recreate_table',
		tableName: 'companies',
		columns: [
			{
				name: 'id',
				type: 'integer',
				autoincrement: false,
				notNull: true,
				primaryKey: true,
				generated: undefined,
			},
		],
		compositePKs: [],
		referenceData: [],
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`CREATE TABLE \`__new_companies\` (
\t\`id\` integer PRIMARY KEY NOT NULL
);\n`,
	);
	expect(sqlStatements[1]).toBe(
		`INSERT INTO \`__new_companies\`("id") SELECT "id" FROM \`companies\`;`,
	);
	expect(sqlStatements[2]).toBe(`DROP TABLE \`companies\`;`);
	expect(sqlStatements[3]).toBe(
		`ALTER TABLE \`__new_companies\` RENAME TO \`companies\`;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('drop not null, add not null', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name').notNull(),
				userId: int('user_id'),
			},
		),
	};
	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements!.length).toBe(2);
	expect(statements![0]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnName: 'name',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'users',
		type: 'alter_table_alter_column_drop_notnull',
	});
	expect(statements![1]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnName: 'name',
		columnNotNull: true,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'posts',
		type: 'alter_table_alter_column_set_notnull',
	});
	expect(sqlStatements!.length).toBe(2);
	expect(sqlStatements![0]).toBe(`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text;`);
	expect(sqlStatements![1]).toBe(`ALTER TABLE \`posts\` ALTER COLUMN "name" TO "name" text NOT NULL;`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('drop table with data', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const schema2 = {
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const seedStatements = [
		`INSERT INTO \`users\` ("name") VALUES ('drizzle')`,
	];
	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		seedStatements,
	);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		policies: [],
		schema: undefined,
		tableName: 'users',
		type: 'drop_table',
	});

	expect(sqlStatements!.length).toBe(1);
	expect(sqlStatements![0]).toBe(`DROP TABLE \`users\`;`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(`· You're about to delete ${chalk.underline('users')} table with 1 items`);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(1);
	expect(tablesToRemove![0]).toBe('users');
	expect(tablesToTruncate!.length).toBe(0);
});

test('recreate table with nested references', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	let users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
		age: integer('age'),
	});
	let subscriptions = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users.id),
		customerId: text('customer_id'),
	});
	const schema1 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		name: text('name'),
		age: integer('age'),
	});
	const schema2 = {
		users: users,
		subscriptions: subscriptions,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(
				() => subscriptions.id,
			),
		}),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(turso, schema1, schema2, []);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				name: 'id',
				notNull: true,
				generated: undefined,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'name',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				name: 'age',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements!.length).toBe(4);
	expect(sqlStatements![0]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer
);\n`);
	expect(sqlStatements![1]).toBe(
		`INSERT INTO \`__new_users\`("id", "name", "age") SELECT "id", "name", "age" FROM \`users\`;`,
	);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![3]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('recreate table with added column not null and without default', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			age: integer('age'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
			newColumn: text('new_column').notNull(),
		}),
	};

	const seedStatements = [
		`INSERT INTO \`users\` ("name", "age") VALUES ('drizzle', 12)`,
		`INSERT INTO \`users\` ("name", "age") VALUES ('turso', 12)`,
	];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		seedStatements,
	);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				name: 'id',
				notNull: true,
				generated: undefined,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'name',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				name: 'age',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'new_column',
				notNull: true,
				generated: undefined,
				primaryKey: false,
				type: 'text',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements!.length).toBe(4);
	expect(sqlStatements[0]).toBe('DELETE FROM \`users\`;');
	expect(sqlStatements![1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer,
\t\`new_column\` text NOT NULL
);\n`);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![3]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(
		`· You're about to add not-null ${
			chalk.underline('new_column')
		} column without default value to table, which contains 2 items`,
	);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(1);
	expect(tablesToTruncate![0]).toBe('users');
});

test('set not null with index', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}, (table) => ({
			someIndex: index('users_name_index').on(table.name),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}, (table) => ({
			someIndex: index('users_name_index').on(table.name),
		})),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		columnAutoIncrement: false,
		columnDefault: undefined,
		columnName: 'name',
		columnNotNull: true,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		schema: '',
		tableName: 'users',
		type: 'alter_table_alter_column_set_notnull',
	});

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_set_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: true,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(3);
	expect(sqlStatements[0]).toBe(
		`DROP INDEX "users_name_index";`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text NOT NULL;`,
	);
	expect(sqlStatements[2]).toBe(
		`CREATE INDEX \`users_name_index\` ON \`users\` (\`name\`);`,
	);
	expect(columnsToRemove!.length).toBe(0), expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('drop not null with two indexes', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			age: int('age').notNull(),
		}, (table) => ({
			someUniqeIndex: uniqueIndex('users_name_unique').on(table.name),
			someIndex: index('users_age_index').on(table.age),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			age: int('age').notNull(),
		}, (table) => ({
			someUniqeIndex: uniqueIndex('users_name_unique').on(table.name),
			someIndex: index('users_age_index').on(table.age),
		})),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_alter_column_drop_notnull',
		tableName: 'users',
		columnName: 'name',
		schema: '',
		newDataType: 'text',
		columnDefault: undefined,
		columnOnUpdate: undefined,
		columnNotNull: false,
		columnAutoIncrement: false,
		columnPk: false,
	});

	expect(sqlStatements.length).toBe(5);
	expect(sqlStatements[0]).toBe(
		`DROP INDEX "users_name_unique";`,
	);
	expect(sqlStatements[1]).toBe(
		`DROP INDEX "users_age_index";`,
	);
	expect(sqlStatements[2]).toBe(
		`ALTER TABLE \`users\` ALTER COLUMN "name" TO "name" text;`,
	);
	expect(sqlStatements[3]).toBe(
		`CREATE UNIQUE INDEX \`users_name_unique\` ON \`users\` (\`name\`);`,
	);
	expect(sqlStatements[4]).toBe(
		`CREATE INDEX \`users_age_index\` ON \`users\` (\`age\`);`,
	);
	expect(columnsToRemove!.length).toBe(0), expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('add check constraint to table', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				name: 'id',
				notNull: true,
				generated: undefined,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'name',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				name: 'age',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: ['some_check;"users"."age" > 21'],
	});

	expect(sqlStatements!.length).toBe(4);
	expect(sqlStatements![0]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer,
\tCONSTRAINT "some_check" CHECK("__new_users"."age" > 21)
);\n`);
	expect(sqlStatements[1]).toBe(
		'INSERT INTO `__new_users`("id", "name", "age") SELECT "id", "name", "age" FROM `users`;',
	);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![3]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('drop check constraint', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements!.length).toBe(1);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				name: 'id',
				notNull: true,
				generated: undefined,
				primaryKey: true,
				type: 'integer',
			},
			{
				autoincrement: false,
				name: 'name',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				name: 'age',
				notNull: false,
				generated: undefined,
				primaryKey: false,
				type: 'integer',
			},
		],
		compositePKs: [],
		referenceData: [],
		tableName: 'users',
		type: 'recreate_table',
		uniqueConstraints: [],
		checkConstraints: [],
	});

	expect(sqlStatements!.length).toBe(4);
	expect(sqlStatements![0]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` integer PRIMARY KEY NOT NULL,
\t\`name\` text,
\t\`age\` integer
);\n`);
	expect(sqlStatements[1]).toBe(
		'INSERT INTO `__new_users`("id", "name", "age") SELECT "id", "name", "age" FROM `users`;',
	);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![3]).toBe(
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('db has checks. Push with same names', async () => {
	const turso = createClient({
		url: ':memory:',
	});

	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`${table.age} > 21`),
		})),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: false }),
			name: text('name'),
			age: integer('age'),
		}, (table) => ({
			someCheck: check('some_check', sql`some new value`),
		})),
	};

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
		false,
		[],
	);
	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('create view', async () => {
	const turso = createClient({
		url: ':memory:',
	});

	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements).toStrictEqual([
		{
			definition: 'select "id" from "test"',
			name: 'view',
			type: 'sqlite_create_view',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`CREATE VIEW \`view\` AS select "id" from "test";`,
	]);
});

test('drop view', async () => {
	const turso = createClient({
		url: ':memory:',
	});

	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			type: 'drop_view',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'DROP VIEW \`view\`;',
	]);
});

test('alter view ".as"', async () => {
	const turso = createClient({
		url: ':memory:',
	});

	const table = sqliteTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table).where(sql`${table.id} = 1`)),
	};

	const schema2 = {
		test: table,
		view: sqliteView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});
