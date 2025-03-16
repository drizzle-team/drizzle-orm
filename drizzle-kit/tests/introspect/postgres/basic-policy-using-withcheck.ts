import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgTable } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
	id: integer().primaryKey().notNull(),
}, (table) => {
	return {
		test: pgPolicy('test', { as: 'permissive', for: 'all', to: ['public'], using: sql`true`, withCheck: sql`true` }),
	};
});
