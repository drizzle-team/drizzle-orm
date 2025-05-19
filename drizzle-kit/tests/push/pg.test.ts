import { PGlite } from '@electric-sql/pglite';
import chalk from 'chalk';
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
import { drizzle } from 'drizzle-orm/pglite';
import { eq, SQL, sql } from 'drizzle-orm/sql';
import { pgSuggestions } from 'src/cli/commands/pgPushUtils';
import { diffTestSchemas, diffTestSchemasPush } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';
import { DialectSuite, run } from './common';

const pgSuite: DialectSuite = {
	async allTypes() {
		const client = new PGlite();

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
				(t) => ({
					cd: uniqueIndex('testdfds').on(t.column),
				}),
			),

			allEnums: customSchema.table(
				'all_enums',
				{
					columnAll: enumname('column_all').default('three').notNull(),
					column: enumname('columns'),
				},
				(t) => ({
					d: index('ds').on(t.column),
				}),
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
				(t) => ({
					cd: index('test').on(t.column),
				}),
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

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema1, [], false, [
			'public',
			'schemass',
		]);
		expect(statements.length).toBe(0);
	},

	async addBasicIndexes() {
		const client = new PGlite();

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
				(t) => ({
					indx: index()
						.on(t.name.desc(), t.id.asc().nullsLast())
						.with({ fillfactor: 70 })
						.where(sql`select 1`),
					indx1: index('indx1')
						.using('hash', t.name.desc(), sql`${t.name}`)
						.with({ fillfactor: 70 }),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);
		expect(statements.length).toBe(2);
		expect(statements[0]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'create_index_pg',
			data: {
				columns: [
					{
						asc: false,
						expression: 'name',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
					{
						asc: true,
						expression: 'id',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
				],
				concurrently: false,
				isUnique: false,
				method: 'btree',
				name: 'users_name_id_index',
				where: 'select 1',
				with: {
					fillfactor: 70,
				},
			},
		});
		expect(statements[1]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'create_index_pg',
			data: {
				columns: [
					{
						asc: false,
						expression: 'name',
						isExpression: false,
						nulls: 'last',
						opclass: undefined,
					},
					{
						asc: true,
						expression: '"name"',
						isExpression: true,
						nulls: 'last',
					},
				],
				concurrently: false,
				isUnique: false,
				method: 'hash',
				name: 'indx1',
				where: undefined,
				with: {
					fillfactor: 70,
				},
			},
		});
		expect(sqlStatements.length).toBe(2);
		expect(sqlStatements[0]).toBe(
			`CREATE INDEX "users_name_id_index" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70) WHERE select 1;`,
		);
		expect(sqlStatements[1]).toBe(
			`CREATE INDEX "indx1" ON "users" USING hash ("name" DESC NULLS LAST,"name") WITH (fillfactor=70);`,
		);
	},

	async addGeneratedColumn() {
		const client = new PGlite();

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

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements).toStrictEqual([
			{
				column: {
					generated: {
						as: '"users"."name"',
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
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await client.query(st);
		// }
	},

	async addGeneratedToColumn() {
		const client = new PGlite();

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

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: undefined,
				columnDefault: undefined,
				columnGenerated: {
					as: '"users"."name"',
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
		]);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "users" drop column "gen_name";',
			'ALTER TABLE "users" ADD COLUMN "gen_name" text GENERATED ALWAYS AS ("users"."name") STORED;',
		]);

		// for (const st of sqlStatements) {
		//   await client.query(st);
		// }
	},

	async dropGeneratedConstraint() {
		const client = new PGlite();

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

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements).toStrictEqual([
			{
				columnAutoIncrement: undefined,
				columnDefault: undefined,
				columnGenerated: undefined,
				columnName: 'gen_name',
				columnNotNull: false,
				columnOnUpdate: undefined,
				columnPk: false,
				newDataType: 'text',
				schema: '',
				tableName: 'users',
				type: 'alter_table_alter_column_drop_generated',
			},
		]);
		expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ALTER COLUMN "gen_name" DROP EXPRESSION;']);
	},

	async alterGeneratedConstraint() {
		const client = new PGlite();

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

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements).toStrictEqual([]);
		expect(sqlStatements).toStrictEqual([]);
	},

	async createTableWithGeneratedConstraint() {
		const client = new PGlite();

		const schema1 = {};
		const schema2 = {
			users: pgTable('users', {
				id: integer('id'),
				id2: integer('id2'),
				name: text('name'),
				generatedName: text('gen_name').generatedAlwaysAs((): SQL => sql`${schema2.users.name} || 'hello'`),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements).toStrictEqual([
			{
				columns: [
					{
						name: 'id',
						notNull: false,
						primaryKey: false,
						type: 'integer',
					},
					{
						name: 'id2',
						notNull: false,
						primaryKey: false,
						type: 'integer',
					},
					{
						name: 'name',
						notNull: false,
						primaryKey: false,
						type: 'text',
					},
					{
						generated: {
							as: '"users"."name" || \'hello\'',
							type: 'stored',
						},
						name: 'gen_name',
						notNull: false,
						primaryKey: false,
						type: 'text',
					},
				],
				compositePKs: [],
				compositePkName: '',
				isRLSEnabled: false,
				schema: '',
				tableName: 'users',
				policies: [],
				type: 'create_table',
				uniqueConstraints: [],
				checkConstraints: [],
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "users" (\n\t"id" integer,\n\t"id2" integer,\n\t"name" text,\n\t"gen_name" text GENERATED ALWAYS AS ("users"."name" || \'hello\') STORED\n);\n',
		]);
	},

	async addBasicSequences() {
		const client = new PGlite();

		const schema1 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const schema2 = {
			seq: pgSequence('my_seq', { startWith: 100 }),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);
		expect(statements.length).toBe(0);
	},

	async changeIndexFields() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					removeColumn: index('removeColumn').on(t.name, t.id),
					addColumn: index('addColumn').on(t.name.desc()).with({ fillfactor: 70 }),
					removeExpression: index('removeExpression')
						.on(t.name.desc(), sql`name`)
						.concurrently(),
					addExpression: index('addExpression').on(t.id.desc()),
					changeExpression: index('changeExpression').on(t.id.desc(), sql`name`),
					changeName: index('changeName').on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
					changeWith: index('changeWith').on(t.name).with({ fillfactor: 70 }),
					changeUsing: index('changeUsing').on(t.name),
				}),
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					removeColumn: index('removeColumn').on(t.name),
					addColumn: index('addColumn').on(t.name.desc(), t.id.nullsLast()).with({ fillfactor: 70 }),
					removeExpression: index('removeExpression').on(t.name.desc()).concurrently(),
					addExpression: index('addExpression').on(t.id.desc()),
					changeExpression: index('changeExpression').on(t.id.desc(), sql`name desc`),
					changeName: index('newName')
						.on(t.name.desc(), sql`name`)
						.with({ fillfactor: 70 }),
					changeWith: index('changeWith').on(t.name).with({ fillfactor: 90 }),
					changeUsing: index('changeUsing').using('hash', t.name),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(sqlStatements).toStrictEqual([
			'DROP INDEX "changeName";',
			'DROP INDEX "addColumn";',
			'DROP INDEX "changeExpression";',
			'DROP INDEX "changeUsing";',
			'DROP INDEX "changeWith";',
			'DROP INDEX "removeColumn";',
			'DROP INDEX "removeExpression";',
			'CREATE INDEX "newName" ON "users" USING btree ("name" DESC NULLS LAST,name) WITH (fillfactor=70);',
			'CREATE INDEX "addColumn" ON "users" USING btree ("name" DESC NULLS LAST,"id") WITH (fillfactor=70);',
			'CREATE INDEX "changeExpression" ON "users" USING btree ("id" DESC NULLS LAST,name desc);',
			'CREATE INDEX "changeUsing" ON "users" USING hash ("name");',
			'CREATE INDEX "changeWith" ON "users" USING btree ("name") WITH (fillfactor=90);',
			'CREATE INDEX "removeColumn" ON "users" USING btree ("name");',
			'CREATE INDEX CONCURRENTLY "removeExpression" ON "users" USING btree ("name" DESC NULLS LAST);',
		]);
	},

	async dropIndex() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index().on(t.name.desc(), t.id.asc().nullsLast()).with({ fillfactor: 70 }),
				}),
			),
		};

		const schema2 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: text('name'),
			}),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements.length).toBe(1);
		expect(statements[0]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'drop_index',
			data: 'users_name_id_index;name--false--last,,id--true--last;false;btree;{"fillfactor":"70"}',
		});

		expect(sqlStatements.length).toBe(1);
		expect(sqlStatements[0]).toBe(`DROP INDEX "users_name_id_index";`);
	},

	async indexesToBeNotTriggered() {
		const client = new PGlite();

		const schema1 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index('indx').on(t.name.desc()).concurrently(),
					indx1: index('indx1')
						.on(t.name.desc())
						.where(sql`true`),
					indx2: index('indx2')
						.on(t.name.op('text_ops'))
						.where(sql`true`),
					indx3: index('indx3')
						.on(sql`lower(name)`)
						.where(sql`true`),
				}),
			),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					name: text('name'),
				},
				(t) => ({
					indx: index('indx').on(t.name.desc()),
					indx1: index('indx1')
						.on(t.name.desc())
						.where(sql`false`),
					indx2: index('indx2')
						.on(t.name.op('test'))
						.where(sql`true`),
					indx3: index('indx3')
						.on(sql`lower(id)`)
						.where(sql`true`),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements.length).toBe(0);
	},

	async indexesTestCase1() {
		const client = new PGlite();

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
				(t) => ({
					indx: index().on(t.id.desc().nullsFirst()),
					indx1: index('indx1').on(t.id, t.imageUrl),
					indx2: index('indx4').on(t.id),
				}),
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
				(t) => ({
					indx: index().on(t.id.desc().nullsFirst()),
					indx1: index('indx1').on(t.id, t.imageUrl),
					indx2: index('indx4').on(t.id),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

		expect(statements.length).toBe(0);
	},

	async addNotNull() {
		const client = new PGlite();

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
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
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
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);
		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows as any[];
		};

		const { statementsToExecute } = await pgSuggestions({ query }, statements);

		expect(statementsToExecute).toStrictEqual(['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;']);
	},

	async addNotNullWithDataNoRollback() {
		const client = new PGlite();
		const db = drizzle(client);

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
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
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
				(table) => {
					return {
						emailKey: uniqueIndex('User_email_key').on(table.email),
					};
				},
			),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);
		const query = async (sql: string, params?: any[]) => {
			const result = await client.query(sql, params ?? []);
			return result.rows as any[];
		};

		await db.insert(schema1.users).values({ id: 'str', email: 'email@gmail' });

		const { statementsToExecute, shouldAskForApprove } = await pgSuggestions({ query }, statements);

		expect(statementsToExecute).toStrictEqual(['ALTER TABLE "User" ALTER COLUMN "email" SET NOT NULL;']);

		expect(shouldAskForApprove).toBeFalsy();
	},

	async createCompositePrimaryKey() {
		const client = new PGlite();

		const schema1 = {};

		const schema2 = {
			table: pgTable('table', {
				col1: integer('col1').notNull(),
				col2: integer('col2').notNull(),
			}, (t) => ({
				pk: primaryKey({
					columns: [t.col1, t.col2],
				}),
			})),
		};

		const { statements, sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			[],
			false,
			['public'],
		);

		expect(statements).toStrictEqual([
			{
				type: 'create_table',
				tableName: 'table',
				schema: '',
				compositePKs: ['col1,col2;table_col1_col2_pk'],
				compositePkName: 'table_col1_col2_pk',
				isRLSEnabled: false,
				policies: [],
				uniqueConstraints: [],
				checkConstraints: [],
				columns: [
					{ name: 'col1', type: 'integer', primaryKey: false, notNull: true },
					{ name: 'col2', type: 'integer', primaryKey: false, notNull: true },
				],
			},
		]);
		expect(sqlStatements).toStrictEqual([
			'CREATE TABLE "table" (\n\t"col1" integer NOT NULL,\n\t"col2" integer NOT NULL,\n\tCONSTRAINT "table_col1_col2_pk" PRIMARY KEY("col1","col2")\n);\n',
		]);
	},

	async renameTableWithCompositePrimaryKey() {
		const client = new PGlite();

		const productsCategoriesTable = (tableName: string) => {
			return pgTable(tableName, {
				productId: text('product_id').notNull(),
				categoryId: text('category_id').notNull(),
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

		const { sqlStatements } = await diffTestSchemasPush(
			client,
			schema1,
			schema2,
			['public.products_categories->public.products_to_categories'],
			false,
			['public'],
		);
		expect(sqlStatements).toStrictEqual([
			'ALTER TABLE "products_categories" RENAME TO "products_to_categories";',
			'ALTER TABLE "products_to_categories" DROP CONSTRAINT "products_categories_product_id_category_id_pk";',
			'ALTER TABLE "products_to_categories" ADD CONSTRAINT "products_to_categories_product_id_category_id_pk" PRIMARY KEY("product_id","category_id");',
		]);
	},

	// async addVectorIndexes() {
	//   const client = new PGlite();

	//   const schema1 = {
	//     users: pgTable("users", {
	//       id: serial("id").primaryKey(),
	//       name: vector("name", { dimensions: 3 }),
	//     }),
	//   };

	//   const schema2 = {
	//     users: pgTable(
	//       "users",
	//       {
	//         id: serial("id").primaryKey(),
	//         embedding: vector("name", { dimensions: 3 }),
	//       },
	//       (t) => ({
	//         indx2: index("vector_embedding_idx")
	//           .using("hnsw", t.embedding.op("vector_ip_ops"))
	//           .with({ m: 16, ef_construction: 64 }),
	//       })
	//     ),
	//   };

	//   const { statements, sqlStatements } = await diffTestSchemasPush(
	//     client,
	//     schema1,
	//     schema2,
	//     [],
	//     false,
	//     ["public"]
	//   );
	//   expect(statements.length).toBe(1);
	//   expect(statements[0]).toStrictEqual({
	//     schema: "",
	//     tableName: "users",
	//     type: "create_index",
	//     data: 'vector_embedding_idx;name,true,last,vector_ip_ops;false;false;hnsw;undefined;{"m":16,"ef_construction":64}',
	//   });
	//   expect(sqlStatements.length).toBe(1);
	//   expect(sqlStatements[0]).toBe(
	//     `CREATE INDEX IF NOT EXISTS "vector_embedding_idx" ON "users" USING hnsw (name vector_ip_ops) WITH (m=16,ef_construction=64);`
	//   );
	// },
	async case1() {
		// TODO: implement if needed
		expect(true).toBe(true);
	},
};

run(pgSuite);

test('full sequence: no changes', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change fields', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			type: 'alter_sequence',
			schema: 'public',
			name: 'my_seq',
			values: {
				minValue: '100',
				maxValue: '100000',
				increment: '4',
				startWith: '100',
				cache: '10',
				cycle: true,
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."my_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 100000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change name', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.my_seq->public.my_seq2'],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			nameFrom: 'my_seq',
			nameTo: 'my_seq2',
			schema: 'public',
			type: 'rename_sequence',
		},
	]);
	expect(sqlStatements).toStrictEqual(['ALTER SEQUENCE "public"."my_seq" RENAME TO "my_seq2";']);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('basic sequence: change name and fields', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.my_seq->public.my_seq2'],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			nameFrom: 'my_seq',
			nameTo: 'my_seq2',
			schema: 'public',
			type: 'rename_sequence',
		},
		{
			name: 'my_seq2',
			schema: 'public',
			type: 'alter_sequence',
			values: {
				cache: '10',
				cycle: true,
				increment: '4',
				maxValue: '10000',
				minValue: '100',
				startWith: '100',
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER SEQUENCE "public"."my_seq" RENAME TO "my_seq2";',
		'ALTER SEQUENCE "public"."my_seq2" INCREMENT BY 4 MINVALUE 100 MAXVALUE 10000 START WITH 100 CACHE 10 CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

// identity push tests
test('create table: identity always/by default - no params', async () => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').generatedByDefaultAsIdentity(),
			id1: bigint('id1', { mode: 'number' }).generatedByDefaultAsIdentity(),
			id2: smallint('id2').generatedByDefaultAsIdentity(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;1;2147483647;1;1;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;9223372036854775807;1;1;1;false',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;false',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			schema: '',
			tableName: 'users',
			policies: [],
			type: 'create_table',
			uniqueConstraints: [],
			isRLSEnabled: false,
			checkConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create table: identity always/by default - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;1;2147483647;4;1;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;17000;1;120;1;false',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;true',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			policies: [],
			schema: '',
			tableName: 'users',
			type: 'create_table',
			isRLSEnabled: false,
			uniqueConstraints: [],
			checkConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 1),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create table: identity always/by default - all params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columns: [
				{
					identity: 'users_id_seq;byDefault;100;2147483647;4;100;1;false',
					name: 'id',
					notNull: true,
					primaryKey: false,
					type: 'integer',
				},
				{
					identity: 'users_id1_seq;byDefault;1;17000;3;120;100;true',
					name: 'id1',
					notNull: true,
					primaryKey: false,
					type: 'bigint',
				},
				{
					identity: 'users_id2_seq;byDefault;1;32767;1;1;1;true',
					name: 'id2',
					notNull: true,
					primaryKey: false,
					type: 'smallint',
				},
			],
			compositePKs: [],
			compositePkName: '',
			schema: '',
			tableName: 'users',
			type: 'create_table',
			policies: [],
			isRLSEnabled: false,
			uniqueConstraints: [],
			checkConstraints: [],
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users" (\n\t"id" integer GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id_seq" INCREMENT BY 4 MINVALUE 100 MAXVALUE 2147483647 START WITH 100 CACHE 1),\n\t"id1" bigint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id1_seq" INCREMENT BY 3 MINVALUE 1 MAXVALUE 17000 START WITH 120 CACHE 100 CYCLE),\n\t"id2" smallint GENERATED BY DEFAULT AS IDENTITY (sequence name "users_id2_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 32767 START WITH 1 CACHE 1 CYCLE)\n);\n',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('no diff: identity always/by default - no params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('no diff: identity always/by default - all params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('drop identity from a column - no params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop identity from a column - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id1',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id2',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop identity from a column - all params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id1',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
		{
			columnName: 'id2',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_drop_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		`ALTER TABLE \"users\" ALTER COLUMN \"id\" DROP IDENTITY;`,
		'ALTER TABLE "users" ALTER COLUMN "id1" DROP IDENTITY;',
		'ALTER TABLE "users" ALTER COLUMN "id2" DROP IDENTITY;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - no params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "users" ALTER COLUMN "id" SET START WITH 100;']);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;10000;4;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - by default to always', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;always;1;10000;4;100;1;false',
			oldIdentity: 'users_id_seq;byDefault;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED ALWAYS;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter identity from a column - always to by default', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'users_id_seq;byDefault;1;10000;4;100;100;true',
			oldIdentity: 'users_id_seq;always;1;2147483647;1;100;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_change_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" SET GENERATED BY DEFAULT;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET MAXVALUE 10000;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET INCREMENT BY 4;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CACHE 100;',
		'ALTER TABLE "users" ALTER COLUMN "id" SET CYCLE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('add column with identity - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			column: {
				identity: 'custom_name;byDefault;1;2147483647;1;1;1;false',
				name: 'id',
				notNull: true,
				primaryKey: false,
				type: 'integer',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
		{
			column: {
				identity: 'custom_name1;always;1;2147483647;4;1;1;false',
				name: 'id1',
				notNull: true,
				primaryKey: false,
				type: 'integer',
			},
			schema: '',
			tableName: 'users',
			type: 'alter_table_add_column',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ADD COLUMN "id" integer NOT NULL GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ADD COLUMN "id1" integer NOT NULL GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await client.query(st);
	// }
});

test('add identity to column - few params', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			columnName: 'id',
			identity: 'custom_name;byDefault;1;2147483647;1;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_identity',
		},
		{
			columnName: 'id1',
			identity: 'custom_name1;always;1;2147483647;4;1;1;false',
			schema: '',
			tableName: 'users',
			type: 'alter_table_alter_column_set_identity',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (sequence name "custom_name" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
		'ALTER TABLE "users" ALTER COLUMN "id1" ADD GENERATED ALWAYS AS IDENTITY (sequence name "custom_name1" INCREMENT BY 4 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1);',
	]);

	// for (const st of sqlStatements) {
	//   await client.query(st);
	// }
});

test('add array column - empty array default', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			type: 'alter_table_add_column',
			tableName: 'test',
			schema: '',
			column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{}'" },
		},
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{}\';']);
});

test('add array column - default', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			type: 'alter_table_add_column',
			tableName: 'test',
			schema: '',
			column: { name: 'values', type: 'integer[]', primaryKey: false, notNull: false, default: "'{1,2,3}'" },
		},
	]);
	expect(sqlStatements).toStrictEqual(['ALTER TABLE "test" ADD COLUMN "values" integer[] DEFAULT \'{1,2,3}\';']);
});

test('create view', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			definition: 'select distinct "id" from "test"',
			name: 'view',
			schema: 'public',
			type: 'create_view',
			with: undefined,
			materialized: false,
			tablespace: undefined,
			using: undefined,
			withNoData: false,
		},
	]);
	expect(sqlStatements).toStrictEqual(['CREATE VIEW "public"."view" AS (select distinct "id" from "test");']);
});

test('add check constraint to table', async () => {
	const client = new PGlite();

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
		}, (table) => ({
			checkConstraint1: check('some_check1', sql`${table.values} < 100`),
			checkConstraint2: check('some_check2', sql`'test' < 100`),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			type: 'create_check_constraint',
			tableName: 'test',
			schema: '',
			data: 'some_check1;"test"."values" < 100',
		},
		{
			data: "some_check2;'test' < 100",
			schema: '',
			tableName: 'test',
			type: 'create_check_constraint',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" ADD CONSTRAINT "some_check1" CHECK ("test"."values" < 100);',
		`ALTER TABLE "test" ADD CONSTRAINT "some_check2" CHECK ('test' < 100);`,
	]);
});

test('create materialized view', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			definition: 'select distinct "id" from "test"',
			name: 'view',
			schema: 'public',
			type: 'create_view',
			with: undefined,
			materialized: true,
			tablespace: undefined,
			using: 'heap',
			withNoData: true,
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE MATERIALIZED VIEW "public"."view" USING "heap" AS (select distinct "id" from "test") WITH NO DATA;',
	]);
});

test('drop check constraint', async () => {
	const client = new PGlite();

	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => ({
			checkConstraint: check('some_check', sql`${table.values} < 100`),
		})),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'delete_check_constraint',
			tableName: 'test',
			schema: '',
			constraintName: 'some_check',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "test" DROP CONSTRAINT "some_check";',
	]);
});

test('Column with same name as enum', async () => {
	const client = new PGlite();
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

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'create_table',
			tableName: 'table2',
			schema: '',
			compositePKs: [],
			compositePkName: '',
			isRLSEnabled: false,
			policies: [],
			uniqueConstraints: [],
			checkConstraints: [],
			columns: [
				{ name: 'id', type: 'serial', primaryKey: true, notNull: true },
				{
					name: 'status',
					type: 'status',
					typeSchema: 'public',
					primaryKey: false,
					notNull: false,
					default: "'inactive'",
				},
			],
		},
		{
			type: 'alter_table_add_column',
			tableName: 'table1',
			schema: '',
			column: {
				name: 'status',
				type: 'status',
				typeSchema: 'public',
				primaryKey: false,
				notNull: false,
				default: "'inactive'",
			},
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "table2" (\n\t"id" serial PRIMARY KEY NOT NULL,\n\t"status" "status" DEFAULT \'inactive\'\n);\n',
		'ALTER TABLE "table1" ADD COLUMN "status" "status" DEFAULT \'inactive\';',
	]);
});

test('db has checks. Push with same names', async () => {
	const client = new PGlite();

	const schema1 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => ({
			checkConstraint: check('some_check', sql`${table.values} < 100`),
		})),
	};
	const schema2 = {
		test: pgTable('test', {
			id: serial('id').primaryKey(),
			values: integer('values').default(1),
		}, (table) => ({
			checkConstraint: check('some_check', sql`some new value`),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('drop view', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			schema: 'public',
			type: 'drop_view',
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP VIEW "public"."view";']);
});

test('drop materialized view', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([
		{
			name: 'view',
			schema: 'public',
			type: 'drop_view',
			materialized: true,
		},
	]);
	expect(sqlStatements).toStrictEqual(['DROP MATERIALIZED VIEW "public"."view";']);
});

test('push view with same name', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('push materialized view with same name', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements).toStrictEqual([]);
	expect(sqlStatements).toStrictEqual([]);
});

test('add with options for materialized view', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		schema: 'public',
		type: 'alter_view_add_with_option',
		with: {
			autovacuumFreezeTableAge: 1,
			autovacuumEnabled: false,
		},
		materialized: true,
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."view" SET (autovacuum_enabled = false, autovacuum_freeze_table_age = 1);`,
	);
});

test('add with options to materialized', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		schema: 'public',
		type: 'alter_view_add_with_option',
		with: {
			autovacuumVacuumCostDelay: 100,
			vacuumTruncate: false,
		},
		materialized: true,
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER MATERIALIZED VIEW "public"."view" SET (vacuum_truncate = false, autovacuum_vacuum_cost_delay = 100);`,
	);
});

test('add with options to materialized with existing flag', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema1, schema2, [], false, ['public']);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);
});

test('drop mat view with data', async () => {
	const client = new PGlite();

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

	const seedStatements = [`INSERT INTO "public"."table" ("id") VALUES (1), (2), (3)`];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		schemasToRemove,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
		matViewsToRemove,
	} = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ after: seedStatements },
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		materialized: true,
		name: 'view',
		schema: 'public',
		type: 'drop_view',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP MATERIALIZED VIEW "public"."view";`);
	expect(infoToPrint!.length).toBe(1);
	expect(infoToPrint![0]).toBe(`· You're about to delete "${chalk.underline('view')}" materialized view with 3 items`);
	expect(columnsToRemove!.length).toBe(0);
	expect(schemasToRemove!.length).toBe(0);
	expect(shouldAskForApprove).toBe(true);
	expect(tablesToRemove!.length).toBe(0);
	expect(matViewsToRemove!.length).toBe(1);
});

test('drop mat view without data', async () => {
	const client = new PGlite();

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
		columnsToRemove,
		infoToPrint,
		schemasToRemove,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
		matViewsToRemove,
	} = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		materialized: true,
		name: 'view',
		schema: 'public',
		type: 'drop_view',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP MATERIALIZED VIEW "public"."view";`);
	expect(infoToPrint!.length).toBe(0);
	expect(columnsToRemove!.length).toBe(0);
	expect(schemasToRemove!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(matViewsToRemove!.length).toBe(0);
});

test('drop view with data', async () => {
	const client = new PGlite();

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

	const seedStatements = [`INSERT INTO "public"."table" ("id") VALUES (1), (2), (3)`];

	const {
		statements,
		sqlStatements,
		columnsToRemove,
		infoToPrint,
		schemasToRemove,
		shouldAskForApprove,
		tablesToRemove,
		tablesToTruncate,
		matViewsToRemove,
	} = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ after: seedStatements },
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'view',
		schema: 'public',
		type: 'drop_view',
	});
	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(`DROP VIEW "public"."view";`);
	expect(infoToPrint!.length).toBe(0);
	expect(columnsToRemove!.length).toBe(0);
	expect(schemasToRemove!.length).toBe(0);
	expect(shouldAskForApprove).toBe(false);
	expect(tablesToRemove!.length).toBe(0);
	expect(matViewsToRemove!.length).toBe(0);
});

test('enums ordering', async () => {
	const enum1 = pgEnum('enum_users_customer_and_ship_to_settings_roles', [
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'custMgf',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema1 = {};

	const schema2 = {
		enum1,
	};

	const { sqlStatements: createEnum } = await diffTestSchemas(schema1, schema2, []);

	const enum2 = pgEnum('enum_users_customer_and_ship_to_settings_roles', [
		'addedToTop',
		'custAll',
		'custAdmin',
		'custClerk',
		'custInvoiceManager',
		'custMgf',
		'custApprover',
		'custOrderWriter',
		'custBuyer',
	]);
	const schema3 = {
		enum2,
	};

	const { sqlStatements: addedValueSql } = await diffTestSchemas(schema2, schema3, []);

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
	const schema4 = {
		enum3,
	};

	const client = new PGlite();

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema3,
		schema4,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ before: [...createEnum, ...addedValueSql], runApply: false },
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		before: 'custMgf',
		name: 'enum_users_customer_and_ship_to_settings_roles',
		schema: 'public',
		type: 'alter_type_add_value',
		value: 'addedToMiddle',
	});

	expect(sqlStatements.length).toBe(1);
	expect(sqlStatements[0]).toBe(
		`ALTER TYPE "public"."enum_users_customer_and_ship_to_settings_roles" ADD VALUE 'addedToMiddle' BEFORE 'custMgf';`,
	);
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

	const client = new PGlite();

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public', 'mySchema'],
		undefined,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		name: 'enum_users_customer_and_ship_to_settings_roles',
		enumSchema: 'public',
		type: 'alter_type_drop_value',
		newValues: [
			'addedToTop',
			'custAll',
			'custAdmin',
			'custClerk',
			'custInvoiceManager',
			'custApprover',
			'custOrderWriter',
			'custBuyer',
		],
		deletedValues: ['addedToMiddle', 'custMgf'],
		columnsWithEnum: [{
			column: 'id',
			tableSchema: '',
			table: 'enum_table',
			columnType: 'enum_users_customer_and_ship_to_settings_roles',
			default: undefined,
		}, {
			column: 'id',
			tableSchema: 'mySchema',
			table: 'enum_table',
			columnType: 'enum_users_customer_and_ship_to_settings_roles',
			default: undefined,
		}],
	});

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
	);
	expect(sqlStatements[1]).toBe(
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE text;`,
	);
	expect(sqlStatements[2]).toBe(
		`DROP TYPE "public"."enum_users_customer_and_ship_to_settings_roles";`,
	);
	expect(sqlStatements[3]).toBe(
		`CREATE TYPE "public"."enum_users_customer_and_ship_to_settings_roles" AS ENUM('addedToTop', 'custAll', 'custAdmin', 'custClerk', 'custInvoiceManager', 'custApprover', 'custOrderWriter', 'custBuyer');`,
	);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "enum_table" ALTER COLUMN "id" SET DATA TYPE "public"."enum_users_customer_and_ship_to_settings_roles" USING "id"::"public"."enum_users_customer_and_ship_to_settings_roles";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "mySchema"."enum_table" ALTER COLUMN "id" SET DATA TYPE "public"."enum_users_customer_and_ship_to_settings_roles" USING "id"::"public"."enum_users_customer_and_ship_to_settings_roles";`,
	);
});

test('column is enum type with default value. shuffle enum', async () => {
	const client = new PGlite();

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

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		from,
		to,
		[],
		false,
		['public'],
		undefined,
	);

	expect(sqlStatements.length).toBe(6);
	expect(sqlStatements[0]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE text;`);
	expect(sqlStatements[1]).toBe(`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::text;`);
	expect(sqlStatements[2]).toBe(`DROP TYPE "public"."enum";`);
	expect(sqlStatements[3]).toBe(`CREATE TYPE "public"."enum" AS ENUM('value1', 'value3', 'value2');`);
	expect(sqlStatements[4]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DEFAULT 'value2'::"public"."enum";`,
	);
	expect(sqlStatements[5]).toBe(
		`ALTER TABLE "table" ALTER COLUMN "column" SET DATA TYPE "public"."enum" USING "column"::"public"."enum";`,
	);

	expect(statements.length).toBe(1);
	expect(statements[0]).toStrictEqual({
		columnsWithEnum: [
			{
				column: 'column',
				tableSchema: '',
				table: 'table',
				default: "'value2'",
				columnType: 'enum',
			},
		],
		deletedValues: [
			'value3',
		],
		name: 'enum',
		newValues: [
			'value1',
			'value3',
			'value2',
		],
		enumSchema: 'public',
		type: 'alter_type_drop_value',
	});
});

// Policies and Roles push test
test('full policy: no changes', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements.length).toBe(0);
	expect(sqlStatements.length).toBe(0);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('add policy', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{ type: 'enable_rls', tableName: 'users', schema: '' },
		{
			type: 'create_policy',
			tableName: 'users',
			data: {
				name: 'test',
				as: 'PERMISSIVE',
				for: 'ALL',
				to: ['public'],
				on: undefined,
			},
			schema: '',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop policy', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{ type: 'disable_rls', tableName: 'users', schema: '' },
		{
			schema: '',
			tableName: 'users',
			type: 'disable_rls',
		},
		{
			type: 'drop_policy',
			tableName: 'users',
			data: {
				name: 'test',
				as: 'PERMISSIVE',
				for: 'ALL',
				to: ['public'],
				on: undefined,
			},
			schema: '',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" DISABLE ROW LEVEL SECURITY;',
		'DROP POLICY "test" ON "users" CASCADE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('add policy without enable rls', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
			newrls: pgPolicy('newRls'),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'create_policy',
			tableName: 'users',
			data: {
				name: 'newRls',
				as: 'PERMISSIVE',
				for: 'ALL',
				to: ['public'],
				on: undefined,
			},
			schema: '',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'CREATE POLICY "newRls" ON "users" AS PERMISSIVE FOR ALL TO public;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop policy without disable rls', async () => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
			oldRls: pgPolicy('oldRls'),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(statements).toStrictEqual([
		{
			type: 'drop_policy',
			tableName: 'users',
			data: {
				name: 'oldRls',
				as: 'PERMISSIVE',
				for: 'ALL',
				to: ['public'],
				on: undefined,
			},
			schema: '',
		},
	]);
	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "oldRls" ON "users" CASCADE;',
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

////

test('alter policy without recreation: changing roles', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
	expect(statements).toStrictEqual([
		{
			newData: 'test--PERMISSIVE--ALL--current_role--undefined',
			oldData: 'test--PERMISSIVE--ALL--public--undefined',
			schema: '',
			tableName: 'users',
			type: 'alter_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy without recreation: changing using', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', using: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy without recreation: changing with check', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy with recreation: changing as', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy with recreation: changing for', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', for: 'delete' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'DELETE',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy with recreation: changing both "as" and "for"', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive', for: 'insert' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR INSERT TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'INSERT',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter policy with recreation: changing all fields', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive', for: 'select', using: sql`true` }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'restrictive', to: 'current_role', withCheck: sql`true` }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS RESTRICTIVE FOR ALL TO current_role;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'SELECT',
				name: 'test',
				to: ['public'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'RESTRICTIVE',
				for: 'ALL',
				name: 'test',
				to: ['current_role'],
				on: undefined,
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('rename policy', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('newName', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.users.test->public.users.newName'],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			newName: 'newName',
			oldName: 'test',
			schema: '',
			tableName: 'users',
			type: 'rename_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('rename policy in renamed table', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('newName', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[
			'public.users->public.users2',
			'public.users2.test->public.users2.newName',
		],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" RENAME TO "users2";',
		'ALTER POLICY "test" ON "users2" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			fromSchema: '',
			tableNameFrom: 'users',
			tableNameTo: 'users2',
			toSchema: '',
			type: 'rename_table',
		},
		{
			newName: 'newName',
			oldName: 'test',
			schema: '',
			tableName: 'users2',
			type: 'rename_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create table with a policy', async (t) => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'CREATE TABLE "users2" (\n\t"id" integer PRIMARY KEY NOT NULL\n);\n',
		'ALTER TABLE "users2" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users2" AS PERMISSIVE FOR ALL TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			columns: [
				{
					name: 'id',
					notNull: true,
					primaryKey: true,
					type: 'integer',
				},
			],
			checkConstraints: [],
			compositePKs: [],
			isRLSEnabled: false,
			compositePkName: '',
			policies: [
				'test--PERMISSIVE--ALL--public--undefined',
			],
			schema: '',
			tableName: 'users2',
			type: 'create_table',
			uniqueConstraints: [],
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				to: [
					'public',
				],
				on: undefined,
			},
			schema: '',
			tableName: 'users2',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop table with a policy', async (t) => {
	const client = new PGlite();

	const schema1 = {
		users: pgTable('users2', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const schema2 = {};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users2" CASCADE;',
		'DROP TABLE "users2" CASCADE;',
	]);
	expect(statements).toStrictEqual([
		{
			policies: [
				'test--PERMISSIVE--ALL--public--undefined',
			],
			schema: '',
			tableName: 'users2',
			type: 'drop_table',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('add policy with multiple "to" roles', async (t) => {
	const client = new PGlite();

	client.query(`CREATE ROLE manager;`);

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
		}, () => ({
			rls: pgPolicy('test', { to: ['current_role', role] }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR ALL TO current_role, "manager";',
	]);
	expect(statements).toStrictEqual([
		{
			schema: '',
			tableName: 'users',
			type: 'enable_rls',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'ALL',
				name: 'test',
				on: undefined,
				to: ['current_role', 'manager'],
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('rename policy that is linked', async (t) => {
	const client = new PGlite();

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diffTestSchemas({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('newName', { as: 'permissive' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['public.users.test->public.users.newName'],
		false,
		['public'],
		undefined,
		undefined,
		{ before: createUsers },
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" RENAME TO "newName";',
	]);
	expect(statements).toStrictEqual([
		{
			newName: 'newName',
			oldName: 'test',
			schema: '',
			tableName: 'users',
			type: 'rename_policy',
		},
	]);
});

test('alter policy that is linked', async (t) => {
	const client = new PGlite();
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diffTestSchemas({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', to: 'current_role' }).link(users),
	};
	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ before: createUsers },
	);

	expect(sqlStatements).toStrictEqual([
		'ALTER POLICY "test" ON "users" TO current_role;',
	]);
	expect(statements).toStrictEqual([{
		newData: 'test--PERMISSIVE--ALL--current_role--undefined',
		oldData: 'test--PERMISSIVE--ALL--public--undefined',
		schema: '',
		tableName: 'users',
		type: 'alter_policy',
	}]);
});

test('alter policy that is linked: withCheck', async (t) => {
	const client = new PGlite();

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diffTestSchemas({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', withCheck: sql`false` }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ before: createUsers },
	);

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
});

test('alter policy that is linked: using', async (t) => {
	const client = new PGlite();
	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diffTestSchemas({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { as: 'permissive', using: sql`true` }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { as: 'permissive', using: sql`false` }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ before: createUsers },
	);

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
});

test('alter policy that is linked: using', async (t) => {
	const client = new PGlite();

	const users = pgTable('users', {
		id: integer('id').primaryKey(),
	});

	const { sqlStatements: createUsers } = await diffTestSchemas({}, { users }, []);

	const schema1 = {
		rls: pgPolicy('test', { for: 'insert' }).link(users),
	};

	const schema2 = {
		users,
		rls: pgPolicy('test', { for: 'delete' }).link(users),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		undefined,
		{ before: createUsers },
	);

	expect(sqlStatements).toStrictEqual([
		'DROP POLICY "test" ON "users" CASCADE;',
		'CREATE POLICY "test" ON "users" AS PERMISSIVE FOR DELETE TO public;',
	]);
	expect(statements).toStrictEqual([
		{
			data: {
				as: 'PERMISSIVE',
				for: 'INSERT',
				name: 'test',
				on: undefined,
				to: [
					'public',
				],
			},
			schema: '',
			tableName: 'users',
			type: 'drop_policy',
		},
		{
			data: {
				as: 'PERMISSIVE',
				for: 'DELETE',
				name: 'test',
				on: undefined,
				to: [
					'public',
				],
			},
			schema: '',
			tableName: 'users',
			type: 'create_policy',
		},
	]);
});

////

test('create role', async (t) => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager'),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: true,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create role with properties', async (t) => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false, createRole: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: true,
				createRole: true,
				inherit: false,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create role with some properties', async (t) => {
	const client = new PGlite();

	const schema1 = {};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['CREATE ROLE "manager" WITH CREATEDB NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'create_role',
			values: {
				createDb: true,
				createRole: false,
				inherit: false,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('drop role', async (t) => {
	const client = new PGlite();

	const schema1 = { manager: pgRole('manager') };

	const schema2 = {};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'drop_role',
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('create and drop role', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager', 'admin'] } },
	);

	expect(sqlStatements).toStrictEqual(['DROP ROLE "manager";', 'CREATE ROLE "admin";']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'drop_role',
		},
		{
			name: 'admin',
			type: 'create_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: true,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('rename role', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		admin: pgRole('admin'),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		['manager->admin'],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager', 'admin'] } },
	);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" RENAME TO "admin";']);
	expect(statements).toStrictEqual([
		{ nameFrom: 'manager', nameTo: 'admin', type: 'rename_role' },
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter all role field', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true, createRole: true, inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB CREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: true,
				createRole: true,
				inherit: false,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter createdb in role', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createDb: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH CREATEDB NOCREATEROLE INHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: true,
				createRole: false,
				inherit: true,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter createrole in role', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { createRole: true }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB CREATEROLE INHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: false,
				createRole: true,
				inherit: true,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});

test('alter inherit in role', async (t) => {
	const client = new PGlite();

	const schema1 = {
		manager: pgRole('manager'),
	};

	const schema2 = {
		manager: pgRole('manager', { inherit: false }),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(
		client,
		schema1,
		schema2,
		[],
		false,
		['public'],
		undefined,
		{ roles: { include: ['manager'] } },
	);

	expect(sqlStatements).toStrictEqual(['ALTER ROLE "manager" WITH NOCREATEDB NOCREATEROLE NOINHERIT;']);
	expect(statements).toStrictEqual([
		{
			name: 'manager',
			type: 'alter_role',
			values: {
				createDb: false,
				createRole: false,
				inherit: false,
			},
		},
	]);

	for (const st of sqlStatements) {
		await client.query(st);
	}
});
