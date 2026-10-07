import { describe, expect, test } from 'vitest';
import { drizzle as sqlite } from '~/better-sqlite3';
import { drizzle as cockroach } from '~/cockroach';
import { cockroachTable, int4 } from '~/cockroach-core';
import { DrizzleError } from '~/errors';
import { int as mssqlInt, mssqlTable } from '~/mssql-core';
import { int as mysqlInt, mysqlTable } from '~/mysql-core';
import { drizzle as mysql } from '~/mysql2';
import { drizzle as mssql } from '~/node-mssql';
import { integer as pgInteger, pgTable } from '~/pg-core';
import { drizzle as postgres } from '~/pglite';
import { type DBQueryConfig, defineRelations } from '~/relations';
import { drizzle as singlestore } from '~/singlestore';
import { int as singlestoreInt, singlestoreTable } from '~/singlestore-core';
import { sql } from '~/sql';
import { integer as sqliteInteger, sqliteTable } from '~/sqlite-core';

const fixtures = [
	{
		name: 'PostgreSQL',
		drizzle: postgres,
		schema: {
			users: pgTable('users', { id: pgInteger().primaryKey(), value: pgInteger('stored_value') }),
			posts: pgTable('posts', { id: pgInteger().primaryKey(), authorId: pgInteger() }),
		},
	},
	{
		name: 'MySQL',
		drizzle: mysql,
		schema: {
			users: mysqlTable('users', { id: mysqlInt().primaryKey(), value: mysqlInt('stored_value') }),
			posts: mysqlTable('posts', { id: mysqlInt().primaryKey(), authorId: mysqlInt() }),
		},
	},
	{
		name: 'SQLite',
		drizzle: sqlite,
		schema: {
			users: sqliteTable('users', { id: sqliteInteger().primaryKey(), value: sqliteInteger('stored_value') }),
			posts: sqliteTable('posts', { id: sqliteInteger().primaryKey(), authorId: sqliteInteger() }),
		},
	},
	{
		name: 'SingleStore',
		drizzle: singlestore,
		schema: {
			users: singlestoreTable('users', { id: singlestoreInt().primaryKey(), value: singlestoreInt('stored_value') }),
			posts: singlestoreTable('posts', { id: singlestoreInt().primaryKey(), authorId: singlestoreInt() }),
		},
	},
	{
		name: 'CockroachDB',
		drizzle: cockroach,
		schema: {
			users: cockroachTable('users', { id: int4().primaryKey(), value: int4('stored_value') }),
			posts: cockroachTable('posts', { id: int4().primaryKey(), authorId: int4() }),
		},
	},
	{
		name: 'MSSQL',
		drizzle: mssql,
		schema: {
			users: mssqlTable('users', { id: mssqlInt().primaryKey(), value: mssqlInt('stored_value') }),
			posts: mssqlTable('posts', { id: mssqlInt().primaryKey(), authorId: mssqlInt() }),
		},
	},
];

function expectCollision(build: () => unknown, key: string) {
	expect(build).toThrowError(DrizzleError);
	expect(build).toThrowError(new RegExp(key));
	expect(build).toThrowError(/rename|exclud/i);
}

// oxlint-disable-next-line unicorn/no-useless-undefined
const returnUndefined = () => undefined;

describe.each(fixtures)('$name relational extras collisions', ({ drizzle, schema }) => {
	const relations = defineRelations(schema, (r) => ({
		users: {
			posts: r.many.posts({ from: r.users.id, to: r.posts.authorId }),
		},
		posts: {
			author: r.one.users({ from: r.posts.authorId, to: r.users.id }),
		},
	}));
	const db = drizzle.mock({ relations });
	type QueryConfig = DBQueryConfig<'one', typeof relations, typeof relations.users>;
	// Keep the shared test API independent of each driver's query result type.
	const users: {
		findMany(config: QueryConfig): { toSQL(): unknown };
		findFirst(config: QueryConfig): { toSQL(): unknown };
	} = db.query.users;

	test.each(['findMany', 'findFirst'] as const)('%s rejects an extra shadowing a default selected column', (method) => {
		expectCollision(() => users[method]({ extras: { value: sql`1` } }).toSQL(), 'value');
	});

	test('rejects an explicitly included column and a column retained by exclusion mode', () => {
		expectCollision(() =>
			users.findMany({
				columns: { value: true },
				extras: { value: sql`1` },
			}).toSQL(), 'value');
		expectCollision(() =>
			users.findMany({
				columns: { id: false },
				extras: { value: sql`1` },
			}).toSQL(), 'value');
	});

	test.each([true, {}] as const)('rejects an extra shadowing a selected relation (%j)', (posts) => {
		expectCollision(() =>
			users.findMany({
				with: { posts },
				extras: { posts: sql`1` },
			}).toSQL(), 'posts');
	});

	test('rejects collisions inside nested relations', () => {
		expectCollision(() =>
			users.findMany({
				with: { posts: { extras: { id: sql`1` } } },
			}).toSQL(), 'id');
		expectCollision(() =>
			users.findFirst({
				with: { posts: { with: { author: true }, extras: { author: sql`1` } } },
			}).toSQL(), 'author');
	});

	test('compares aliased extras by their result key', () => {
		expectCollision(() =>
			users.findMany({
				extras: { value: sql`1`.as('different_sql_alias') },
			}).toSQL(), 'value');
		expect(() =>
			users.findMany({
				extras: { computedValue: sql`1`.as('value') },
			}).toSQL()
		).not.toThrow();
	});

	test.each([{ value: false }, { id: true }, {}])('allows an extra replacing an unselected column (%j)', (columns) => {
		expect(() => users.findMany({ columns, extras: { value: sql`1` } }).toSQL()).not.toThrow();
	});

	test('allows an extra replacing an excluded column inside a nested relation', () => {
		expect(() =>
			users.findMany({
				with: { posts: { columns: { id: false }, extras: { id: sql`1` } } },
			}).toSQL()
		).not.toThrow();
	});

	test.each([false, undefined])('allows an extra named after an unselected relation (%j)', (posts) => {
		expect(() =>
			users.findMany({
				with: { posts },
				extras: { posts: sql`1` },
			}).toSQL()
		).not.toThrow();
	});

	test('allows an extra named after an omitted relation or a database column name', () => {
		expect(() =>
			users.findMany({
				extras: { posts: sql`1`, stored_value: sql`2` },
			}).toSQL()
		).not.toThrow();
	});

	test('ignores extras callbacks returning undefined, including colliding names', () => {
		expect(() =>
			users.findMany({
				with: { posts: true },
				extras: { value: returnUndefined, posts: returnUndefined, kept: () => sql`1` },
			}).toSQL()
		).not.toThrow();
	});

	test('rejects a colliding extra produced by a callback', () => {
		expectCollision(() =>
			users.findMany({
				extras: { value: () => sql`1` },
			}).toSQL(), 'value');
	});
});
