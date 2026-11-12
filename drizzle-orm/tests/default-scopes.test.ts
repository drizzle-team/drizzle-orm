import { connect } from '@tidbcloud/serverless';
import postgres from 'postgres';
import { describe, expect, it } from 'vitest';
import { int, mysqlTable, serial as mysqlSerial, text as mysqlText } from '~/mysql-core';
import { boolean, integer, pgTable, serial, text, timestamp } from '~/pg-core';
import { drizzle } from '~/postgres-js';
import { defaultScope, withDefaultScope } from '~/scope';
import { and, eq, isNull, sql } from '~/sql';
import { integer as sqliteInteger, sqliteTable, text as sqliteText } from '~/sqlite-core';
import { drizzle as sqliteDrizzle } from '~/sqlite-proxy';
import { drizzle as mysqlDrizzle } from '~/tidb-serverless';

describe('Table default scopes (#5657)', () => {
	it('applies default scope in extraConfig to select queries', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.select().from(users);
		expect(query.toSQL().sql).toBe('select "id", "name", "deleted_at" from "users" where "users"."deleted_at" is null');
	});

	it('combines default scope with user where clause via and', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.select().from(users).where(eq(users.id, 1));
		expect(query.toSQL().sql).toBe(
			'select "id", "name", "deleted_at" from "users" where "users"."deleted_at" is null and ("users"."id" = $1)',
		);
		expect(query.toSQL().params).toEqual([1]);
	});

	it('bypasses default scope when .unscoped() is called on select', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.select().from(users).unscoped();
		expect(query.toSQL().sql).toBe('select "id", "name", "deleted_at" from "users"');
	});

	it('supports chaining .withDefaultScope on table definition', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}).withDefaultScope((t) => isNull(t.deletedAt));

		const db = drizzle(postgres(''));
		const query = db.select().from(users);
		expect(query.toSQL().sql).toBe('select "id", "name", "deleted_at" from "users" where "users"."deleted_at" is null');
	});

	it('applies default scope to update queries', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.update(users).set({ name: 'Bob' }).where(eq(users.id, 2));
		expect(query.toSQL().sql).toBe(
			'update "users" set "name" = $1 where "users"."deleted_at" is null and ("users"."id" = $2)',
		);
		expect(query.toSQL().params).toEqual(['Bob', 2]);

		const unscopedQuery = db.update(users).set({ name: 'Bob' }).where(eq(users.id, 2)).unscoped();
		expect(unscopedQuery.toSQL().sql).toBe('update "users" set "name" = $1 where "users"."id" = $2');
	});

	it('applies default scope to delete queries', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.delete(users).where(eq(users.id, 3));
		expect(query.toSQL().sql).toBe('delete from "users" where "users"."deleted_at" is null and ("users"."id" = $1)');
		expect(query.toSQL().params).toEqual([3]);

		const unscopedQuery = db.delete(users).where(eq(users.id, 3)).unscoped();
		expect(unscopedQuery.toSQL().sql).toBe('delete from "users" where "users"."id" = $1');
	});

	it('applies joined table default scopes to join on conditions', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			name: text('name').notNull(),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const posts = pgTable('posts', {
			id: serial('id').primaryKey(),
			userId: integer('user_id'),
			deletedAt: timestamp('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = drizzle(postgres(''));
		const query = db.select().from(users).leftJoin(posts, eq(users.id, posts.userId));
		expect(query.toSQL().sql).toBe(
			'select "users"."id", "users"."name", "users"."deleted_at", "posts"."id", "posts"."user_id", "posts"."deleted_at" from "users" left join "posts" on "users"."id" = "posts"."user_id" and "posts"."deleted_at" is null where "users"."deleted_at" is null',
		);
	});

	it('supports context-aware scopes with withContext()', () => {
		const users = pgTable('users', {
			id: serial('id').primaryKey(),
			orgId: integer('org_id'),
		}, (table) => [
			defaultScope((t, ctx) => ctx?.orgId ? eq(t.orgId, ctx.orgId) : undefined),
		]);

		const db = drizzle(postgres(''));
		const queryWithContext = db.select().from(users).withContext({ orgId: 42 });
		expect(queryWithContext.toSQL().sql).toBe('select "id", "org_id" from "users" where "users"."org_id" = $1');
		expect(queryWithContext.toSQL().params).toEqual([42]);

		const queryWithoutContext = db.select().from(users);
		expect(queryWithoutContext.toSQL().sql).toBe('select "id", "org_id" from "users"');
	});
});

describe('MySQL Table default scopes (#5657)', () => {
	it('applies default scope to mysql select, update, and delete', () => {
		const users = mysqlTable('users', {
			id: mysqlSerial('id').primaryKey(),
			name: mysqlText('name').notNull(),
			deletedAt: int('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = mysqlDrizzle(connect({ url: '' }));

		const selectQuery = db.select().from(users);
		expect(selectQuery.toSQL().sql).toBe(
			'select `id`, `name`, `deleted_at` from `users` where `users`.`deleted_at` is null',
		);

		const unscopedSelect = db.select().from(users).unscoped();
		expect(unscopedSelect.toSQL().sql).toBe('select `id`, `name`, `deleted_at` from `users`');

		const updateQuery = db.update(users).set({ name: 'Bob' }).where(eq(users.id, 2));
		expect(updateQuery.toSQL().sql).toBe(
			'update `users` set `name` = ? where `users`.`deleted_at` is null and (`users`.`id` = ?)',
		);

		const deleteQuery = db.delete(users).where(eq(users.id, 3));
		expect(deleteQuery.toSQL().sql).toBe(
			'delete from `users` where `users`.`deleted_at` is null and (`users`.`id` = ?)',
		);
	});

	it('supports chaining .withDefaultScope on mysql table', () => {
		const users = mysqlTable('users', {
			id: mysqlSerial('id').primaryKey(),
			name: mysqlText('name').notNull(),
			deletedAt: int('deleted_at'),
		}).withDefaultScope((t) => isNull(t.deletedAt));

		const db = mysqlDrizzle(connect({ url: '' }));
		const selectQuery = db.select().from(users);
		expect(selectQuery.toSQL().sql).toBe(
			'select `id`, `name`, `deleted_at` from `users` where `users`.`deleted_at` is null',
		);
	});
});

describe('SQLite Table default scopes (#5657)', () => {
	it('applies default scope to sqlite select, update, and delete', () => {
		const users = sqliteTable('users', {
			id: sqliteInteger('id').primaryKey(),
			name: sqliteText('name').notNull(),
			deletedAt: sqliteInteger('deleted_at'),
		}, (table) => [
			defaultScope((t) => isNull(t.deletedAt)),
		]);

		const db = sqliteDrizzle(async () => ({ rows: [] }));

		const selectQuery = db.select().from(users);
		expect(selectQuery.toSQL().sql).toBe(
			'select "id", "name", "deleted_at" from "users" where "users"."deleted_at" is null',
		);

		const unscopedSelect = db.select().from(users).unscoped();
		expect(unscopedSelect.toSQL().sql).toBe('select "id", "name", "deleted_at" from "users"');

		const updateQuery = db.update(users).set({ name: 'Bob' }).where(eq(users.id, 2));
		expect(updateQuery.toSQL().sql).toBe(
			'update "users" set "name" = ? where "users"."deleted_at" is null and ("users"."id" = ?)',
		);

		const deleteQuery = db.delete(users).where(eq(users.id, 3));
		expect(deleteQuery.toSQL().sql).toBe(
			'delete from "users" where "users"."deleted_at" is null and ("users"."id" = ?)',
		);
	});

	it('supports chaining .withDefaultScope on sqlite table', () => {
		const users = sqliteTable('users', {
			id: sqliteInteger('id').primaryKey(),
			name: sqliteText('name').notNull(),
			deletedAt: sqliteInteger('deleted_at'),
		}).withDefaultScope((t) => isNull(t.deletedAt));

		const db = sqliteDrizzle(async () => ({ rows: [] }));
		const selectQuery = db.select().from(users);
		expect(selectQuery.toSQL().sql).toBe(
			'select "id", "name", "deleted_at" from "users" where "users"."deleted_at" is null',
		);
	});
});
