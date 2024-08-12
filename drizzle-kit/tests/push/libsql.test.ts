import { createClient } from '@libsql/client';
import chalk from 'chalk';
import {
	blob,
	foreignKey,
	getTableConfig,
	int,
	integer,
	numeric,
	real,
	sqliteTable,
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
		`DROP INDEX IF EXISTS \`customers_address_unique\`;`,
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
		`INSERT INTO \`${table.name}\` ("${schema1.companies.name.name}") VALUES ("drizzle");`,
		`INSERT INTO \`${table.name}\` ("${schema1.companies.name.name}") VALUES ("turso");`,
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
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (1, "drizzle");`,
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (2, "turso");`,
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
	});

	expect(sqlStatements.length).toBe(4);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`companies\` RENAME TO \`__old_push_companies\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`companies\` (
\t\`id\` integer PRIMARY KEY NOT NULL
);\n`,
	);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`companies\`("id") SELECT ("id") FROM \`__old_push_companies\`;`,
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
		companyId: text('company_id').references(() => companies1.id),
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
		companyId: text('company_id').references(() => companies1.id),
	});
	const schema2 = {
		companies: companies2,
		users: users2,
	};

	const { name: usersTableName } = getTableConfig(users1);
	const { name: companiesTableName } = getTableConfig(companies1);
	const seedStatements = [
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ("drizzle");`,
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ("turso");`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES ("1");`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES ("2");`,
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
	});

	expect(sqlStatements.length).toBe(9);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`companies\` RENAME TO \`__old_push_companies\`;`,
	);
	expect(sqlStatements[1]).toBe(
		`CREATE TABLE \`companies\` (
\t\`id\` integer PRIMARY KEY NOT NULL
);
`,
	);
	expect(sqlStatements[2]).toBe(
		`INSERT INTO \`companies\`("id") SELECT ("id") FROM \`__old_push_companies\`;`,
	);
	expect(sqlStatements[3]).toBe(`DROP TABLE \`__old_push_companies\`;`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE \`users\` RENAME TO \`__old_push_users\`;`,
	);
	expect(sqlStatements[5]).toBe(
		`CREATE TABLE \`users\` (
\t\`id\` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
\t\`name\` text,
\t\`company_id\` text,
\tFOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON UPDATE no action ON DELETE no action
);
`,
	);
	expect(sqlStatements[6]).toBe(
		`INSERT INTO \`users\`("id", "name", "company_id") SELECT ("id", "name", "company_id") FROM \`__old_push_users\`;`,
	);
	expect(sqlStatements[7]).toBe(`DROP TABLE \`__old_push_users\`;`);
	expect(sqlStatements[8]).toBe(
		`CREATE UNIQUE INDEX \`users_name_unique\` ON \`users\` (\`name\`);`,
	);

	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);
});

test('create table with custom name references', async (t) => {
	const turso = createClient({
		url: ':memory:',
	});

	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name').notNull(),
	});

	const schema1 = {
		users,
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
				userId: int('user_id'),
			},
			(t) => ({
				fk: foreignKey({
					columns: [t.id],
					foreignColumns: [users.id],
					name: 'custom_name_fk',
				}),
			}),
		),
	};

	const schema2 = {
		users,
		posts: sqliteTable(
			'posts',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				name: text('name'),
				userId: int('user_id'),
			},
			(t) => ({
				fk: foreignKey({
					columns: [t.id],
					foreignColumns: [users.id],
					name: 'custom_name_fk',
				}),
			}),
		),
	};

	const { sqlStatements } = await diffTestSchemasPushLibSQL(
		turso,
		schema1,
		schema2,
		[],
	);

	expect(sqlStatements!.length).toBe(0);
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
		`INSERT INTO \`users\` ("name") VALUES ("drizzle")`,
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
