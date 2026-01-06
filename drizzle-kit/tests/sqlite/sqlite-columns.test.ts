import { sql } from 'drizzle-orm';
import {
	AnySQLiteColumn,
	blob,
	foreignKey,
	getTableConfig,
	index,
	int,
	integer,
	numeric,
	primaryKey,
	real,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { diff, prepareTestDatabase, push, TestDatabase } from './mocks';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: TestDatabase['db'];

beforeAll(() => {
	_ = prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

test('create table with id', async (t) => {
	const schema = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements: st } = await diff({}, schema, []);

	const { sqlStatements: pst } = await push({ db, to: schema });

	const st0: string[] = [`CREATE TABLE \`users\` (\n\t\`id\` integer PRIMARY KEY AUTOINCREMENT\n);\n`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [`ALTER TABLE \`users\` ADD \`name\` text NOT NULL;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `name` text;',
		'ALTER TABLE `users` ADD `email` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #3', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name1: text('name1').default('name'),
			name2: text('name2').notNull(),
			name3: text('name3').default('name').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		"ALTER TABLE `users` ADD `name1` text DEFAULT 'name';",
		'ALTER TABLE `users` ADD `name2` text NOT NULL;',
		"ALTER TABLE `users` ADD `name3` text DEFAULT 'name' NOT NULL;",
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #4', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name', { enum: ['one', 'two'] }),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE `users` ADD `name` text;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #5', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
	});

	const schema2 = {
		users,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `report_to` integer REFERENCES users(id);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #6', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
			password: text('password').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE `users` ADD `password` text NOT NULL;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('added column not null and without default to table with data', async (t) => {
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.run(`INSERT INTO \`companies\` ("name") VALUES ('drizzle');`);
	await db.run(`INSERT INTO \`companies\` ("name") VALUES ('turso');`);

	const { sqlStatements: pst, hints: phints, error } = await push({
		db,
		to: schema2,
		expectError: true,
		force: true,
	});

	const st0: string[] = [`ALTER TABLE \`companies\` ADD \`age\` integer NOT NULL;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints[0].statement).toStrictEqual('DELETE FROM "companies" where true;');
	expect(error).toBeNull();

	// TODO: check truncations
});

test('added column not null and without default to table without data', async (t) => {
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [`ALTER TABLE \`companies\` ADD \`age\` integer NOT NULL;`];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('add generated stored column', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'stored' }),
		}),
	};
	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS (123) STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/1313#issuecomment-2753097290
test('add a generated stored column and rename the existing one', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id1'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'stored' }),
		}),
	};
	const renames = ['users.id->users.id1'];
	const { sqlStatements: st } = await diff(from, to, renames);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `id` TO `id1`;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id1` integer,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS (123) STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id1`) SELECT `id1` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add generated virtual column', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'virtual' }),
		}),
	};
	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (123) VIRTUAL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column make generated', async (t) => {
	const from = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name'),
		}),
	};
	const to = {
		users: sqliteTable('users', {
			id: int('id'),
			generatedName: text('gen_name').generatedAlwaysAs(sql`123`, { mode: 'stored' }),
		}),
	};
	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer,\n'
		+ '\t`gen_name` text GENERATED ALWAYS AS (123) STORED\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`) SELECT `id` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add columns #6', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email').unique().notNull(),
			password: text('password').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE `users` ADD `password` text NOT NULL;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/4217
test('add column with .notNull and .default', async () => {
	const schema1 = {
		table1: sqliteTable('table1', {
			col1: integer(),
		}),
	};

	const { next: n1 } = await diff({}, schema1, []);
	await push({ db, to: schema1 });

	await db.run('insert into `table1` values (1);');
	const schema2 = {
		table1: sqliteTable('table1', {
			col1: integer(),
			col2: integer({ mode: 'boolean' }).notNull().default(false),
		}),
	};

	const { sqlStatements: st2 } = await diff(n1, schema2, []);
	const { sqlStatements: pst2 } = await push({ db, to: schema2 });
	const expectedSt2 = [
		'ALTER TABLE `table1` ADD `col2` integer DEFAULT false NOT NULL;',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
	const res = await db.query('select * from `table1`;');
	expect(res).toStrictEqual([{ col1: 1, col2: 0 }]);
});

test('drop column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer('id').primaryKey({ autoIncrement: true }),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['ALTER TABLE `users` DROP COLUMN `name`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename column', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: integer().primaryKey({ autoIncrement: true }),
			name: text(),
			email: text(),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: integer().primaryKey({ autoIncrement: true }),
			name: text(),
			email: text('email2'),
		}),
	};

	const renames = ['users.email->users.email2'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = ['ALTER TABLE `users` RENAME COLUMN `email` TO `email2`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename column and change data type', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			age: integer('age'),
		}),
	};

	const renames = ['users.name->users.age'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `name` TO `age`;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`age` integer\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `age`) SELECT `id`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('add index #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
		}),
	};

	const users = sqliteTable(
		'users',
		{
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
		},
		(t) => [
			index('reportee_idx').on(t.reporteeId),
		],
	);

	const schema2 = {
		users,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	// await push({ db, to: schema1 });
	// const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ['CREATE INDEX `reportee_idx` ON `users` (`report_to`);'];
	expect(st).toStrictEqual(st0);
	// expect(pst).toStrictEqual(st0);
});

test('dropped, added unique index', async (t) => {
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
		isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
	});

	const schema1 = {
		users,
		customers: sqliteTable('customers', {
			id: integer('id').primaryKey(),
			address: text('address').notNull().unique(),
			isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
			registrationDate: integer('registration_date', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
			userId: integer('user_id').notNull(),
		}, (table) => [uniqueIndex('customers_address_unique').on(table.address)]),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const schema2 = {
		users,
		customers: sqliteTable('customers', {
			id: integer('id').primaryKey(),
			address: text('address').notNull(),
			isConfirmed: integer('is_confirmed', { mode: 'boolean' }),
			registrationDate: integer('registration_date', { mode: 'timestamp_ms' })
				.notNull()
				.$defaultFn(() => new Date()),
			userId: integer('user_id').notNull(),
		}, (table) => [
			uniqueIndex('customers_is_confirmed_unique').on(
				table.isConfirmed,
			),
		]),

		posts: sqliteTable('posts', {
			id: integer('id').primaryKey(),
			content: text('content'),
			authorId: integer('author_id'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		`DROP INDEX IF EXISTS \`customers_address_unique\`;`,
		`CREATE UNIQUE INDEX \`customers_is_confirmed_unique\` ON \`customers\` (\`is_confirmed\`);`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('drop autoincrement. drop column with data', async (t) => {
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

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.run(
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (1, 'drizzle');`,
	);
	await db.run(
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (2, 'turso');`,
	);

	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_companies` (\n\t`id` integer PRIMARY KEY\n);\n',
		'INSERT INTO `__new_companies`(`id`) SELECT `id` FROM `companies`;',
		'DROP TABLE `companies`;',
		'ALTER TABLE `__new_companies` RENAME TO `companies`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints[0].hint).toStrictEqual("· You're about to drop 'name' column(s) in a non-empty 'companies' table");
});

test('drop autoincrement. drop column with data with pragma off', async (t) => {
	await db.run('PRAGMA foreign_keys=OFF;');

	const users = sqliteTable('users', {
		id: integer('id').primaryKey({ autoIncrement: true }),
	});
	const schema1 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			user_id: integer('user_id').references(() => users.id),
		}),
	};

	const schema2 = {
		companies: sqliteTable('companies', {
			id: integer('id').primaryKey({ autoIncrement: false }),
			user_id: integer('user_id').references(() => users.id),
		}),
	};

	const table = getTableConfig(schema1.companies);

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	await db.run(
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (1, 'drizzle');`,
	);
	await db.run(
		`INSERT INTO \`${table.name}\` ("${schema1.companies.id.name}", "${schema1.companies.name.name}") VALUES (2, 'turso');`,
	);

	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_companies` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`user_id` integer,\n'
		+ '\tCONSTRAINT `fk_companies_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)\n'
		+ ');\n',
		'INSERT INTO `__new_companies`(`id`, `user_id`) SELECT `id`, `user_id` FROM `companies`;',
		'DROP TABLE `companies`;',
		'ALTER TABLE `__new_companies` RENAME TO `companies`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	expect(phints[0].hint).toStrictEqual("· You're about to drop 'name' column(s) in a non-empty 'companies' table");
});

test('change autoincrement. other table references current', async (t) => {
	const companies1 = sqliteTable('companies', {
		id: integer('id').primaryKey({ autoIncrement: true }),
	});
	const companies2 = sqliteTable('companies', {
		id: integer('id').primaryKey({ autoIncrement: false }),
	});

	const users1 = sqliteTable('users', {
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').unique(),
		companyId: text('company_id').references(() => companies1.id),
	});

	const users2 = sqliteTable('users', {
		id: integer('id').primaryKey({ autoIncrement: true }),
		name: text('name').unique(),
		companyId: text('company_id').references(() => companies2.id),
	});

	const schema1 = {
		companies: companies1,
		users: users1,
	};

	const schema2 = {
		companies: companies2,
		users: users2,
	};

	const { name: usersTableName } = getTableConfig(users1);
	const { name: companiesTableName } = getTableConfig(companies1);
	const seedStatements = [
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ('drizzle');`,
		`INSERT INTO \`${usersTableName}\` ("${schema1.users.name.name}") VALUES ('turso');`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES ('1');`,
		`INSERT INTO \`${companiesTableName}\` ("${schema1.companies.id.name}") VALUES ('2');`,
	];

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	for (const seedSt of seedStatements) {
		await db.run(seedSt);
	}

	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		`PRAGMA foreign_keys=OFF;`,
		`CREATE TABLE \`__new_companies\` (
\t\`id\` integer PRIMARY KEY
);\n`,
		`INSERT INTO \`__new_companies\`(\`id\`) SELECT \`id\` FROM \`companies\`;`,
		`DROP TABLE \`companies\`;`,
		`ALTER TABLE \`__new_companies\` RENAME TO \`companies\`;`,
		`PRAGMA foreign_keys=ON;`,
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('create composite primary key', async (t) => {
	const schema1 = {};

	const schema2 = {
		table: sqliteTable('table', {
			col1: integer('col1').notNull(),
			col2: integer('col2').notNull(),
		}, (t) => [primaryKey({
			columns: [t.col1, t.col2],
		})]),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		'CREATE TABLE `table` (\n\t`col1` integer NOT NULL,\n\t`col2` integer NOT NULL,\n\tCONSTRAINT \`table_pk\` PRIMARY KEY(`col1`, `col2`)\n);\n',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('add foreign key #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to'),
		}),
	};

	const users = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		reporteeId: int('report_to').references((): AnySQLiteColumn => users.id),
	});

	const schema2 = {
		users,
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`report_to` integer,\n'
		+ '\tCONSTRAINT `fk_users_report_to_users_id_fk` FOREIGN KEY (`report_to`) REFERENCES `users`(`id`)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `report_to`) SELECT `id`, `report_to` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('add foreign key #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			reporteeId: int('report_to'),
		}),
	};

	const schema2 = {
		users: sqliteTable(
			'users',
			{
				id: int('id').primaryKey({ autoIncrement: true }),
				reporteeId: int('report_to'),
			},
			(t) => [foreignKey({
				columns: [t.reporteeId],
				foreignColumns: [t.id],
				name: 'reportee_fk',
			})],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`report_to` integer,\n'
		+ '\tCONSTRAINT `reportee_fk` FOREIGN KEY (`report_to`) REFERENCES `users`(`id`)\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `report_to`) SELECT `id`, `report_to` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column rename #1', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
		}),
	};

	const renames = ['users.name->users.name1'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = ['ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column rename #2', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
			email: text('email'),
		}),
	};

	const renames = ['users.name->users.name1'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
		'ALTER TABLE `users` ADD `email` text;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column rename #3', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name1'),
		}),
	};

	const renames = ['users.name->users.name1'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
		'ALTER TABLE `users` DROP COLUMN `email`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column rename #4', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			email: text('email'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name2'),
			email: text('email2'),
		}),
	};

	const renames = [
		'users.name->users.name2',
		'users.email->users.email2',
	];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name2`;',
		'ALTER TABLE `users` RENAME COLUMN `email` TO `email2`;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('rename column in composite pk', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int(),
			id2: int(),
			name: text('name'),
		}, (t) => [primaryKey({ columns: [t.id, t.id2] })]),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int(),
			id3: int(),
			name: text('name'),
		}, (t) => [primaryKey({ columns: [t.id, t.id3] })]),
	};

	const renames = ['users.id2->users.id3'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = ['ALTER TABLE `users` RENAME COLUMN `id2` TO `id3`;'];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column rename + alter type', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: int('name1'),
		}),
	};

	const renames = ['users.name->users.name1'];
	const { sqlStatements: st } = await diff(schema1, schema2, renames);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2, renames });

	const st0: string[] = [
		'ALTER TABLE `users` RENAME COLUMN `name` TO `name1`;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`name1` integer\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name1`) SELECT `id`, `name1` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter table add composite pk', async (t) => {
	const schema1 = {
		table: sqliteTable('table', {
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const schema2 = {
		table: sqliteTable(
			'table',
			{
				id1: integer('id1'),
				id2: integer('id2'),
			},
			(t) => [primaryKey({ columns: [t.id1, t.id2] })],
		),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n'
		+ '\t`id1` integer,\n'
		+ '\t`id2` integer,\n'
		+ '\tCONSTRAINT \`table_pk\` PRIMARY KEY(`id1`, `id2`)\n'
		+ ');\n',
		'INSERT INTO `__new_table`(`id1`, `id2`) SELECT `id1`, `id2` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column drop not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').notNull(),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column add not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n\t`name` text NOT NULL\n);\n',
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column add default', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').default('dan'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan'\n);\n",
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/2095
test('alter column add default #2', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text(),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text().default('dan'),
			age: integer(),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` ADD `age` integer;',
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan',\n\t`age` integer\n);\n",
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column drop default', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').default('dan'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column add default not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// I'm not sure if this is the correct test case
// it is expected to get an error since column cannot be altered to not null when there is existing data that violates this constraint
test('alter column add default not null to table with data', async (t) => {
	const from = {
		users: sqliteTable('table', {
			id: integer('id').primaryKey(),
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			id: integer('id').primaryKey(),
			name: text('name').notNull().default('dan'),
		}),
	};

	const { sqlStatements: st } = await diff(from, to, []);

	await push({ db, to: from });
	await db.run('insert into `table`(`id`) values (1);');
	await db.run("insert into `table`(`id`,`name`) values (2,'alex');");
	const { sqlStatements: pst } = await push({ db, to, expectError: true, ignoreSubsequent: true });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`id` integer PRIMARY KEY,\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
		'INSERT INTO `__new_table`(`id`, `name`) SELECT `id`, `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	// const res = await db.query('select * from `table`;');
	// expect(res).toStrictEqual([
	// 	{ id: 1, name: 'dan' },
	// 	{ id: 2, name: 'alex' },
	// ]);
});

test('alter column add default not null with indexes', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}, (table) => [index('index_name').on(table.name)]),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}, (table) => [index('index_name').on(table.name)]),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
		'CREATE INDEX `index_name` ON `table` (`name`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column add default not null with indexes #2', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}, (table) => [index('index_name').on(table.name)]),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		"CREATE TABLE `__new_table` (\n\t`name` text DEFAULT 'dan' NOT NULL\n);\n",
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
		'CREATE INDEX `index_name` ON `table` (`name`);',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column drop default not null', async (t) => {
	const from = {
		users: sqliteTable('table', {
			name: text('name').notNull().default('dan'),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			name: text('name'),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_table` (\n\t`name` text\n);\n',
		'INSERT INTO `__new_table`(`name`) SELECT `name` FROM `table`;',
		'DROP TABLE `table`;',
		'ALTER TABLE `__new_table` RENAME TO `table`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column drop generated', async (t) => {
	const from = {
		users: sqliteTable('table', {
			id: int('id').primaryKey().notNull(),
			name: text('name').generatedAlwaysAs("'drizzle is the best'").notNull(),
		}),
	};

	const to = {
		users: sqliteTable('table', {
			id: int('id').primaryKey().notNull(),
			name: text('name').notNull(),
		}),
	};

	const { sqlStatements: st } = await diff(
		from,
		to,
		[],
	);

	await push({ db, to: from });
	const { sqlStatements: pst } = await push({ db, to });

	const st0: string[] = [
		'ALTER TABLE `table` DROP COLUMN `name`;',
		'ALTER TABLE `table` ADD `name` text NOT NULL;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('alter column drop not null, add not null', async (t) => {
	const schema1 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
		}),
		posts: sqliteTable('posts', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
			userId: int('user_id'),
		}),
	};

	const schema2 = {
		users: sqliteTable('users', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name'),
		}),
		posts: sqliteTable('posts', {
			id: int('id').primaryKey({ autoIncrement: true }),
			name: text('name').notNull(),
			userId: int('user_id'),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst, hints: phints } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`name` text\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`) SELECT `id`, `name` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_posts` (\n'
		+ '\t`id` integer PRIMARY KEY AUTOINCREMENT,\n'
		+ '\t`name` text NOT NULL,\n'
		+ '\t`user_id` integer\n'
		+ ');\n',
		'INSERT INTO `__new_posts`(`id`, `name`, `user_id`) SELECT `id`, `name`, `user_id` FROM `posts`;',
		'DROP TABLE `posts`;',
		'ALTER TABLE `__new_posts` RENAME TO `posts`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);

	const hints0: string[] = [];
	expect(phints).toStrictEqual(hints0);
});

test('recreate table with nested references', async (t) => {
	const users1 = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: true }),
		name: text('name'),
		age: integer('age'),
	});

	const subscriptions1 = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users1.id),
		customerId: text('customer_id'),
	});

	const schema1 = {
		users: users1,
		subscriptions: subscriptions1,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(() => subscriptions1.id),
		}),
	};

	const users2 = sqliteTable('users', {
		id: int('id').primaryKey({ autoIncrement: false }),
		name: text('name'),
		age: integer('age'),
	});

	const subscriptions2 = sqliteTable('subscriptions', {
		id: int('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').references(() => users2.id),
		customerId: text('customer_id'),
	});

	const schema2 = {
		users: users2,
		subscriptions: subscriptions2,
		subscriptionMetadata: sqliteTable('subscriptions_metadata', {
			id: int('id').primaryKey({ autoIncrement: true }),
			subscriptionId: text('subscription_id').references(() => subscriptions2.id),
		}),
	};

	const { sqlStatements: st } = await diff(
		schema1,
		schema2,
		[],
	);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = [
		'PRAGMA foreign_keys=OFF;',
		'CREATE TABLE `__new_users` (\n'
		+ '\t`id` integer PRIMARY KEY,\n'
		+ '\t`name` text,\n'
		+ '\t`age` integer\n'
		+ ');\n',
		'INSERT INTO `__new_users`(`id`, `name`, `age`) SELECT `id`, `name`, `age` FROM `users`;',
		'DROP TABLE `users`;',
		'ALTER TABLE `__new_users` RENAME TO `users`;',
		'PRAGMA foreign_keys=ON;',
	];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

test('text default values escape single quotes', async (t) => {
	const schema1 = {
		table: sqliteTable('table', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		table: sqliteTable('table', {
			id: integer('id').primaryKey(),
			text: text('text').default("escape's quotes"),
		}),
	};

	const { sqlStatements: st } = await diff(schema1, schema2, []);

	await push({ db, to: schema1 });
	const { sqlStatements: pst } = await push({ db, to: schema2 });

	const st0: string[] = ["ALTER TABLE `table` ADD `text` text DEFAULT 'escape''s quotes';"];
	expect(st).toStrictEqual(st0);
	expect(pst).toStrictEqual(st0);
});

// https://github.com/drizzle-team/drizzle-orm/issues/3979
test('filter out system tables created by analyze', async () => {
	await db.run('analyze');

	const schema = {
		table: sqliteTable('table', {
			id: integer('id').primaryKey(),
		}),
	};

	const { sqlStatements: pst1 } = await push({ db, to: schema });
	const expectedSql1 = ['CREATE TABLE `table` (\n\t`id` integer PRIMARY KEY\n);\n'];
	expect(pst1).toStrictEqual(expectedSql1);
});
