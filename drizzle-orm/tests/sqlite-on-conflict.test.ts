import { describe, expect, test } from 'vitest';
import { isNull } from '~/index.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { drizzle } from '~/sqlite-proxy/index.ts';

const db = drizzle(async () => ({ rows: [] }));

describe('SQLite onConflictDoNothing', () => {
	const users = sqliteTable('users', {
		id: integer('id').primaryKey(),
		email: text('email').notNull(),
		deletedAt: integer('deleted_at'),
	});

	test('emits target and where clause before do nothing for partial unique index (#6531)', () => {
		const query = db
			.insert(users)
			.values({ email: 'a@example.com' })
			.onConflictDoNothing({ target: users.email, where: isNull(users.deletedAt) });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "email", "deleted_at") values (null, ?, null) on conflict ("users"."email") where "users"."deleted_at" is null do nothing',
			params: ['a@example.com'],
		});
	});

	test('emits target without where clause', () => {
		const query = db
			.insert(users)
			.values({ email: 'a@example.com' })
			.onConflictDoNothing({ target: users.email });

		expect(query.toSQL()).toEqual({
			sql:
				'insert into "users" ("id", "email", "deleted_at") values (null, ?, null) on conflict ("users"."email") do nothing',
			params: ['a@example.com'],
		});
	});

	test('emits on conflict do nothing with no target', () => {
		const query = db
			.insert(users)
			.values({ email: 'a@example.com' })
			.onConflictDoNothing();

		expect(query.toSQL()).toEqual({
			sql: 'insert into "users" ("id", "email", "deleted_at") values (null, ?, null) on conflict do nothing',
			params: ['a@example.com'],
		});
	});
});
