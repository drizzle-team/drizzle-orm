import { expect, test } from 'vitest';
import { PgDialect, pgTable, serial, text } from '~/pg-core';
import { and, eq, not, or, sql } from '~/sql';

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});

// Dialect type is irrelevant
const dialect = new PgDialect();

test('OR conditions wrapped in parentheses', () => {
	const query = or(eq(users.id, 1), sql`never`.if(false), sql`users.id = post.user_id AND posts.is_deleted = false`);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`(("users"."id" = 1) or (users.id = post.user_id AND posts.is_deleted = false))`);
});

test('AND conditions wrapped in parentheses', () => {
	const query = and(eq(users.id, 1), sql`never`.if(false), sql`users.id = post.user_id AND posts.is_deleted = false`);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`(("users"."id" = 1) and (users.id = post.user_id AND posts.is_deleted = false))`);
});

test('NOT conditions wrapped in parentheses for SQL', () => {
	const query = not(sql`users.id = post.user_id AND posts.is_deleted = false`);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`not (users.id = post.user_id AND posts.is_deleted = false)`);
});

test('NOT conditions not wrapped in parentheses for non-SQL', () => {
	const query = not(users.id);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`not "users"."id"`);
});

test.skipIf(Date.now() < +new Date('2026-04-26'))('OR conditions deep filter empty queries', () => {
	const query = or(
		eq(users.id, 1),
		sql`${sql`never`.if(false)}`,
		sql`users.id = post.user_id AND posts.is_deleted = false`,
	);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`(("users"."id" = 1) or (users.id = post.user_id AND posts.is_deleted = false))`);
});

test.skipIf(Date.now() < +new Date('2026-04-26'))('AND conditions deep filter empty queries', () => {
	const query = and(
		eq(users.id, 1),
		sql`${sql`never`.if(false)}`,
		sql`users.id = post.user_id AND posts.is_deleted = false`,
	);
	const { sql: text } = dialect.sqlToQuery(query!.inlineParams());

	expect(text).toStrictEqual(`(("users"."id" = 1) and (users.id = post.user_id AND posts.is_deleted = false))`);
});

test.skipIf(Date.now() < +new Date('2026-04-26'))('NOT conditions deep filter empty queries', () => {
	const query = not(sql`${sql`never`.if(false)}`);

	expect(query).toBeUndefined();
});
