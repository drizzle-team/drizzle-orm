import chalk from 'chalk';
import {
	bigint,
	binary,
	char,
	date,
	decimal,
	double,
	float,
	index,
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
import { Connection } from 'mysql2/promise';
import { DB } from 'src/utils';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { DialectSuite, run } from '../push/common';
import { diff, diffPush, prepareTestDatabase, TestDatabase } from './mocks';

fs.mkdirSync('./tests/singlestore/migrations', { recursive: true });

let _: TestDatabase;
let db: DB;
let client: Connection;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
	client = _.client;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

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

		const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema1 });
		expect(sqlStatements).toStrictEqual([]);
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
			}, (t) => [primaryKey({
				columns: [t.col1, t.col2],
			})]),
		};

		const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE `table` (\n\t`col1` int NOT NULL,\n\t`col2` int NOT NULL,\n\tCONSTRAINT `table_col1_col2_pk` PRIMARY KEY(`col1`,`col2`)\n);\n',
		]);
	},
	renameTableWithCompositePrimaryKey: async function(context?: any): Promise<void> {
		const productsCategoriesTable = (tableName: string) => {
			return singlestoreTable(tableName, {
				productId: varchar('product_id', { length: 10 }).notNull(),
				categoryId: varchar('category_id', { length: 10 }).notNull(),
			}, (t) => [primaryKey({
				columns: [t.productId, t.categoryId],
			})]);
		};

		const schema1 = {
			table: productsCategoriesTable('products_categories'),
		};
		const schema2 = {
			test: productsCategoriesTable('products_to_categories'),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
			renames: ['products_categories->products_to_categories'],
		});

		// It's not possible to create/alter/drop primary keys in SingleStore
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE `products_categories` RENAME TO `products_to_categories`;',
		]);
	},
};

run(singlestoreSuite);

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

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
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

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		after: [`INSERT INTO \`companies\` (\`name\`) VALUES ('drizzle'), ('turso');`],
	});

	expect(sqlStatements).toStrictEqual([
		`truncate table companies;`,
		`ALTER TABLE \`companies\` ADD \`age\` int NOT NULL;`,
	]);
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

	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`companies\` ADD \`age\` int NOT NULL;`,
	]);
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
	const { sqlStatements } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_posts\` (
\t\`id\` int NOT NULL,
\t\`name\` text NOT NULL,
\t\`user_id\` int,
\tCONSTRAINT \`posts_id\` PRIMARY KEY(\`id\`)
);\n`,
		`INSERT INTO \`__new_posts\`(\`id\`, \`name\`, \`user_id\`) SELECT \`id\`, \`name\`, \`user_id\` FROM \`posts\`;`,
		`DROP TABLE \`posts\`;`,
		`ALTER TABLE \`__new_posts\` RENAME TO \`posts\`;`,

		`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`,
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
		`DROP TABLE \`users\`;`,
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
	]);
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

	const { sqlStatements, hints } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		after: [`INSERT INTO \`users\` (\`id\`, \`name\`) VALUES (1, 'drizzle')`],
	});

	expect(sqlStatements).toStrictEqual([`DROP TABLE \`users\`;`]);
	expect(hints).toStrictEqual([`· You're about to delete ${chalk.underline('users')} table with 1 items`]);
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

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		after: [`INSERT INTO users VALUES (1, 12)`],
	});
	expect(sqlStatements).toStrictEqual([
		`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text NOT NULL,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`,
		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
		`DROP TABLE \`users\`;`,
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
		`CREATE INDEX \`index\` ON \`users\` (\`name\`);`,
	]);
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

	const { sqlStatements, hints } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		after: [`INSERT INTO users VALUES (1, 12);`, `INSERT INTO users (id) VALUES (2);`],
	});

	expect(sqlStatements).toStrictEqual([
		`TRUNCATE TABLE \`users\`;`,
		`CREATE TABLE \`__new_users\` (
\t\`id\` int NOT NULL,
\t\`name\` text,
\tCONSTRAINT \`users_id\` PRIMARY KEY(\`id\`)
);\n`,

		`INSERT INTO \`__new_users\`(\`id\`, \`name\`) SELECT \`id\`, \`name\` FROM \`users\`;`,
		`DROP TABLE \`users\`;`,
		`ALTER TABLE \`__new_users\` RENAME TO \`users\`;`,
		`CREATE INDEX \`index\` ON \`users\` (\`name\`);`,
	]);
	expect(hints).toStrictEqual([
		`· You're about recreate ${chalk.underline('users')} table with data type changing for ${
			chalk.underline('name')
		} column, which contains 1 items`,
	]);
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
	const { sqlStatements, hints } = await diffPush({ db, init: schema1, destination: schema2 });

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \`users\` MODIFY COLUMN \`name\` text DEFAULT 'drizzle';`,
		`ALTER TABLE \`users\` ADD \`age\` int;`,
	]);
});

test('push after migrate with custom migrations table #1', async () => {
	const migrationsConfig = {
		table: undefined,
	};

	const { migrate } = await import('drizzle-orm/singlestore/migrator');
	const { drizzle } = await import('drizzle-orm/singlestore');

	await migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/singlestore/migrations',
	});

	const to = {
		table: singlestoreTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await diffPush({ db, init: {}, destination: to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});

test('push after migrate with custom migrations table #2', async () => {
	const migrationsConfig = {
		table: 'migrations',
	};
	const { migrate } = await import('drizzle-orm/singlestore/migrator');
	const { drizzle } = await import('drizzle-orm/singlestore');

	await migrate(drizzle({ client }), {
		migrationsTable: migrationsConfig.table,
		migrationsFolder: './tests/singlestore/migrations',
	});

	const to = {
		table: singlestoreTable('table1', { col1: int() }),
	};

	const { sqlStatements: st2 } = await diff({}, to, []);
	const { sqlStatements: pst2 } = await diffPush({ db, init: {}, destination: to, migrationsConfig });
	const expectedSt2 = [
		'CREATE TABLE `table1` (\n\t`col1` int\n);\n',
	];
	expect(st2).toStrictEqual(expectedSt2);
	expect(pst2).toStrictEqual(expectedSt2);
});
