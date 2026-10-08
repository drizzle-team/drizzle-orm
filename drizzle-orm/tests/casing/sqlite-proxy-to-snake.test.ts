import { beforeEach, describe, it } from 'vitest';
import { asc } from '~/sql';
import { integer, sqliteTable, text } from '~/sqlite-core';
import { drizzle } from '~/sqlite-proxy';

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	firstName: text(),
	lastName: text(),
});

const db = drizzle(async () => [], { casing: 'snake_case' });

const usersCache = {
	'public.users.id': 'id',
	'public.users.firstName': 'first_name',
	'public.users.lastName': 'last_name',
};

describe('sqlite-proxy to snake case', () => {
	beforeEach(() => {
		db.dialect.casing.clearCache();
	});

	it('applies casing from the two-argument config', ({ expect }) => {
		const query = db.select({ firstName: users.firstName }).from(users);

		expect(query.toSQL()).toEqual({
			sql: 'select "first_name" from "users"',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});

	it('set operator orderBy respects casing', ({ expect }) => {
		const query = db
			.select({ firstName: users.firstName })
			.from(users)
			.union(db.select({ firstName: users.firstName }).from(users))
			.orderBy(users.firstName, asc(users.lastName));

		expect(query.toSQL()).toEqual({
			sql:
				'select "first_name" from "users" union select "first_name" from "users" order by "first_name", "last_name" asc',
			params: [],
		});
		expect(db.dialect.casing.cache).toEqual(usersCache);
	});
});
