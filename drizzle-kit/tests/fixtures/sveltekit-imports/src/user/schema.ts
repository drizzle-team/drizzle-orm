import { profile } from '#lib/profile/schema';
import { pgTable } from 'drizzle-orm/pg-core';

export const user = pgTable('user', (t) => ({
	id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
	profileId: t
		.integer()
		.references(() => profile.id)
		.notNull(),
}));
