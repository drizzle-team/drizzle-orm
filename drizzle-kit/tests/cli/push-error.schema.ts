import { sql } from 'drizzle-orm';
import { check, integer, pgTable } from 'drizzle-orm/pg-core';

export const issue6192 = pgTable('issue_6192', {
	id: integer('id').notNull(),
}, (table) => ({
	aFails: check('a_fails', sql`drizzle_issue_6192_missing(${table.id})`),
	zAfterFailure: check('z_after_failure', sql`${table.id} > 0`),
}));
