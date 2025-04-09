import Docker from 'dockerode';
import { SQL, sql } from 'drizzle-orm';
import {
	bigint,
	binary,
	char,
	date,
	decimal,
	double,
	float,
	int,
	mediumint,
	primaryKey,
	singlestoreEnum,
	singlestoreTable,
	smallint,
	text,
	time,
	timestamp,
	tinyint,
	varbinary,
	varchar,
	vector,
	year,
} from 'drizzle-orm/singlestore-core';
import getPort from 'get-port';
import { Connection, createConnection } from 'mysql2/promise';
import { diffTestSchemasPushSingleStore, diffTestSchemasSingleStore } from 'tests/schemaDiffer';
import { v4 as uuid } from 'uuid';
import { expect } from 'vitest';
import { DialectSuite, run } from './common';

async function createDockerDB(context: any): Promise<string> {
	const docker = new Docker();
	const port = await getPort({ port: 3306 });
	const image = 'ghcr.io/singlestore-labs/singlestoredb-dev:latest';

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (err) => err ? reject(err) : resolve(err))
	);

	context.singlestoreContainer = await docker.createContainer({
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

	await context.singlestoreContainer.start();
	await new Promise((resolve) => setTimeout(resolve, 4000));

	return `singlestore://root:singlestore@localhost:${port}/`;
}

const singlestoreSuite: DialectSuite = {
	allTypes: async function(context: any): Promise<void> {
		const schema1 = {
			allBigInts: singlestoreTable('all_big_ints', {
				simple: bigint('simple', { mode: 'number' }),
				columnNotNull: bigint('column_not_null', { mode: 'number' }).notNull(),
				columnDefault: bigint('column_default', { mode: 'number' }).default(12),
				columnDefaultSql: bigint('column_default_sql', {
					mode: 'number',
				}).default(12),
			}),
			allBools: singlestoreTable('all_bools', {
				simple: tinyint('simple'),
				columnNotNull: tinyint('column_not_null').notNull(),
				columnDefault: tinyint('column_default').default(1),
			}),
			allChars: singlestoreTable('all_chars', {
				simple: char('simple', { length: 1 }),
				columnNotNull: char('column_not_null', { length: 45 }).notNull(),
				// columnDefault: char("column_default", { length: 1 }).default("h"),
				columnDefaultSql: char('column_default_sql', { length: 1 }).default(
					'h',
				),
			}),
			//   allDateTimes: singlestoreTable("all_date_times", {
			//     simple: datetime("simple", { mode: "string", fsp: 1 }),
			//     columnNotNull: datetime("column_not_null", {
			//       mode: "string",
			//     }).notNull(),
			//     columnDefault: datetime("column_default", { mode: "string" }).default(
			//       "2023-03-01 14:05:29"
			//     ),
			//   }),
			allDates: singlestoreTable('all_dates', {
				simple: date('simple', { mode: 'string' }),
				column_not_null: date('column_not_null', { mode: 'string' }).notNull(),
				column_default: date('column_default', { mode: 'string' }).default(
					'2023-03-01',
				),
			}),
			allDecimals: singlestoreTable('all_decimals', {
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

			allDoubles: singlestoreTable('all_doubles', {
				simple: double('simple'),
				columnNotNull: double('column_not_null').notNull(),
				columnDefault: double('column_default').default(100),
				columnDefaultSql: double('column_default_sql').default(101),
			}),

			allEnums: singlestoreTable('all_enums', {
				simple: singlestoreEnum('simple', ['hi', 'hello']),
			}),

			allEnums1: singlestoreTable('all_enums1', {
				simple: singlestoreEnum('simple', ['hi', 'hello']).default('hi'),
			}),

			allFloats: singlestoreTable('all_floats', {
				columnNotNull: float('column_not_null').notNull(),
				columnDefault: float('column_default').default(100),
				columnDefaultSql: float('column_default_sql').default(101),
			}),

			allInts: singlestoreTable('all_ints', {
				simple: int('simple'),
				columnNotNull: int('column_not_null').notNull(),
				columnDefault: int('column_default').default(100),
				columnDefaultSql: int('column_default_sql').default(101),
			}),

			allIntsRef: singlestoreTable('all_ints_ref', {
				simple: int('simple'),
				columnNotNull: int('column_not_null').notNull(),
				columnDefault: int('column_default').default(100),
				columnDefaultSql: int('column_default_sql').default(101),
			}),

			//   allJsons: singlestoreTable("all_jsons", {
			//     columnDefaultObject: json("column_default_object")
			//       .default({ hello: "world world" })
			//       .notNull(),
			//     columnDefaultArray: json("column_default_array").default({
			//       hello: { "world world": ["foo", "bar"] },
			//       foo: "bar",
			//       fe: 23,
			//     }),
			//     column: json("column"),
			//   }),

			allMInts: singlestoreTable('all_m_ints', {
				simple: mediumint('simple'),
				columnNotNull: mediumint('column_not_null').notNull(),
				columnDefault: mediumint('column_default').default(100),
				columnDefaultSql: mediumint('column_default_sql').default(101),
			}),

			allReals: singlestoreTable('all_reals', {
				simple: double('simple', { precision: 5, scale: 2 }),
				columnNotNull: double('column_not_null').notNull(),
				columnDefault: double('column_default').default(100),
				columnDefaultSql: double('column_default_sql').default(101),
			}),

			allSInts: singlestoreTable('all_s_ints', {
				simple: smallint('simple'),
				columnNotNull: smallint('column_not_null').notNull(),
				columnDefault: smallint('column_default').default(100),
				columnDefaultSql: smallint('column_default_sql').default(101),
			}),

			//   allSmallSerials: singlestoreTable("all_small_serials", {
			//     columnAll: serial("column_all").notNull(),
			//   }),

			allTInts: singlestoreTable('all_t_ints', {
				simple: tinyint('simple'),
				columnNotNull: tinyint('column_not_null').notNull(),
				columnDefault: tinyint('column_default').default(10),
				columnDefaultSql: tinyint('column_default_sql').default(11),
			}),

			allTexts: singlestoreTable('all_texts', {
				simple: text('simple'),
				columnNotNull: text('column_not_null').notNull(),
				columnDefault: text('column_default').default('hello'),
				columnDefaultSql: text('column_default_sql').default('hello'),
			}),

			allTimes: singlestoreTable('all_times', {
				// simple: time("simple", { fsp: 1 }),
				columnNotNull: time('column_not_null').notNull(),
				columnDefault: time('column_default').default('22:12:12'),
			}),

			allTimestamps: singlestoreTable('all_timestamps', {
				// columnDateNow: timestamp("column_date_now", {
				//   fsp: 1,
				//   mode: "string",
				// }).default(sql`(now())`),
				columnAll: timestamp('column_all', { mode: 'string' })
					.default('2023-03-01 14:05:29')
					.notNull(),
				column: timestamp('column', { mode: 'string' }).default(
					'2023-02-28 16:18:31',
				),
			}),

			allVarChars: singlestoreTable('all_var_chars', {
				simple: varchar('simple', { length: 100 }),
				columnNotNull: varchar('column_not_null', { length: 45 }).notNull(),
				columnDefault: varchar('column_default', { length: 100 }).default(
					'hello',
				),
				columnDefaultSql: varchar('column_default_sql', {
					length: 100,
				}).default('hello'),
			}),

			allVarbinaries: singlestoreTable('all_varbinaries', {
				simple: varbinary('simple', { length: 100 }),
				columnNotNull: varbinary('column_not_null', { length: 100 }).notNull(),
				columnDefault: varbinary('column_default', { length: 12 }),
			}),

			allYears: singlestoreTable('all_years', {
				simple: year('simple'),
				columnNotNull: year('column_not_null').notNull(),
				columnDefault: year('column_default').default(2022),
			}),

			binafry: singlestoreTable('binary', {
				simple: binary('simple', { length: 1 }),
				columnNotNull: binary('column_not_null', { length: 1 }).notNull(),
				columnDefault: binary('column_default', { length: 12 }),
			}),

			allVectors: singlestoreTable('all_vectors', {
				vectorSimple: vector('vector_simple', { dimensions: 1 }),
				vectorElementType: vector('vector_element_type', { dimensions: 1, elementType: 'I8' }),
				vectorNotNull: vector('vector_not_null', { dimensions: 1 }).notNull(),
				vectorDefault: vector('vector_default', { dimensions: 1 }).default([1]),
			}),
		};

		const { statements } = await diffTestSchemasPushSingleStore(
			context.client as Connection,
			schema1,
			schema1,
			[],
			'drizzle',
			false,
		);
		console.log(statements);
		expect(statements.length).toBe(0);
		expect(statements).toEqual([]);

		const { sqlStatements: dropStatements } = await diffTestSchemasSingleStore(
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
		return {} as any;
	},
	addGeneratedToColumn: async function(context: any): Promise<void> {
		return {} as any;
	},
	dropGeneratedConstraint: async function(context: any): Promise<void> {
		return {} as any;
	},
	alterGeneratedConstraint: async function(context: any): Promise<void> {
		return {} as any;
	},
	createTableWithGeneratedConstraint: function(context?: any): Promise<void> {
		return {} as any;
	},
	createCompositePrimaryKey: async function(context: any): Promise<void> {
		const schema1 = {};

		const schema2 = {
			table: singlestoreTable('table', {
				col1: int('col1').notNull(),
				col2: int('col2').notNull(),
			}, (t) => ({
				pk: primaryKey({
					columns: [t.col1, t.col2],
				}),
			})),
		};

		const { statements, sqlStatements } = await diffTestSchemasPushSingleStore(
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
			return singlestoreTable(tableName, {
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

		const { sqlStatements } = await diffTestSchemasPushSingleStore(
			context.client as Connection,
			schema1,
			schema2,
			['public.products_categories->public.products_to_categories'],
			'drizzle',
			false,
		);

		// It's not possible to create/alter/drop primary keys in SingleStore
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE `products_categories` RENAME TO `products_to_categories`;',
		]);

		await context.client.query(`DROP TABLE \`products_categories\``);
	},
};

run(
	singlestoreSuite,
	async (context: any) => {
		const connectionString = process.env.SINGLESTORE_CONNECTION_STRING
			?? (await createDockerDB(context));

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
			console.error('Cannot connect to SingleStore');
			await context.client?.end().catch(console.error);
			await context.singlestoreContainer?.stop().catch(console.error);
			throw lastError;
		}

		await context.client.query(`DROP DATABASE IF EXISTS \`drizzle\`;`);
		await context.client.query('CREATE DATABASE drizzle;');
		await context.client.query('USE drizzle;');
	},
	async (context: any) => {
		await context.client?.end().catch(console.error);
		await context.singlestoreContainer?.stop().catch(console.error);
	},
);
