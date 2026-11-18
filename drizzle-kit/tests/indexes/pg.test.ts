import { desc, sql } from 'drizzle-orm';
import { index, PgDialect, pgTable, serial, text, timestamp, vector } from 'drizzle-orm/pg-core';
import { JsonCreateIndexStatement } from 'src/jsonStatements';
import { PgSquasher } from 'src/serializer/pgSchema';
import { diffTestSchemas } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';
import { DialectSuite, run } from './common';

const pgSuite: DialectSuite = {
	async vectorIndex() {
		const schema1 = {
			users: pgTable('users', {
				id: serial('id').primaryKey(),
				name: vector('name', { dimensions: 3 }),
			}),
		};

		const schema2 = {
			users: pgTable(
				'users',
				{
					id: serial('id').primaryKey(),
					embedding: vector('name', { dimensions: 3 }),
				},
				(t) => ({
					indx2: index('vector_embedding_idx')
						.using('hnsw', t.embedding.op('vector_ip_ops'))
						.with({ m: 16, ef_construction: 64 }),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemas(
			schema1,
			schema2,
			[],
		);

		expect(statements.length).toBe(1);
		expect(statements[0]).toStrictEqual({
			schema: '',
			tableName: 'users',
			type: 'create_index_pg',
			data: {
				columns: [
					{
						asc: true,
						expression: 'name',
						isExpression: false,
						nulls: 'last',
						opclass: 'vector_ip_ops',
					},
				],
				concurrently: false,
				isUnique: false,
				method: 'hnsw',
				name: 'vector_embedding_idx',
				where: undefined,
				with: {
					ef_construction: 64,
					m: 16,
				},
			},
		});
		expect(sqlStatements.length).toBe(1);
		expect(sqlStatements[0]).toBe(
			`CREATE INDEX "vector_embedding_idx" ON "users" USING hnsw ("name" vector_ip_ops) WITH (m=16,ef_construction=64);`,
		);
	},

	async indexesToBeTriggered() {
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
						.on(sql`lower(${t.id})`)
						.where(sql`true`),
					indx4: index('indx4')
						.on(sql`lower(id)`)
						.where(sql`true`),
				}),
			),
		};

		const { statements, sqlStatements } = await diffTestSchemas(
			schema1,
			schema2,
			[],
		);

		expect(sqlStatements).toStrictEqual([
			'DROP INDEX "indx";',
			'DROP INDEX "indx1";',
			'DROP INDEX "indx2";',
			'DROP INDEX "indx3";',
			'CREATE INDEX "indx4" ON "users" USING btree (lower(id)) WHERE true;',
			'CREATE INDEX "indx" ON "users" USING btree ("name" DESC NULLS FIRST);',
			'CREATE INDEX "indx1" ON "users" USING btree ("name" DESC NULLS FIRST) WHERE false;',
			'CREATE INDEX "indx2" ON "users" USING btree ("name" test) WHERE true;',
			'CREATE INDEX "indx3" ON "users" USING btree (lower("id")) WHERE true;',
		]);
	},

	async simpleIndex() {
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

		const { statements, sqlStatements } = await diffTestSchemas(
			schema1,
			schema2,
			[],
		);

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
						nulls: 'first',
						opclass: '',
					},
					{
						asc: true,
						expression: 'id',
						isExpression: false,
						nulls: 'last',
						opclass: '',
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
			// data: 'users_name_id_index;name,false,first,undefined,,id,true,last,undefined;false;false;btree;select 1;{"fillfactor":70}',
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
						nulls: 'first',
						opclass: '',
					},
					{
						asc: true,
						expression: '"name"',
						isExpression: true,
						nulls: 'last',
						opclass: '',
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
			`CREATE INDEX "users_name_id_index" ON "users" USING btree ("name" DESC NULLS FIRST,"id") WITH (fillfactor=70) WHERE select 1;`,
		);
		expect(sqlStatements[1]).toBe(
			`CREATE INDEX "indx1" ON "users" USING hash ("name" DESC NULLS FIRST,"name") WITH (fillfactor=70);`,
		);
	},
};

run(pgSuite);

// Regression test for #5978: the index builder and the desc() order-by helper
// must agree on NULLS ordering, otherwise Postgres silently refuses to use the
// index for the ORDER BY ... LIMIT it was created for (pathkeys include the
// nulls flag, and NOT NULL is not consulted).
test('index #4: .desc() index and desc() order-by agree on NULLS ordering (#5978)', async () => {
	const schema1 = {
		items: pgTable('items', {
			id: serial('id').primaryKey(),
			createdAt: timestamp('created_at').notNull(),
		}),
	};
	const schema2 = {
		items: pgTable(
			'items',
			{
				id: serial('id').primaryKey(),
				createdAt: timestamp('created_at').notNull(),
			},
			(t) => ({
				byCreatedAt: index('items_by_created_at').on(t.createdAt.desc()),
			}),
		),
	};

	const { sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	// A bare `.desc()` index now follows the Postgres direction default
	// (DESC => NULLS FIRST) instead of the previously pinned DESC NULLS LAST.
	expect(sqlStatements).toStrictEqual([
		'CREATE INDEX "items_by_created_at" ON "items" USING btree ("created_at" DESC NULLS FIRST);',
	]);

	// The desc() order-by helper emits a bare `desc`, which Postgres reads with
	// its DESC default of NULLS FIRST -- the same nulls ordering the index above
	// uses, so the index can serve `ORDER BY created_at DESC LIMIT n`.
	const orderBy = new PgDialect().sqlToQuery(desc(schema2.items.createdAt)).sql.toLowerCase();
	expect(orderBy.endsWith(' desc')).toBe(true);
	expect(orderBy).not.toContain('nulls');
});
