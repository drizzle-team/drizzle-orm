import { sql } from 'drizzle-orm';
import { integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';

export const userRole = pgRole('user_role', { createRole: true, inherit: false });

export const users = pgTable('users', {
	id: integer().primaryKey().notNull(),
}, (table) => {
	return {
		test: pgPolicy('test', { as: 'permissive', for: 'all', to: ['public'], using: sql`true`, withCheck: sql`true` }),
		newRls: pgPolicy('newRls', { as: 'permissive', for: 'all', to: ['postgres', userRole] }),
	};
});
