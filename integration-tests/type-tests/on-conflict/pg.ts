// Type test for https://github.com/drizzle-team/drizzle-orm/issues/3733
// Must be compiled with `exactOptionalPropertyTypes: true`.
// `and()` / `or()` return `SQL | undefined`, which has to be assignable to the
// optional `where` / `targetWhere` / `setWhere` filters of `onConflictDoUpdate`.

import { and, ne, or, sql } from 'drizzle-orm';
import { integer, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';

const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name'),
	age: integer('age'),
});

const db = drizzle.mock();

async function repro() {
	// Exact repro from the issue body.
	await db
		.insert(users)
		.values({ name: 'a', age: 1 })
		.onConflictDoUpdate({
			target: users.id,
			set: { age: 2 },
			setWhere: and(ne(users.age, sql`excluded.age`)),
		});

	// The deprecated `where` filter takes the same `SQL | undefined` values.
	await db
		.insert(users)
		.values({ name: 'b', age: 1 })
		.onConflictDoUpdate({
			target: users.id,
			set: { age: 2 },
			where: or(ne(users.age, sql`excluded.age`)),
		});

	// `targetWhere` + `setWhere` together.
	await db
		.insert(users)
		.values({ name: 'c', age: 1 })
		.onConflictDoUpdate({
			target: users.id,
			set: { age: 2 },
			targetWhere: and(ne(users.age, sql`excluded.age`)),
			setWhere: or(ne(users.name, sql`excluded.name`)),
		});
}

void repro;
