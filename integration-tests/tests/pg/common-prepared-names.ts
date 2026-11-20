import { eq, sql } from 'drizzle-orm';
import { pgMaterializedView, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { describe, expect } from 'vitest';
import type { Test } from './instrumentation';

/**
 * A name given to `.prepare('name')` is the name of the statement on the server. Runs for the drivers whose client
 * takes a statement name: the HTTP drivers have no session to keep a statement in, and Bun SQL, PGlite, pg-proxy,
 * postgres.js and the Effect SQL clients have no way to pass one.
 *
 * Inside a transaction, so every statement and the `pg_prepared_statements` read run on one connection.
 */
export function preparedNameTests(test: Test) {
	describe('explicit statement names', () => {
		test('a name given to prepare() is the name of the statement on the server', async ({ push, createDB }) => {
			const users = pgTable('prepared_names_users', {
				id: serial().primaryKey(),
				name: text().notNull(),
			});
			const usersView = pgMaterializedView('prepared_names_view').as((qb) => qb.select().from(users));
			await push({ users });
			const db = createDB({ users });
			await db.execute(sql`drop materialized view if exists ${usersView}`);
			await db.execute(sql`create materialized view ${usersView} as select * from ${users}`);
			const prefix = `pn_${Math.random().toString(36).slice(2, 8)}`;

			const { results, names } = await db.transaction(async (tx) => {
				const id = sql.placeholder('id');
				const results = [
					await tx.insert(users).values({ name: sql.placeholder('name') }).returning()
						.prepare(`${prefix}_insert`).execute({ name: 'John' }),
					await tx.select().from(users).where(eq(users.id, id))
						.prepare(`${prefix}_select`).execute({ id: 1 }),
					await tx.update(users).set({ name: 'Jane' }).where(eq(users.id, id)).returning()
						.prepare(`${prefix}_update`).execute({ id: 1 }),
					await tx.query.users.findFirst({ where: { id: { eq: id } } })
						.prepare(`${prefix}_find_first`).execute({ id: 1 }),
					await tx.delete(users).where(eq(users.id, id)).returning()
						.prepare(`${prefix}_delete`).execute({ id: 1 }),
				];
				await tx.refreshMaterializedView(usersView).prepare(`${prefix}_refresh`).execute();

				const names = await tx.select({ name: sql<string>`name` }).from(sql`pg_prepared_statements`)
					.where(sql`name like ${prefix + '\\_%'}`).orderBy(sql`name`);
				return { results, names: names.map((row) => row.name) };
			});

			expect(results).toEqual([
				[{ id: 1, name: 'John' }],
				[{ id: 1, name: 'John' }],
				[{ id: 1, name: 'Jane' }],
				{ id: 1, name: 'Jane' },
				[{ id: 1, name: 'Jane' }],
			]);
			expect(names).toEqual(
				['delete', 'find_first', 'insert', 'refresh', 'select', 'update'].map((kind) => `${prefix}_${kind}`),
			);
		});

		test('a prepared statement runs again under its name', async ({ push, createDB }) => {
			const users = pgTable('prepared_names_reuse', {
				id: serial().primaryKey(),
				name: text().notNull(),
			});
			await push({ users });
			const db = createDB({ users });
			const name = `pn_reuse_${Math.random().toString(36).slice(2, 8)}`;

			const { results, statements } = await db.transaction(async (tx) => {
				await tx.insert(users).values([{ name: 'John' }, { name: 'Jane' }]);
				const byId = tx.select().from(users).where(eq(users.id, sql.placeholder('id'))).prepare(name);
				const results = [await byId.execute({ id: 1 }), await byId.execute({ id: 2 }), await byId.execute({ id: 1 })];
				const statements = await tx.select({ name: sql<string>`name` }).from(sql`pg_prepared_statements`)
					.where(sql`statement = ${byId.getQuery().sql}`);
				return { results, statements: statements.map((row) => row.name) };
			});

			expect(results).toEqual([[{ id: 1, name: 'John' }], [{ id: 2, name: 'Jane' }], [{ id: 1, name: 'John' }]]);
			// one statement on the server, under the given name
			expect(statements).toEqual([name]);
		});
	});
}
