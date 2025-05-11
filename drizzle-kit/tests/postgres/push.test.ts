import {
	bigint,
	bigserial,
	boolean,
	char,
	check,
	date,
	doublePrecision,
	index,
	integer,
	interval,
	json,
	jsonb,
	numeric,
	pgEnum,
	pgMaterializedView,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	real,
	serial,
	smallint,
	text,
	time,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from 'drizzle-orm/pg-core';
import { eq, SQL, sql } from 'drizzle-orm/sql';
import { suggestions } from 'src/cli/commands/push-postgres';
import { DB } from 'src/utils';
import { diff, diffPush, prepareTestDatabase, TestDatabase } from 'tests/postgres/mocks';
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest';
import { DialectSuite, run } from '../push/common';

// @vitest-environment-options {"max-concurrency":1}
let _: TestDatabase;
let db: DB;

beforeAll(async () => {
	_ = await prepareTestDatabase();
	db = _.db;
});

afterAll(async () => {
	await _.close();
});

beforeEach(async () => {
	await _.clear();
});

const pgSuite: DialectSuite = {
	async allTypes() {
		const customSchema = pgSchema('schemass');

		const transactionStatusEnum = customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']);

		const enumname = pgEnum('enumname', ['three', 'two', 'one']);

		const schema1 = {
			test: pgEnum('test', ['ds']),
			testHello: pgEnum('test_hello', ['ds']),
			enumname: pgEnum('enumname', ['three', 'two', 'one']),

			customSchema: customSchema,
			transactionStatusEnum: customSchema.enum('TransactionStatusEnum', ['PENDING', 'FAILED', 'SUCCESS']),

			allSmallSerials: pgTable('schema_test', {
				columnAll: uuid('column_all').defaultRandom(),
				column: transactionStatusEnum('column').notNull(),
			}),

			allSmallInts: customSchema.table(
				'schema_test2',
				{
					columnAll: smallint('column_all').default(124).notNull(),
					column: smallint('columns').array(),
					column1: smallint('column1').array().array(),
					column2: smallint('column2').array().array(),
					column3: smallint('column3').array(),
				},
				(t) => [uniqueIndex('testdfds').on(t.column)],
			),

			allEnums: customSchema.table(
				'all_enums',
				{
					columnAll: enumname('column_all').default('three').notNull(),
					column: enumname('columns'),
				},
				(t) => [index('ds').on(t.column)],
			),

			allTimestamps: customSchema.table('all_timestamps', {
				columnDateNow: timestamp('column_date_now', {
					precision: 1,
					withTimezone: true,
					mode: 'string',
				}).defaultNow(),
				columnAll: timestamp('column_all', { mode: 'string' }).default('2023-03-01 12:47:29.792'),
				column: timestamp('column', { mode: 'string' }).default(sql`'2023-02-28 16:18:31.18'`),
				column2: timestamp('column2', { mode: 'string', precision: 3 }).default(sql`'2023-02-28 16:18:31.18'`),
			}),

			allUuids: customSchema.table('all_uuids', {
				columnAll: uuid('column_all').defaultRandom().notNull(),
				column: uuid('column'),
			}),

			allDates: customSchema.table('all_dates', {
				column_date_now: date('column_date_now').defaultNow(),
				column_all: date('column_all', { mode: 'date' }).default(new Date()).notNull(),
				column: date('column'),
			}),

			allReals: customSchema.table('all_reals', {
				columnAll: real('column_all').default(32).notNull(),
				column: real('column'),
				columnPrimary: real('column_primary').primaryKey().notNull(),
			}),

			allBigints: pgTable('all_bigints', {
				columnAll: bigint('column_all', { mode: 'number' }).default(124).notNull(),
				column: bigint('column', { mode: 'number' }),
			}),

			allBigserials: customSchema.table('all_bigserials', {
				columnAll: bigserial('column_all', { mode: 'bigint' }).notNull(),
				column: bigserial('column', { mode: 'bigint' }).notNull(),
			}),

			allIntervals: customSchema.table('all_intervals', {
				columnAllConstrains: interval('column_all_constrains', {
					fields: 'month',
				})
					.default('1 mon')
					.notNull(),
				columnMinToSec: interval('column_min_to_sec', {
					fields: 'minute to second',
				}),
				columnWithoutFields: interval('column_without_fields').default('00:00:01').notNull(),
				column: interval('column'),
				column5: interval('column5', {
					fields: 'minute to second',
					precision: 3,
				}),
				column6: interval('column6'),
			}),

			allSerials: customSchema.table('all_serials', {
				columnAll: serial('column_all').notNull(),
				column: serial('column').notNull(),
			}),

			allTexts: customSchema.table(
				'all_texts',
				{
					columnAll: text('column_all').default('text').notNull(),
					column: text('columns').primaryKey(),
				},
				(t) => [index('test').on(t.column)],
			),

			allBools: customSchema.table('all_bools', {
				columnAll: boolean('column_all').default(true).notNull(),
				column: boolean('column'),
			}),

			allVarchars: customSchema.table('all_varchars', {
				columnAll: varchar('column_all').default('text').notNull(),
				column: varchar('column', { length: 200 }),
			}),

			allTimes: customSchema.table('all_times', {
				columnDateNow: time('column_date_now').defaultNow(),
				columnAll: time('column_all').default('22:12:12').notNull(),
				column: time('column'),
			}),

			allChars: customSchema.table('all_chars', {
				columnAll: char('column_all', { length: 1 }).default('text').notNull(),
				column: char('column', { length: 1 }),
			}),

			allDoublePrecision: customSchema.table('all_double_precision', {
				columnAll: doublePrecision('column_all').default(33.2).notNull(),
				column: doublePrecision('column'),
			}),

			allJsonb: customSchema.table('all_jsonb', {
				columnDefaultObject: jsonb('column_default_object').default({ hello: 'world world' }).notNull(),
				columnDefaultArray: jsonb('column_default_array').default({
					hello: { 'world world': ['foo', 'bar'] },
				}),
				column: jsonb('column'),
			}),

			allJson: customSchema.table('all_json', {
				columnDefaultObject: json('column_default_object').default({ hello: 'world world' }).notNull(),
				columnDefaultArray: json('column_default_array').default({
					hello: { 'world world': ['foo', 'bar'] },
					foo: 'bar',
					fe: 23,
				}),
				column: json('column'),
			}),

			allIntegers: customSchema.table('all_integers', {
				columnAll: integer('column_all').primaryKey(),
				column: integer('column'),
				columnPrimary: integer('column_primary'),
			}),

			allNumerics: customSchema.table('all_numerics', {
				columnAll: numeric('column_all', { precision: 1, scale: 1 }).default('32').notNull(),
				column: numeric('column'),
				columnPrimary: numeric('column_primary').primaryKey().notNull(),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema1,
			schemas: ['public', 'schemass'],
		});

		expect(sqlStatements).toStrictEqual([]);
	},

	async addBasicIndexes() {
		const schema1 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => [
					index()
						.on(t.name.desc(), t.id.asc().nullsLast())
						.with({ fillfactor: 70 })
						.where(sql`select 1`),
					index('indx1')
						.using('hash', t.name.desc(), sql`${t.name}`)
						.with({ fillfactor: 70 }),
				],
			),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});
		expect(sqlStatements).toStrictEqual([
			`CREATE INDEX "users_name_id_index" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE select 1;`,
			`CREATE INDEX "indx1" ON "users" USING hash ("name" DESC NULLS LAST,"name") WITH (fillfactor=70);`,
		]);
	},

	async addGeneratedColumn() {
		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await db.query(st);
		// }
	},

	async addGeneratedToColumn() {
		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name}`),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" DROP COLUMN "gen_name";',
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await db.query(st);
		// }
	},

	async dropGeneratedConstraint() {
		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name'),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ALTER COLUMN "gen_name" DROP EXPRESSION;']);
	},

	async alterGeneratedConstraint() {
		const schema1 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema1.users.name}`),
			}),
		};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([]);
	},

	async createTableWithGeneratedConstraint() {
		const schema1 = {};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "users" (\n\t"id" integer,\n\t"id2" integer,\n\t"name" text,\n\t"gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED\n);\n',
		]);
	},

	async addBasicSequences() {
		const schema1 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const schema2 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});
		expect(sqlStatements.length).toBe(0);
	},

	async changeIndexFields() {
		const schema1 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}, (t) => [
				index('removeColumn').on(t.name, t.id),
				index('addColumn').on(t.name.desc()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc(), sql`name`).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name`),
				index('changeName').on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 70 }),
				index('changeUsing').on(t.name),
			]),
		};

		const schema2 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}, (t) => [
				index('removeColumn').on(t.name),
				index('addColumn').on(t.name.desc(), t.id.nullsLast()).with({ fillfactor: 70 }),
				index('removeExpression').on(t.name.desc()).concurrently(),
				index('addExpression').on(t.id.desc()),
				index('changeExpression').on(t.id.desc(), sql`name desc`),
				index('newName').on(t.name.desc(), sql`name`).with({ fillfactor: 70 }),
				index('changeWith').on(t.name).with({ fillfactor: 90 }),
				index('changeUsing').using('hash', t.name),
			]),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'DROP INDEX "changeName";',
			'DROP INDEX "removeColumn";',
			'DROP INDEX "addColumn";',
			'DROP INDEX "removeExpression";',
			'DROP INDEX "changeWith";',
			'DROP INDEX "changeUsing";',
			'CREATE INDEX "newName" ON "users" USING btree ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
			'CREATE INDEX "removeColumn" ON "users" USING btree ("name");',
			'CREATE INDEX "addColumn" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
			'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" USING btree ("name" DESC NULLS LAST);',
			'CREATE INDEX "changeWith" ON "users" USING btree ("name") WITH (fillfactor=90);',
			'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
		]);
	},

	async dropIndex() {
		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => [index().on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 })],
			),
		};

		const schema2 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([`DROP INDEX "users_name_id_index";`]);
	},

	async indexesToBeNotTriggered() {
		const schema1 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}, (t) => [
				index('changeExpression').on(t.id.desc(), sql`name`),
				index('indx').on(t.name.desc()).concurrently(),
				index('indx1').on(t.name.desc()).where(sql`true`),
				index('indx2').on(t.name.op('text_ops')).where(sql`true`),
				index('indx3').on(sql`lower(name)`).where(sql`true`),
			]),
		};

		const schema2 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}, (t) => [
				index('changeExpression').on(t.id.desc(), sql`name desc`),
				index('indx').on(t.name.desc()),
				index('indx1').on(t.name.desc()).where(sql`false`),
				index('indx2').on(t.name.op('test')).where(sql`true`),
				index('indx3').on(sql`lower(id)`).where(sql`true`),
			]),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'DROP INDEX "indx1";',
			'CREATE INDEX "indx1" ON "users" USING btree ("name" DESC NULLS LAST) WHERE false;',
		]);
	},

	async indexesTestCase1() {
		const schema1 = {
			users: pgTable(
				'users',
				{
					id: uuid('id').defaultRandom().primaryKey(),
					name: text('name').notNull(),
					description: text('description'),
					imageUrl: text('image_url'),
					inStock: boolean('in_stock').default(true),
				},
				(t) => [
					index().on(t.id.desc().nullsFirst()),
					index('indx1').on(t.id, t.imageUrl),
					index('indx4').on(t.id),
				],
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: uuid('id').defaultRandom().primaryKey(),
					name: text('name').notNull(),
					description: text('description'),
					imageUrl: text('image_url'),
					inStock: boolean('in_stock').default(true),
				},
				(t) => [
					index().on(t.id.desc().nullsFirst()),
					index('indx1').on(t.id, t.imageUrl),
					index('indx4').on(t.id),
				],
			),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([]);
	},

	async addNotNull() {
		const schema1 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email'),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => [uniqueIndex('User_email_key').on(table.email)],
			),
		};

		const schema2 = {
			users: pgTable(
				'User',
				{
					id: text('id').primaryKey().notNull(),
					name: text('name'),
					username: text('username'),
					gh_username: text('gh_username'),
					email: text('email').notNull(),
					emailVerified: timestamp('emailVerified', {
						precision: 3,
						mode: 'date',
					}),
					image: text('image'),
					createdAt: timestamp('createdAt', { precision: 3, mode: 'date' })
						.default(sql`CURRENT_TIMESTAMP`)
						.notNull(),
					updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' })
						.notNull()
						.$onUpdate(() => new Date()),
				},
				(table) => [uniqueIndex('User_email_key').on(table.email)],
			),
		};

		const { statements, sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		const { losses, hints } = await suggestions(db, statements);

		expect(sqlStatements).toStrictEqual(['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;']);
		expect(losses).toStrictEqual([]);
	},

	async addNotNullWithDataNoRollback() {
		const schema1 = {
			users: pgTable('User', {
				id: text('id').primaryKey(),
				name: text('name'),
				username: text('username'),
				gh_username: text('gh_username'),
				email: text('email'),
				emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
				image: text('image'),
				createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
				updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
			}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
		};

		const schema2 = {
			users: pgTable('User', {
				id: text('id').primaryKey(),
				name: text('name'),
				username: text('username'),
				gh_username: text('gh_username'),
				email: text('email').notNull(),
				emailVerified: timestamp('emailVerified', { precision: 3, mode: 'date' }),
				image: text('image'),
				createdAt: timestamp('createdAt', { precision: 3, mode: 'date' }).default(sql`CURRENT_TIMESTAMP`).notNull(),
				updatedAt: timestamp('updatedAt', { precision: 3, mode: 'date' }).notNull().$onUpdate(() => new Date()),
			}, (table) => [uniqueIndex('User_email_key').on(table.email)]),
		};

		const { statements, sqlStatements } = await diffPush({ db, init: schema1, destination: schema2, after:[
			`INSERT INTO "User" (id, email, "updatedAt") values ('str', 'email@gmail', '2025-04-29 09:20:39');`
		] });

		const { hints } = await suggestions(db, statements);

		expect(hints).toStrictEqual([]);
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;']);
	},

	async createCompositePrimaryKey() {
		const schema1 = {};

		const schema2 = {
			table: pgTable('table', {
				col1: integer('col1').notNull(),
				col2: integer('col2').notNull(),
			}, (t) => [primaryKey({
				columns: [t.col1, t.col2],
			})]),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
		});

		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "table" (\n\t"col1" integer NOT NULL,\n\t"col2" integer NOT NULL,\n\tCONSTRAINT "table_pkey" PRIMARY KEY("col1","col2")\n);\n',
		]);
	},

	async renameTableWithCompositePrimaryKey() {
		const schema1 = {
			table: pgTable('table1', {
				productId: text('product_id').notNull(),
				categoryId: text('category_id').notNull(),
			}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]),
		};
		const schema2 = {
			test: pgTable('table2', {
				productId: text('product_id').notNull(),
				categoryId: text('category_id').notNull(),
			}, (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]),
		};

		const { sqlStatements } = await diffPush({
			db,
			init: schema1,
			destination: schema2,
			renames: ['public.table1->public.table2'],
		});
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "table1" RENAME TO "table2";']);
	},

	async case1() {
		// TODO: implement if needed
		expect(true).toBe(true);
	},
};

run(pgSuite);

test('full sequence: no changes', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('basic sequence: change fields', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 100000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "my_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 100000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('basic sequence: change name', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		renames: ['public.my_seq->public.my_seq2'],
	});

	expect(sqlStatements).toStrictEqual(['ALTER SEQUENCE "my_seq" RENAME TO "my_seq2";']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('basic sequence: change name and fields', async () => {
	const schema1 = {
		seq: pgSequence('my_seq', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 2,
		}),
	};

	const schema2 = {
		seq: pgSequence('my_seq2', {
			startWith: 100,
			maxValue: 10000,
			minValue: 100,
			cycle: true,
			cache: 10,
			increment: 4,
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		renames: ['public.my_seq->public.my_seq2'],
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "my_seq" RENAME TO "my_seq2";',
		'ALTER SEQUENCE "my_seq2" INCREMENT BY 4 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

// identity push tests
test('create table: identity always/by default - no params', async () => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity(),
			id2: smallint('id2').generatedByDefaultAsIdentity(),
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1)\n);\n',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create table: identity always/by default - few params', async () => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ increment: 4 }),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity({
				startWith: 120,
				maxValue: 17000,
			}),
			id2: smallint('id2').generatedByDefaultAsIdentity({ cycle: true }),
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create table: identity always/by default - all params', async () => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				increment: 4,
				minValue: 100,
			}),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity({
				startWith: 120,
				maxValue: 17000,
				increment: 3,
				cycle: true,
				cache: 100,
			}),
			id2: smallint('id2').generatedByDefaultAsIdentity({ cycle: true }),
		}),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 2147483647 START WITH 100 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 3 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 100 CYCLE),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('no diff: identity always/by default - no params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id2: integer('id2').generatedAlwaysAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id2: integer('id2').generatedAlwaysAsIdentity(),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - few params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				increment: 1,
				startWith: 3,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				increment: 1,
				startWith: 3,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - all params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				name: 'custom_name',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});
	expect(sqlStatements).toStrictEqual([]);
});

test('drop identity from a column - no params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop identity from a column - few params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedByDefaultAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				name: 'custom_name2',
				increment: 4,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop identity from a column - all params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id1: integer('id1').generatedByDefaultAsIdentity({
				name: 'custom_name1',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
			id2: integer('id2').generatedAlwaysAsIdentity({
				name: 'custom_name2',
				startWith: 10,
				minValue: 10,
				maxValue: 1000,
				cycle: true,
				cache: 10,
				increment: 2,
			}),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
			id2: integer('id2'),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter identity from a column - no params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ALTER COLUMN "id" SET START WITH 100;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter identity from a column - few params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter identity from a column - by default to always', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED ALWAYS;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter identity from a column - always to by default', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').generatedAlwaysAsIdentity({ startWith: 100 }),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({
				startWith: 100,
				increment: 4,
				maxValue: 10000,
				cycle: true,
				cache: 100,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED BY DEFAULT;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CACHE 100;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CYCLE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('add column with identity - few params', async () => {
	const schema1 = {
		users: pgTable('users', {
			email: text('email'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			email: text('email'),
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedAlwaysAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ADD COLUMN "id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ADD COLUMN "id1" integer GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await db.query(st);
	// }
});

test('add identity to column - few params', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id'),
			id1: integer('id1'),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity({ name: 'custom_name' }),
			id1: integer('id1').generatedAlwaysAsIdentity({
				name: 'custom_name1',
				increment: 4,
			}),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ALTER COLUMN "id1" ADD GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await db.query(st);
	// }
});

test('add array column - empty array default', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([]),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{}\';']);
});

test('add array column - default', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual(['ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{1,2,3}\';']);
});

test('create view', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual(['CREATE VIEW "view" AS (select distinct "id" from "test");']);
});

test('add check constraint to table', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').array().default([1, 2, 3]),
		}, (table) => [
			check('some_check1', sql`${table.values} < 100`),
			check('some_check2', sql`'test' < 100`),
		]),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" ADD CONSTRAINT "some_check1" CHECK ("test"."values" < 100);',
		`ALTER TABLE "test" ADD CONSTRAINT "some_check2" CHECK ('test' < 100);`,
	]);
});

test('create materialized view', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.withNoData()
			.using('heap')
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});
	expect(sqlStatements).toStrictEqual([
		'CREATE MATERIALIZED VIEW "view" USING "heap" AS (select distinct "id" from "test") WITH NO DATA;',
	]);
});

test('drop check constraint', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => [
			check('some_check', sql`${table.values} < 100`),
		]),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" DROP CONSTRAINT "some_check";',
	]);
});

test('Column with same name as enum', async () => {
	const statusEnum = pgEnum('status', ['inactive', 'active', 'banned']);

	const schema1 = {
		statusEnum,
		table1: pgTable('table1', {
			id: serial('id').primaryKey(),
		}),
	};

	const schema2 = {
		statusEnum,
		table1: pgTable('table1', {
			id: serial('id').primaryKey(),
			status: statusEnum('status').default('inactive'),
		}),
		table2: pgTable('table2', {
			id: serial('id').primaryKey(),
			status: statusEnum('status').default('inactive'),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "table2" (\n\t"id" serial PRIMARY KEY,\n\t"status" "status" DEFAULT \'inactive\'\n);\n',
		'ALTER TABLE "table1" ADD COLUMN "status" "status" DEFAULT \'inactive\';',
	]);
});

test('db has checks. Push with same names', async () => {
	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => [check('some_check', sql`${table.values} < 100`)]),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => [check('some_check', sql`some new value`)]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('drop view', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});
	expect(sqlStatements).toStrictEqual(['DROP VIEW "view";']);
});

test('drop materialized view', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual(['DROP MATERIALIZED VIEW "view";']);
});

test('push view with same name', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('push materialized view with same name', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table).where(eq(table.id, 1))),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('add with options for materialized view', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.with({ autovacuumFreezeTableAge: 1, autovacuumEnabled: false })
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER MATERIALIZED VIEW "view" SET (autovacuum_enabled = false, autovacuum_freeze_table_age = 1);`,
	]);
});

test('add with options to materialized', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view').as((qb) => qb.selectDistinct().from(table)),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view')
			.with({ autovacuumVacuumCostDelay: 100, vacuumTruncate: false })
			.as((qb) => qb.selectDistinct().from(table)),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER MATERIALIZED VIEW "view" SET (autovacuum_vacuum_cost_delay = 100, vacuum_truncate = false);`,
	]);
});

test('add with options to materialized with existing flag', async () => {
	const table = pgTable('test', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT id FROM "test"`),
	};

	const schema2 = {
		test: table,
		view: pgMaterializedView('view', {}).with({ autovacuumVacuumCostDelay: 100, vacuumTruncate: false }).existing(),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop mat view with data', async () => {
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const seedStatements = [`INSERT INTO "table" ("id") VALUES (1), (2), (3)`];

	const {
		statements,
		sqlStatements,
		losses,
		hints,
	} = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		after: seedStatements,
	});

	expect(sqlStatements).toStrictEqual([`DROP MATERIALIZED VIEW "view";`]);
	expect(hints).toStrictEqual(['· You\'re about to delete non-empty "view" materialized view']);
	expect(losses).toStrictEqual([]);
});

test('drop mat view without data', async () => {
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgMaterializedView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const {
		statements,
		sqlStatements,
		hints,
	} = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([`DROP MATERIALIZED VIEW "view";`]);
	expect(hints).toStrictEqual([]);
});

test('drop view with data', async () => {
	const table = pgTable('table', {
		id: serial('id').primaryKey(),
	});
	const schema1 = {
		test: table,
		view: pgView('view', {}).as(sql`SELECT * FROM ${table}`),
	};

	const schema2 = {
		test: table,
	};

	const seedStatements = [`INSERT INTO "table" ("id") VALUES (1), (2), (3)`];

	const {
		statements,
		sqlStatements,
		hints,
	} = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		after: seedStatements,
	});

	expect(sqlStatements).toStrictEqual([`DROP VIEW "view";`]);
	expect(hints).toStrictEqual([]);
});

test('enums ordering', async () => {
	const schema2 = {
		enum1: pgEnum('settings', [
			'custAll',
			'custAdmin',
			'custClerk',
			'custInvoiceManager',
			'custMgf',
			'custApprover',
			'custOrderWriter',
			'custBuyer',
		]),
	};

	const { sqlStatements: createEnum } = await diff({}, schema2, []);

	const schema3 = {
		enum2: pgEnum('settings', [
			'addedToTop',
			'custAll',
			'custAdmin',
			'custClerk',
			'custInvoiceManager',
			'custMgf',
			'custApprover',
			'custOrderWriter',
			'custBuyer',
		]),
	};

	const { sqlStatements: addedValueSql } = await diff(schema2, schema3, []);

	const schema4 = {
		enum3: pgEnum('settings', [
			'addedToTop',
			'custAll',
			'custAdmin',
			'custClerk',
			'custInvoiceManager',
			'addedToMiddle',
			'custMgf',
			'custApprover',
			'custOrderWriter',
			'custBuyer',
		]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema3,
		destination: schema4,
		before: [...createEnum, ...addedValueSql],
		apply: false,
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER TYPE "settings" ADD VALUE 'addedToMiddle' BEFORE 'custMgf';`,
	]);
});

test('drop enum values', async () => {
	const newSchema = pgSchema('mySchema');
	const enum3 = pgEnum('enum_users_customer_and_ship_to_settings_roles', [
		'addedToTop',
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'addedToMiddle',
		'custMgf',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema1 = {
		enum3,
		table: pgTable('enum_table', {
			id: enum3(),
		}),
		newSchema,
		table1: newSchema.table('enum_table', {
			id: enum3(),
		}),
	};

	const enum4 = pgEnum('enum_users_customer_and_ship_to_settings_roles', [
		'addedToTop',
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema2 = {
		enum4,
		table: pgTable('enum_table', {
			id: enum4(),
		}),
		newSchema,
		table1: newSchema.table('enum_table', {
			id: enum4(),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		schemas: ['public', 'mySchema'],
	});

	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
		`DROP TYPE "enum_users_customer_and_ship_to_settings_roles";`,
		`CREATE TYPE "enum_users_customer_and_ship_to_settings_roles" AS ENUM('addedToTop', 'custAll', 'custAdmin', 'custClerk', 'custInvoiceManager', 'custApprover', 'custOrderWriter', 'custBuyer');`,
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE "enum_users_customer_and_ship_to_settings_roles" USING "id"::"enum_users_customer_and_ship_to_settings_roles";`,
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE "enum_users_customer_and_ship_to_settings_roles" USING "id"::"enum_users_customer_and_ship_to_settings_roles";`,
	]);
});

test('column is enum type with default value. shuffle enum', async () => {
	const enum1 = pgEnum('enum', ['value1', 'value2', 'value3']);

	const from = {
		enum1,
		table: pgTable('table', {
			column: enum1('column').default('value2'),
		}),
	};

	const enum2 = pgEnum('enum', ['value1', 'value3', 'value2']);
	const to = {
		enum2,
		table: pgTable('table', {
			column: enum2('column').default('value2'),
		}),
	};

	const { sqlStatements } = await diffPush({ db, init: from, destination: to });

	expect(sqlStatements).toStrictEqual(
		[
			`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`,
			`ALTER TABLE "table" ALTER COLUMN "column" DROP DEFAULT;`,
			`DROP TYPE "enum";`,
			`CREATE TYPE "enum" AS ENUM('value1', 'value3', 'value2');`,
			'ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "enum" USING "column"::"enum";',
			'ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT \'value2\';',
		],
	);
});

// Policies and Roles push test
test('full policy: no changes', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('add policy', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop policy', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('add policy without enable rls', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' }), pgPolicy('newRls')]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop policy without disable rls', async () => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' }), pgPolicy('oldRls')]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "oldRls" ON "users" CASCADE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

////

test('alter policy without recreation: changing roles', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', to: 'current_role' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy without recreation: changing using', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', using: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy without recreation: changing with check', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', withCheck: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy with recreation: changing as', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy with recreation: changing for', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'delete' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy with recreation: changing both "as" and "for"', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive', for: 'insert' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter policy with recreation: changing all fields', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive', for: 'select', using: sql`true` })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'restrictive', to: 'current_role', withCheck: sql`true` })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_role WITH CHECK (true);',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('rename policy', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('newName', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		renames: ['public.users.test->public.users.newName'],
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('rename policy in renamed table', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('newName', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		renames: ['public.users->public.users2', 'public.users2.test->public.users2.newName'],
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER POLICY "test" ON "users2" RENAME TO "newName";',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create table with a policy', async (t) => {
	const schema1 = {};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users2" (\n\t"id" integer PRIMARY KEY\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop table with a policy', async (t) => {
	const schema1 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { as: 'permissive' })]),
	};

	const schema2 = {};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users2" CASCADE;',
		'DROP TABLE "users2" CASCADE;',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('add policy with multiple "to" roles', async (t) => {
	db.query(`CREATE ROLE manager;`);

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const role = pgRole('manager').existing();

	const schema2 = {
		role,
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => [pgPolicy('test', { to: ['current_role', role] })]),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('rename policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diff({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('newName', { as: 'permissive' }).link(users),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		renames: ['public.users.test->public.users.newName'],
		before: createUsers,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
});

test('alter policy that is linked', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diff({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }).link(users),
	};
	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		before: createUsers,
	});

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
});

test('alter policy that is linked: withCheck', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diff({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		before: createUsers,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diff({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		before: createUsers,
	});

	expect(sqlStatements).toStrictEqual([]);
});

test('alter policy that is linked: using', async (t) => {
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diff({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { for: 'delete' }).link(users),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,

		before: createUsers,
	});

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
});

////

test('create role', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager'),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager";']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create role with properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false, createRole: true }),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create role with some properties', async (t) => {
	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false }),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB NOINHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('drop role', async (t) => {
	const schema1 = { manager: pgRole('manager') };

	const schema2 = {};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('create and drop role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { statements, sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";', 'CREATE ROLE "admin";']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('rename role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		renames: ['manager->admin'],
		entities: { roles: { include: ['manager', 'admin'] } },
	});

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" RENAME TO "admin";']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter all role field', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, createRole: true, inherit: false }),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter createdb in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE INHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter createrole in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE INHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});

test('alter inherit in role', async (t) => {
	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { sqlStatements } = await diffPush({
		db,
		init: schema1,
		destination: schema2,
		entities: { roles: { include: ['manager'] } },
	});

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB NOCREATEROLE NOINHERIT;']);

	for (const st of sqlStatements) {
		await db.query(st);
	}
});
