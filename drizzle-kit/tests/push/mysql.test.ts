import 'dotenv/config';
import Docker from 'dockerode';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	char,
	date,
	datetime,
	decimal,
	double,
	float,
	int,
	json,
	mediumint,
	mysqlEnum,
	mysqlTable,
	primaryKey,
	serial,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	year,
} from 'drizzle-orm/mysql-core';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { diffTestSchemasMysql, diffTestSchemasPushMysql } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { expect, test } from 'vitest';
import { DialectSuite, run } from './common';

async function createDockerDB(context: any): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'mysql:8';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	context.mysqlContainer = await docker.createContainer({
		Image: image,
		Env: ['MYSQL_ROOT_PASSWORD=mysql', 'MYSQL_DATABASE=drizzle'],
		name: `drizzle-integration-tests-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3306/tcp': [{ HostPort: `${port}` }],
			},
		},
	});

	await context.mysqlContainer.start();

	return `mysql://root:mysql@127.0.0.1:${port}/drizzle`;
}

const mysqlSuite: DialectSuite = {
	allTypes: async function(context: any): Promise<void> {
		const schema1 = {
			allBigInts: mysqlTable('all_big_ints', {
				simple: bigint('simple', { mode: 'number' }),
				columnNotNull: bigint('column_not_null', { mode: 'number' }).notNull(),
				columnDefault: bigint('column_default', { mode: 'number' }).default(12),
				columnDefaultSql: bigint('column_default_sql', {
					mode: 'number',
				}).default(12),
			}),
			allBools: mysqlTable('all_bools', {
				simple: tinyint('simple'),
				columnNotNull: tinyint('column_not_null').notNull(),
				columnDefault: tinyint('column_default').default(1),
			}),
			allChars: mysqlTable('all_chars', {
				simple: char('simple', { length: 1 }),
				columnNotNull: char('column_not_null', { length: 45 }).notNull(),
				// columnDefault: char("column_default", { length: 1 }).default("h"),
				columnDefaultSql: char('column_default_sql', { length: 1 }).default(
					'h',
				),
			}),
			allDateTimes: mysqlTable('all_date_times', {
				simple: datetime('simple', { mode: 'string', fsp: 1 }),
				columnNotNull: datetime('column_not_null', {
					mode: 'string',
				}).notNull(),
				columnDefault: datetime('column_default', { mode: 'string' }).default(
					'2023-03-01 14:05:29',
				),
			}),
			allDates: mysqlTable('all_dates', {
				simple: date('simple', { mode: 'string' }),
				column_not_null: date('column_not_null', { mode: 'string' }).notNull(),
				column_default: date('column_default', { mode: 'string' }).default(
					'2023-03-01',
				),
			}),
			allDecimals: mysqlTable('all_decimals', {
				simple: decimal('simple', { precision: 1, scale: 0 }),
				columnNotNull: decimal('column_not_null', {
					precision: 45,
					scale: 3,
				}).notNull(),
				columnDefault: decimal('column_default', {
					precision: 10,
					scale: 0,
				}).default('100'),
				columnDefaultSql: decimal('column_default_sql', {
					precision: 10,
					scale: 0,
				}).default('101'),
			}),

			allDoubles: mysqlTable('all_doubles', {
				simple: double('simple'),
				columnNotNull: double('column_not_null').notNull(),
				columnDefault: double('column_default').default(100),
				columnDefaultSql: double('column_default_sql').default(101),
			}),

			allEnums: mysqlTable('all_enums', {
				simple: mysqlEnum('simple', ['hi', 'hello']),
			}),

			allEnums1: mysqlTable('all_enums1', {
				simple: mysqlEnum('simple', ['hi', 'hello']).default('hi'),
			}),

			allFloats: mysqlTable('all_floats', {
				columnNotNull: float('column_not_null').notNull(),
				columnDefault: float('column_default').default(100),
				columnDefaultSql: float('column_default_sql').default(101),
			}),

			allInts: mysqlTable('all_ints', {
				simple: int('simple'),
				columnNotNull: int('column_not_null').notNull(),
				columnDefault: int('column_default').default(100),
				columnDefaultSql: int('column_default_sql').default(101),
			}),

			allIntsRef: mysqlTable('all_ints_ref', {
				simple: int('simple'),
				columnNotNull: int('column_not_null').notNull(),
				columnDefault: int('column_default').default(100),
				columnDefaultSql: int('column_default_sql').default(101),
			}),

			allJsons: mysqlTable('all_jsons', {
				columnDefaultObject: json('column_default_object')
					.default({ hello: 'world world' })
					.notNull(),
				columnDefaultArray: json('column_default_array').default({
					hello: { 'world world': ['foo', 'bar'] },
					foo: 'bar',
					fe: 23,
				}),
				column: json('column'),
			}),

			allMInts: mysqlTable('all_m_ints', {
				simple: mediumint('simple'),
				columnNotNull: mediumint('column_not_null').notNull(),
				columnDefault: mediumint('column_default').default(100),
				columnDefaultSql: mediumint('column_default_sql').default(101),
			}),

			allReals: mysqlTable('all_reals', {
				simple: double('simple', { precision: 5, scale: 2 }),
				columnNotNull: double('column_not_null').notNull(),
				columnDefault: double('column_default').default(100),
				columnDefaultSql: double('column_default_sql').default(101),
			}),

			allSInts: mysqlTable('all_s_ints', {
				simple: smallint('simple'),
				columnNotNull: smallint('column_not_null').notNull(),
				columnDefault: smallint('column_default').default(100),
				columnDefaultSql: smallint('column_default_sql').default(101),
			}),

			allSmallSerials: mysqlTable('all_small_serials', {
				columnAll: serial('column_all').primaryKey().notNull(),
			}),

			allTInts: mysqlTable('all_t_ints', {
				simple: tinyint('simple'),
				columnNotNull: tinyint('column_not_null').notNull(),
				columnDefault: tinyint('column_default').default(10),
				columnDefaultSql: tinyint('column_default_sql').default(11),
			}),

			allTexts: mysqlTable('all_texts', {
				simple: text('simple'),
				columnNotNull: text('column_not_null').notNull(),
				columnDefault: text('column_default').default('hello'),
				columnDefaultSql: text('column_default_sql').default('hello'),
			}),

			allTimes: mysqlTable('all_times', {
				simple: time('simple', { fsp: 1 }),
				columnNotNull: time('column_not_null').notNull(),
				columnDefault: time('column_default').default('22:12:12'),
			}),

			allTimestamps: mysqlTable('all_timestamps', {
				columnDateNow: timestamp('column_date_now', {
					fsp: 1,
					mode: 'string',
				}).default(sql`(now())`),
				columnAll: timestamp('column_all', { mode: 'string' })
					.default('2023-03-01 14:05:29')
					.notNull(),
				column: timestamp('column', { mode: 'string' }).default(
					'2023-02-28 16:18:31',
				),
			}),

			allVarChars: mysqlTable('all_var_chars', {
				simple: varchar('simple', { length: 100 }),
				columnNotNull: varchar('column_not_null', { length: 45 }).notNull(),
				columnDefault: varchar('column_default', { length: 100 }).default(
					'hello',
				),
				columnDefaultSql: varchar('column_default_sql', {
					length: 100,
				}).default('hello'),
			}),

			allVarbinaries: mysqlTable('all_varbinaries', {
				simple: varbinary('simple', { length: 100 }),
				columnNotNull: varbinary('column_not_null', { length: 100 }).notNull(),
				columnDefault: varbinary('column_default', { length: 12 }).default(
					sql`(uuid_to_bin(uuid()))`,
				),
			}),

			allYears: mysqlTable('all_years', {
				simple: year('simple'),
				columnNotNull: year('column_not_null').notNull(),
				columnDefault: year('column_default').default(2022),
			}),

			binafry: mysqlTable('binary', {
				simple: binary('simple', { length: 1 }),
				columnNotNull: binary('column_not_null', { length: 1 }).notNull(),
				columnDefault: binary('column_default', { length: 12 }).default(
					sql`(uuid_to_bin(uuid()))`,
				),
			}),
		};

		const { statements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema1,
			[],
			'drizzle',
			false,
		);
		expect(statements.length).toBe(2);
		expect(statements).toEqual([
			{
				type: 'delete_unique_constraint',
				tableName: 'all_small_serials',
				data: 'column_all;column_all',
				schema: '',
			},
			{
				type: 'delete_unique_constraint',
				tableName: 'all_small_serials',
				data: 'column_all;column_all',
				schema: '',
			},
		]);

		const { sqlStatements: dropStatements } = await diffTestSchemasMysql(
			schema1,
			{},
			[],
			false,
		);

		for (const st of dropStatements) {
			await context.client.query(st);
		}
	},
	addBasicIndexes: function(context?: any): Promise<void> {
		return {} as any;
	},
	changeIndexFields: function(context?: any): Promise<void> {
		return {} as any;
	},
	dropIndex: function(context?: any): Promise<void> {
		return {} as any;
	},
	indexesToBeNotTriggered: function(context?: any): Promise<void> {
		return {} as any;
	},
	indexesTestCase1: function(context?: any): Promise<void> {
		return {} as any;
	},
	async case1() {
		// TODO: implement if needed
		expect(true).toBe(true);
	},
	addNotNull: function(context?: any): Promise<void> {
		return {} as any;
	},
	addNotNullWithDataNoRollback: function(context?: any): Promise<void> {
		return {} as any;
	},
	addBasicSequences: function(context?: any): Promise<void> {
		return {} as any;
	},
	addGeneratedColumn: async function(context: any): Promise<void> {
		const schema1 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
			}),
		};
		const schema2 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'stored' },
				),
				generatedName1: text('gen_name1').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'virtual' },
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		);

		expect(statements).toStrictEqual([
			{
				column: {
					autoincrement: false,
					generated: {
						as: "`users`.`name` || 'hello'",
						type: 'stored',
					},
					name: 'gen_name',
					notNull: false,
					primaryKey: false,
					type: 'text',
				},
				schema: '',
				tableName: 'users',
				type: 'alter_table_add_column',
			},
			{
				column: {
					autoincrement: false,
					generated: {
						as: "`users`.`name` || 'hello'",
						type: 'virtual',
					},
					name: 'gen_name1',
					notNull: false,
					primaryKey: false,
					type: 'text',
				},
				schema: '',
				tableName: 'users',
				type: 'alter_table_add_column',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` ADD `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
			"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
		]);

		for (const st of sqlStatements) {
			await context.client.query(st);
		}

		const { sqlStatements: dropStatements } = await diffTestSchemasMysql(
			schema2,
			{},
			[],
			false,
		);

		for (const st of dropStatements) {
			await context.client.query(st);
		}
	},
	addGeneratedToColumn: async function(context: any): Promise<void> {
		const schema1 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
				generatedName1: text('gen_name1'),
			}),
		};
		const schema2 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'stored' },
				),
				generatedName1: text('gen_name1').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'virtual' },
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: false,
				columnDefault: undefined,
				columnGenerated: {
					as: "`users`.`name` || 'hello'",
					type: 'stored',
				},
				columnName: 'gen_name',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_set_generated',
			},
			{
				columnAutoIncrement: false,
				columnDefault: undefined,
				columnGenerated: {
					as: "`users`.`name` || 'hello'",
					type: 'virtual',
				},
				columnName: 'gen_name1',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_set_generated',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			"ALTER TABLE `users` MODIFY COLUMN `gen_name` text GENERATED ALWAYS AS (`users`.`name` || 'hello') STORED;",
			'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
			"ALTER TABLE `users` ADD `gen_name1` text GENERATED ALWAYS AS (`users`.`name` || 'hello') VIRTUAL;",
		]);

		for (const st of sqlStatements) {
			await context.client.query(st);
		}

		const { sqlStatements: dropStatements } = await diffTestSchemasMysql(
			schema2,
			{},
			[],
			false,
		);

		for (const st of dropStatements) {
			await context.client.query(st);
		}
	},
	dropGeneratedConstraint: async function(context: any): Promise<void> {
		const schema1 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
					{ mode: 'stored' },
				),
				generatedName1: text('gen_name1').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
					{ mode: 'virtual' },
				),
			}),
		};
		const schema2 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
				generatedName1: text('gen_name1'),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: false,
				columnDefault: undefined,
				columnGenerated: undefined,
				columnName: 'gen_name',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				oldColumn: {
					autoincrement: false,
					default: undefined,
					generated: {
						as: '`name`',
						type: 'stored',
					},
					name: 'gen_name',
					notNull: false,
					onUpdate: undefined,
					primaryKey: false,
					type: 'text',
				},
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_drop_generated',
			},
			{
				columnAutoIncrement: false,
				columnDefault: undefined,
				columnGenerated: undefined,
				columnName: 'gen_name1',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				oldColumn: {
					autoincrement: false,
					default: undefined,
					generated: {
						as: '`name`',
						type: 'virtual',
					},
					name: 'gen_name1',
					notNull: false,
					onUpdate: undefined,
					primaryKey: false,
					type: 'text',
				},
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_drop_generated',
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE `users` MODIFY COLUMN `gen_name` text;',
			'ALTER TABLE `users` DROP COLUMN `gen_name1`;',
			'ALTER TABLE `users` ADD `gen_name1` text;',
		]);

		for (const st of sqlStatements) {
			await context.client.query(st);
		}

		const { sqlStatements: dropStatements } = await diffTestSchemasMysql(
			schema2,
			{},
			[],
			false,
		);

		for (const st of dropStatements) {
			await context.client.query(st);
		}
	},
	alterGeneratedConstraint: async function(context: any): Promise<void> {
		const schema1 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
					{ mode: 'stored' },
				),
				generatedName1: text('gen_name1').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name}`,
					{ mode: 'virtual' },
				),
			}),
		};
		const schema2 = {
			users: mysqlTable('users', {
				id: int('id'),
				id2: int('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'stored' },
				),
				generatedName1: text('gen_name1').generatedAlwaysAs(
					(): SQL => sql`${schema2.users.name} || 'hello'`,
					{ mode: 'virtual' },
				),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		);

		expect(statements).toStrictEqual([]);
		expect(sqlStatements).toStrictEqual([]);

		const { sqlStatements: dropStatements } = await diffTestSchemasMysql(
			schema2,
			{},
			[],
			false,
		);

		for (const st of dropStatements) {
			await context.client.query(st);
		}
	},
	createTableWithGeneratedConstraint: function(context?: any): Promise<void> {
		return {} as any;
	},
	createCompositePrimaryKey: async function(context: any): Promise<void> {
		const schema1 = {};

		const schema2 = {
			table: mysqlTable('table', {
				col1: int('col1').notNull(),
				col2: int('col2').notNull(),
			}, (t) => ({
				pk: primaryKey({
					columns: [t.col1, t.col2],
				}),
			})),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			[],
			'drizzle',
			false,
		);

		expect(statements).toStrictEqual([
			{
				type: 'create_table',
				tableName: 'table',
				schema: undefined,
				internals: {
					indexes: {},
					tables: {},
				},
				compositePKs: ['table_col1_col2_pk;col1,col2'],
				compositePkName: 'table_col1_col2_pk',
				uniqueConstraints: [],
				checkConstraints: [],
				columns: [
					{ name: 'col1', type: 'int', primaryKey: false, notNull: true, autoincrement: false },
					{ name: 'col2', type: 'int', primaryKey: false, notNull: true, autoincrement: false },
				],
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE `table` (\n\t`col1` int NOT NULL,\n\t`col2` int NOT NULL,\n\tCONSTRAINT `table_col1_col2_pk` PRIMARY KEY(`col1`,`col2`)\n);\n',
		]);
	},
	renameTableWithCompositePrimaryKey: async function(context?: any): Promise<void> {
		const productsCategoriesTable = (tableName: string) => {
			return mysqlTable(tableName, {
				productId: varchar('product_id', { length: 10 }).notNull(),
				categoryId: varchar('category_id', { length: 10 }).notNull(),
			}, (t) => ({
				pk: primaryKey({
					columns: [t.productId, t.categoryId],
				}),
			}));
		};

		const schema1 = {
			table: productsCategoriesTable('products_categories'),
		};
		const schema2 = {
			test: productsCategoriesTable('products_to_categories'),
		};

		const { sqlStatements } = await diffTestSchemasPushMysql(
			context.client as Connection,
			schema1,
			schema2,
			['public.products_categories->public.products_to_categories'],
			'drizzle',
			false,
		);

		expect(sqlStatements).toStrictEqual([
			'RENAME TABLE `products_categories` TO `products_to_categories`;',
			'ALTER TABLE `products_to_categories` DROP PRIMARY KEY;',
			'ALTER TABLE `products_to_categories` ADD PRIMARY KEY(`product_id`,`category_id`);',
		]);

		await context.client.query(`DROP TABLE \`products_categories\``);
	},
};

run(
	mysqlSuite,
	async (context: any) => {
		const connectionString = process.env.MYSQL_CONNECTION_STRING ?? await createDockerDB(context);

		const sleep = 1000;
		let timeLeft = 20000;
		let connected = false;
		let lastError: unknown | undefined;
		do {
			try {
				context.client = await createConnection(connectionString);
				await context.client.connect();
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
			await context.client?.end().catch(console.error);
			await context.mysqlContainer?.stop().catch(console.error);
			throw lastError;
		}
	},
	async (context: any) => {
		await context.client?.end().catch(console.error);
		await context.mysqlContainer?.stop().catch(console.error);
	},
	async (context: any) => {
		await context.client?.query(`drop database if exists \`drizzle\`;`);
		await context.client?.query(`create database \`drizzle\`;`);
		await context.client?.query(`use \`drizzle\`;`);
	},
);
