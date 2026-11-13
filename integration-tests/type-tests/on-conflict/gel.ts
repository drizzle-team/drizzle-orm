// Type test for https://github.com/drizzle-team/drizzle-orm/issues/3733
// Must be compiled with `exactOptionalPropertyTypes: true`.
// `and()` / `or()` return `SQL | undefined`, which has to be assignable to the
// optional `where` / `targetWhere` / `setWhere` filters.
// (Gel's insert builder method is currently commented out, so the config type
// itself is checked here instead of the full call chain.)

import { and, ne, or, sql } from 'drizzle-orm';
import { integer, gelTable, text } from 'drizzle-orm/gel-core';
import type { GelInsertOnConflictDoUpdateConfig } from 'drizzle-orm/gel-core';

const users = gelTable('users', {
	id: integer('id').primaryKey(),
	name: text('name'),
	age: integer('age'),
});

const config: GelInsertOnConflictDoUpdateConfig<any> = {
	target: users.id,
	set: { age: 2 },
	setWhere: and(ne(users.age, sql`excluded.age`)),
	targetWhere: or(ne(users.age, sql`excluded.age`)),
	where: and(ne(users.age, sql`excluded.age`)),
};

void config;
