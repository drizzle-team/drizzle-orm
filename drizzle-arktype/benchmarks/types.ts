import { bench, setup } from '@ark/attest';
import { type } from 'arktype';
import { boolean, integer, pgTable, text } from 'drizzle-orm/pg-core';
import { createSelectSchema } from '~/index.ts';

const users = pgTable('users', {
	id: integer().primaryKey(),
	firstName: text().notNull(),
	middleName: text(),
	lastName: text().notNull(),
	age: integer().notNull(),
	admin: boolean().notNull().default(false),
});

const teardown = setup();

bench('select schema', () => {
	return createSelectSchema(users);
}).types([13129, 'instantiations']);

bench('select schema with refinements', () => {
	return createSelectSchema(users, {
		firstName: (t) => t.atMostLength(100),
		middleName: (t) => t.atMostLength(100),
		lastName: (t) => t.atMostLength(100),
		age: type.number.atLeast(1),
	});
}).types([21631, 'instantiations']);

teardown();
