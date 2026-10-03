import { describe, expect, it } from 'vitest';
import { eq, sql } from '~/index.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import { int as mysqlInteger, mysqlTable, text as mysqlText } from '~/mysql-core/index.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { integer as pgInteger, pgTable, text as pgText } from '~/pg-core/index.ts';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';
import { drizzle as drizzleSqliteProxy } from '~/sqlite-proxy/index.ts';

describe('sql.placeholder in update set (#2110)', () => {
	it('SQLite: should allow sql.placeholder in .set() without type casting and fill params correctly', async () => {
		const users = sqliteTable('users', {
			id: sqliteInteger('id').primaryKey(),
			name: sqliteText('name').notNull(),
			updatedAt: sqliteInteger('updated_at'),
		});

		let capturedParams: any[] = [];
		const db = drizzleSqliteProxy(async (sqlStr, params, method) => {
			capturedParams = params;
			return { rows: [] };
		});

		const query = db.update(users).set({
			updatedAt: sql.placeholder('updatedAt'),
		}).where(eq(users.id, 1));

		const toSqlResult = query.toSQL();
		expect(toSqlResult.sql).toBe('update "users" set "updated_at" = ? where "users"."id" = ?');

		const prepared = query.prepare();
		await prepared.run({ updatedAt: 12345 });

		expect(capturedParams).toEqual([12345, 1]);
	});

	it('PostgreSQL: should compile update query with sql.placeholder in .set() without type casting', () => {
		const users = pgTable('users', {
			id: pgInteger('id').primaryKey(),
			name: pgText('name').notNull(),
			updatedAt: pgInteger('updated_at'),
		});

		const dialect = new PgDialect();
		const query = dialect.buildUpdateQuery({
			table: users,
			set: {
				updatedAt: sql.placeholder('updatedAt'),
			},
			where: eq(users.id, 1),
			joins: [],
		});

		const sqlString = dialect.sqlToQuery(query);
		expect(sqlString.sql).toBe('update "users" set "updated_at" = $1 where "users"."id" = $2');
	});

	it('MySQL: should compile update query with sql.placeholder in .set() without type casting', () => {
		const users = mysqlTable('users', {
			id: mysqlInteger('id').primaryKey(),
			name: mysqlText('name').notNull(),
			updatedAt: mysqlInteger('updated_at'),
		});

		const dialect = new MySqlDialect();
		const query = dialect.buildUpdateQuery({
			table: users,
			set: {
				updatedAt: sql.placeholder('updatedAt'),
			},
			where: eq(users.id, 1),
		});

		const sqlString = dialect.sqlToQuery(query);
		expect(sqlString.sql).toBe('update `users` set `updated_at` = ? where `users`.`id` = ?');
	});
});
