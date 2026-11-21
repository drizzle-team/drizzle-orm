import { describe, expect, test } from 'vitest';

import { mapColumnsInAliasedSQLToAlias, mapColumnsInSQLToAlias } from '~/alias.ts';
import { integer } from '~/pg-core/columns/integer.ts';
import { text } from '~/pg-core/columns/text.ts';
import { pgTable } from '~/pg-core/table.ts';
import { eq, sql, SQL } from '~/sql/sql.ts';
import { is } from '~/entity.ts';
import { Column } from '~/column.ts';
import { Table } from '~/table.ts';

// Minimal schema to reproduce the bug from #3493
const users = pgTable('users', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const posts = pgTable('posts', {
	id: integer('id').primaryKey(),
	userId: integer('user_id').notNull(),
	content: text('content').notNull(),
});

/**
 * Helper: walk all Columns in an SQL tree and return their table names.
 * This lets us verify which tables are referenced after aliasing.
 */
function collectTableNames(query: SQL): string[] {
	const names: string[] = [];
	for (const chunk of query.queryChunks) {
		if (is(chunk, Column)) {
			names.push(chunk.table[Table.Symbol.Name]);
		} else if (is(chunk, SQL)) {
			names.push(...collectTableNames(chunk));
		} else if (is(chunk, SQL.Aliased)) {
			names.push(...collectTableNames(chunk.sql));
		}
	}
	return names;
}

describe('mapColumnsInSQLToAlias with table parameter (#3493)', () => {
	const TABLE_ALIAS = 'users_tbl';

	test('aliases columns from the specified table', () => {
		// sql`${users.name}` → should alias users.name to TABLE_ALIAS
		const input = sql`${users.name}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		expect(tableNames).toEqual([TABLE_ALIAS]);
	});

	test('does NOT alias columns from a different table', () => {
		// sql`${posts.userId}` → should NOT be aliased when table=users
		const input = sql`${posts.userId}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		expect(tableNames).toEqual(['posts']); // untouched
	});

	test('mixed columns: only aliases columns from the specified table', () => {
		// Simulates: eq(posts.userId, users.id) used in $count extras
		const input = sql`${posts.userId} = ${users.id}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		// posts.userId stays as "posts", users.id becomes TABLE_ALIAS
		expect(tableNames).toEqual(['posts', TABLE_ALIAS]);
	});

	test('$count-like subquery: preserves foreign table in FROM and WHERE', () => {
		// Simulates: db.$count(posts, eq(posts.userId, users.id))
		// Generated SQL: (select count(*) from ${posts} where ${posts.userId} = ${users.id})
		const countSql = sql`(select count(*) from ${posts}${sql.raw(' where ')}${posts.userId} = ${users.id})`;
		const aliased = sql.raw('postCount');
		const input = new SQL.Aliased(countSql, 'postCount');

		const result = mapColumnsInAliasedSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result.sql);
		// posts.userId must stay "posts", users.id must become TABLE_ALIAS
		// The posts Table itself is not a Column, so it won't appear in collectTableNames
		expect(tableNames).toContain('posts');
		expect(tableNames).toContain(TABLE_ALIAS);
		expect(tableNames).not.toContain('users');
	});

	test('without table parameter, all columns are aliased (backward compat)', () => {
		// Original behavior: all columns get aliased regardless of table
		const input = sql`${posts.userId} = ${users.id}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS);

		const tableNames = collectTableNames(result);
		// Both should be aliased to TABLE_ALIAS
		expect(tableNames).toEqual([TABLE_ALIAS, TABLE_ALIAS]);
	});

	test('deeply nested SQL preserves table filtering', () => {
		// SQL with nested sub-expressions
		const inner = sql`${posts.content} IS NOT NULL`;
		const outer = sql`${users.name} = 'test' AND (${inner})`;
		const result = mapColumnsInSQLToAlias(outer, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		// users.name → TABLE_ALIAS, posts.content → stays "posts"
		expect(tableNames).toEqual([TABLE_ALIAS, 'posts']);
	});

	test('SQL.Aliased wrapper preserves table filtering', () => {
		const inner = sql`lower(${posts.content})`;
		const aliased = new SQL.Aliased(inner, 'lower_content');

		// Wrap in another SQL to simulate extras processing
		const wrapper = sql`${aliased}`;
		const result = mapColumnsInSQLToAlias(wrapper, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		// posts.content should stay "posts" since table=users
		expect(tableNames).toEqual(['posts']);
	});

	test('columns from same table but different instances are aliased by OriginalName', () => {
		// Create a second reference to the same logical table
		const users2 = pgTable('users', {
			id: integer('id').primaryKey(),
			email: text('email'),
		});

		const input = sql`${users2.id}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		// Same OriginalName "users" → should be aliased
		expect(tableNames).toEqual([TABLE_ALIAS]);
	});

	test('multiple foreign tables in one expression', () => {
		const comments = pgTable('comments', {
			id: integer('id').primaryKey(),
			postId: integer('post_id').notNull(),
			authorId: integer('author_id').notNull(),
		});

		// Simulate a complex extras expression referencing 3 tables
		const input = sql`${comments.postId} = ${posts.id} AND ${comments.authorId} = ${users.id}`;
		const result = mapColumnsInSQLToAlias(input, TABLE_ALIAS, users);

		const tableNames = collectTableNames(result);
		// Only users.id should be aliased; comments and posts stay unchanged
		expect(tableNames).toEqual(['comments', 'posts', 'comments', TABLE_ALIAS]);
	});
});
