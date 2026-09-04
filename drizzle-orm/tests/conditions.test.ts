import { describe, expect, test } from 'vitest';

import { PgDialect, pgTable, timestamp, varchar } from '~/pg-core';
import { and, eq, isNotNull, isNull, or } from '~/sql/expressions/conditions';
import type { SQL } from '~/sql/sql';

const users = pgTable('users', {
	name: varchar('name'),
	deletedAt: timestamp('deleted_at'),
});

const render = (condition: SQL): string => new PgDialect().sqlToQuery(condition).sql;

describe('isNull / isNotNull parenthesization', () => {
	// https://github.com/drizzle-team/drizzle-orm/issues/6010
	test('composes inside a binary operator without producing invalid SQL', () => {
		// Unparenthesized this renders `"users"."name" is not null = "users"."deleted_at" is not null`.
		// Postgres rejects it: `=` binds tighter than `IS NOT NULL`, so the server reads it as
		// `"users"."name" is not (null = "users"."deleted_at") is not null`.
		expect(render(eq(isNotNull(users.name), isNotNull(users.deletedAt)))).toBe(
			'("users"."name" is not null) = ("users"."deleted_at" is not null)',
		);
	});

	test('parenthesizes isNull the same way', () => {
		expect(render(eq(isNull(users.name), isNull(users.deletedAt)))).toBe(
			'("users"."name" is null) = ("users"."deleted_at" is null)',
		);
	});

	test('composes with and/or, which already parenthesize themselves', () => {
		expect(render(and(isNull(users.deletedAt), or(isNotNull(users.name), eq(users.name, 'a')))!)).toBe(
			'(("users"."deleted_at" is null) and (("users"."name" is not null) or "users"."name" = $1))',
		);
	});
});
