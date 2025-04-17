import chalk from 'chalk';
import Docker from 'dockerode';
import { getTableConfig, index, int, singlestoreTable, text } from 'drizzle-orm/singlestore-core';
import fs from 'fs';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { diffTestSchemasPushSingleStore } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { afterAll, beforeAll, expect, test } from 'vitest';

let client: Connection;
let singlestoreContainer: Docker.Container;

async function createDockerDB(): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	singlestoreContainer = await docker.createContainer({
		Image: image,
		Env: ['ROOT_PASSWORD=singlestore'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await singlestoreContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return `singlestore://root:singlestore@localhost:${port}/`;
}

beforeAll(async () => {
	const connectionString = process.env.MYSQL_CONNECTION_STRING ?? (await createDockerDB());

	const sleep = 1000;
	let timeLeft = 20000;
	let connected = false;
	let lastError: unknown | undefined;
	do {
		try {
			client = await createConnection(connectionString);
			await client.connect();
			connected = true;
			break;
		} catch (e) {
			lastError = e;
			await new Promise((resolve) => setTimeout(resolve, sleep));
			timeLeft -= sleep;
		}
	} while (timeLeft > 0);
	if (!connected) {
		console.error('Cannot connect to MySQL');
		await client?.end().catch(console.error);
		await singlestoreContainer?.stop().catch(console.error);
		throw lastError;
	}

	await client.query('DROP DATABASE IF EXISTS drizzle;');
	await client.query('CREATE DATABASE drizzle;');
	await client.query('USE drizzle;');
});

afterAll(async () => {
	await client?.end().catch(console.error);
	await singlestoreContainer?.stop().catch(console.error);
});

if (!fs.existsSync('tests/push/singlestore')) {
	fs.mkdirSync('tests/push/singlestore');
}

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: singlestoreTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}),
	};
	const schema2 = {
		test: singlestoreTable('test', {
			id: int('id').primaryKey(),
			values: int('values').default(1),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);

	await client.query(`DROP TABLE \`test\`;`);
});

// TODO: Unskip this test when views are implemented
/* test.skip.skip('create view', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			definition: 'select `id` from `test`',
			name: 'view',
			type: 'singlestore_create_view',
			replace: false,
			sqlSecurity: 'definer',
			withCheckOption: undefined,
			algorithm: 'undefined',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`CREATE ALGORITHM = undefined
SQL SECURITY definer
VIEW \`view\` AS (select \`id\` from \`test\`);`,
	]);

	await client.query(`DROP TABLE \`test\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('drop view', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			type: 'drop_view',
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP VIEW `view`;']);
	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('alter view ".as"', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view').as((qb) =>
			qb
				.select()
				.from(table)
				.where(sql`${table.id} = 1`)
		),
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view').as((qb) => qb.select().from(table)),
	};

	const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	await client.query(`DROP TABLE \`test\`;`);
	await client.query(`DROP VIEW \`view\`;`);
}); */

// TODO: Unskip this test when views are implemented
/* test.skip('alter meta options with distinct in definition', async () => {
	const table = singlestoreTable('test', {
		id: int('id').primaryKey(),
	});

	const schema1 = {
		test: table,
		view: singlestoreView('view')
			.withCheckOption('cascaded')
			.sqlSecurity('definer')
			.algorithm('merge')
			.as((qb) =>
				qb
					.selectDistinct()
					.from(table)
					.where(sql`${table.id} = 1`)
			),
	};

	const schema2 = {
		test: table,
		view: singlestoreView('view')
			.withCheckOption('cascaded')
			.sqlSecurity('definer')
			.algorithm('undefined')
			.as((qb) => qb.selectDistinct().from(table)),
	};

	await expect(
		diffTestSchemasPushSingleStore(
			client,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		),
	).rejects.toThrowError();

	await client.query(`DROP TABLE \`test\`;`);
}); */

test('added column not null and without default to table with data', async (t) => {
	const schema1 = {
		companies: singlestoreTable('companies', {
			id: int('id'),
			name: text('name'),
		}),
	};

	const schema2 = {
		companies: singlestoreTable('companies', {
			id: int('id'),
			name: text('name'),
			age: int('age').notNull(),
		}),
	};

	const table = getTableConfig(schema1.companies);

	const seedStatements = [
		`INSERT INTO \`${table.name}\` (\`${schema1.companies.name.name}\`) VALUES ('drizzle');`,
		`INSERT INTO \`${table.name}\` (\`${schema1.companies.name.name}\`) VALUES ('turso');`,
	];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
		{
			after: seedStatements,
		},
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'companies',
		column: {
			name: 'age',
			type: 'int',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
		schema: '',
	});

	expect(sqlStatements.length).toBe(2);
	expect(sqlStatements[0]).toBe(`truncate table companies;`);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE \`companies\` ADD \`age\` int NOT NULL;`,
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

	await client.query(`DROP TABLE \`companies\`;`);
});

test('added column not null and without default to table without data', async (t) => {
	const schema1 = {
		companies: singlestoreTable('companies', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}),
	};

	const schema2 = {
		companies: singlestoreTable('companies', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
			age: int('age').notNull(),
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
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'companies',
		column: {
			name: 'age',
			type: 'int',
			primaryKey: false,
			notNull: true,
			autoincrement: false,
		},
		schema: '',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE \`companies\` ADD \`age\` int NOT NULL;`,
	);

	expect(infoToPrint!.length).toBe(0);
	expect(columnsToRemove!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);

	await client.query(`DROP TABLE \`companies\`;`);
});

test('drop not null, add not null', async (t) => {
	const schema1 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}),
		posts: singlestoreTable(
			'posts',
			{
				id: int('id').primaryKey(),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const schema2 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
		posts: singlestoreTable(
			'posts',
			{
				id: int('id').primaryKey(),
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
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
	);

	expect(statements!.length).toBe(2);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'int',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'name',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'user_id',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'int',
			},
		],
		compositePKs: [
			'posts_id;id',
		],
		tableName: 'posts',
		type: 'singlestore_recreate_table',
		uniqueConstraints: [],
	});
	expect(statements![1]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'int',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
		],
		compositePKs: [
			'users_id;id',
		],
		tableName: 'users',
		type: 'singlestore_recreate_table',
		uniqueConstraints: [],
	});
	expect(sqlStatements!.length).toBe(8);
	expect(sqlStatements![0]).toBe(`CREATE TABLE \`__new_posts\` (
\t\`id\` int NOT NULL,
\t\`name\` text NOT NULL,
\t\`user_id\` int,
\tCONSTRAINT \`posts_id\` PRIMARY KEY(\`id\`)
);\n`);
	expect(sqlStatements![1]).toBe(
		`INSERT INTO \`__new_posts\`(\`id\`, \`name\`, \`user_id\`) SELECT \`id\`, \`name\`, \`user_id\` FROM \`posts\`;`,
	);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`posts\`;`);
	expect(sqlStatements![3]).toBe(`ALTER TABLE \`__new_posts\` RENAME TO \`posts\`;`);
	expect(sqlStatements![4]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`);
	expect(sqlStatements![5]).toBe(
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
	);
	expect(sqlStatements![6]).toBe(
		`DROP TABLE \`users\`;`,
	);
	expect(sqlStatements![7]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);

	await client.query(`DROP TABLE \`users\`;`);
	await client.query(`DROP TABLE \`posts\`;`);
});

test('drop table with data', async (t) => {
	const schema1 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}),
		posts: singlestoreTable(
			'posts',
			{
				id: int('id').primaryKey(),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const schema2 = {
		posts: singlestoreTable(
			'posts',
			{
				id: int('id').primaryKey(),
				name: text('name'),
				userId: int('user_id'),
			},
		),
	};

	const seedStatements = [
		`INSERT INTO \`users\` (\`id\`, \`name\`) VALUES (1, 'drizzle')`,
	];
	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
		{ after: seedStatements },
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

	await client.query(`DROP TABLE \`users\`;`);
	await client.query(`DROP TABLE \`posts\`;`);
});

test('change data type. db has indexes. table does not have values', async (t) => {
	const schema1 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: int('name').notNull(),
		}, (table) => [index('index').on(table.name)]),
	};

	const schema2 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name').notNull(),
		}, (table) => [index('index').on(table.name)]),
	};

	const seedStatements = [`INSERT INTO users VALUES (1, 12)`];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
	);

	expect(statements!.length).toBe(2);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'int',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'name',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
		],
		compositePKs: [
			'users_id;id',
		],
		tableName: 'users',
		type: 'singlestore_recreate_table',
		uniqueConstraints: [],
	});
	expect(statements![1]).toStrictEqual({
		data: 'index;name;false;;;',
		internal: undefined,
		schema: '',
		tableName: 'users',
		type: 'create_index',
	});

	expect(sqlStatements!.length).toBe(5);
	expect(sqlStatements![0]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text NOT NULL,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`);
	expect(sqlStatements![1]).toBe(
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
	);
	expect(sqlStatements![2]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![3]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements![4]).toBe(`CREATE INDEX \`index\` ON \`users\` (\`name\`);`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);

	await client.query(`DROP TABLE \`users\`;`);
});

test('change data type. db has indexes. table has values', async (t) => {
	const schema1 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: int('name'),
		}, (table) => [index('index').on(table.name)]),
	};

	const schema2 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}, (table) => [index('index').on(table.name)]),
	};

	const seedStatements = [`INSERT INTO users VALUES (1, 12);`, `INSERT INTO users (id) VALUES (2);`];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
		{ after: seedStatements },
	);

	expect(statements!.length).toBe(2);
	expect(statements![0]).toStrictEqual({
		columns: [
			{
				autoincrement: false,
				generated: undefined,
				name: 'id',
				notNull: true,
				onUpdate: undefined,
				primaryKey: false,
				type: 'int',
			},
			{
				autoincrement: false,
				generated: undefined,
				name: 'name',
				notNull: false,
				onUpdate: undefined,
				primaryKey: false,
				type: 'text',
			},
		],
		compositePKs: [
			'users_id;id',
		],
		tableName: 'users',
		type: 'singlestore_recreate_table',
		uniqueConstraints: [],
	});
	expect(statements![1]).toStrictEqual({
		data: 'index;name;false;;;',
		internal: undefined,
		schema: '',
		tableName: 'users',
		type: 'create_index',
	});

	expect(sqlStatements!.length).toBe(6);
	expect(sqlStatements![0]).toBe(`TRUNCATE TABLE \`users\`;`);
	expect(sqlStatements![1]).toBe(`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`);
	expect(sqlStatements![2]).toBe(
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
	);
	expect(sqlStatements![3]).toBe(`DROP TABLE \`users\`;`);
	expect(sqlStatements![4]).toBe(`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`);
	expect(sqlStatements![5]).toBe(`CREATE INDEX \`index\` ON \`users\` (\`name\`);`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(
		`· You're about recreate ${chalk.underline('users')} table with data type changing for ${
			chalk.underline('name')
		} column, which contains 1 items`,
	);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(1);
	expect(tablesToTruncate![0]).toBe(`users`);

	await client.query(`DROP TABLE \`users\`;`);
});

test('add column. add default to column without not null', async (t) => {
	const schema1 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name'),
		}),
	};

	const schema2 = {
		users: singlestoreTable('users', {
			id: int('id').primaryKey(),
			name: text('name').default('drizzle'),
			age: int('age'),
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
	} = await diffTestSchemasPushSingleStore(
		client,
		schema1,
		schema2,
		[],
		'drizzle',
		false,
		undefined,
	);

	expect(statements!.length).toBe(2);
	expect(statements![0]).toStrictEqual({
		columnAutoIncrement: false,
		columnName: 'name',
		columnNotNull: false,
		columnOnUpdate: undefined,
		columnPk: false,
		newDataType: 'text',
		newDefaultValue: "'drizzle'",
		schema: '',
		tableName: 'users',
		type: 'alter_table_alter_column_set_default',
	});
	expect(statements![1]).toStrictEqual({
		type: 'alter_table_add_column',
		tableName: 'users',
		schema: '',
		column: {
			notNull: false,
			primaryKey: false,
			autoincrement: false,
			name: 'age',
			type: 'int',
		},
	});
	expect(sqlStatements!.length).toBe(2);
	expect(sqlStatements![0]).toBe(`ALTER TABLE \`users\` MODIFY COLUMN \`name\` text DEFAULT 'drizzle';`);
	expect(sqlStatements![1]).toBe(`ALTER TABLE \`users\` ADD \`age\` int;`);
	expect(columnsToRemove!.length).toBe(0);
	expect(infoToPrint!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(tablesToTruncate!.length).toBe(0);

	await client.query(`DROP TABLE \`users\`;`);
});
