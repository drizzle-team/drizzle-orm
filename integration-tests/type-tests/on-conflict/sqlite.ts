// Type test for https://github.com/drizzle-team/drizzle-orm/issues/3733
// Must be compiled with `exactOptionalPropertyTypes: true`.
// `and()` / `or()` return `SQL | undefined`, which has to be assignable to the
// optional `where` / `targetWhere` / `setWhere` filters of `onConflictDoUpdate`.

import { and, ne, or, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
	age: integer('age'),
});

const db = drizzle.mock();

async function repro() {
	await db
		.insert(users)
		.values({ name: 'a', age: 1 })
		.onConflictDoUpdate({
			target: users.id,
			set: { age: 2 },
			setWhere: and(ne(users.age, sql`excluded.age`)),
			targetWhere: or(ne(users.age, sql`excluded.age`)),
		});

	await db
		.insert(users)
		.values({ name: 'b', age: 1 })
		.onConflictDoUpdate({
			target: users.id,
			set: { age: 2 },
			where: and(ne(users.age, sql`excluded.age`)),
		});
}

void repro;
