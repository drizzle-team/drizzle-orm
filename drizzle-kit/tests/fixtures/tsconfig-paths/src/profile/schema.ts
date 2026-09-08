import { pgTable } from 'drizzle-orm/pg-core';

export const profile = pgTable('profile', (t) => ({
	id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
}));
