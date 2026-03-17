import { profile } from '@/profile/schema';
import { profile as profileAlias } from '@profile';
import { pgTable } from 'drizzle-orm/pg-core';

export const user = pgTable('user', (t) => ({
	id: t.integer().primaryKey().generatedAlwaysAsIdentity(),
	profileId: t
		.integer()
		.unique()
		.references(() => profile.id)
		.notNull(),
	profileAliasId: t
		.integer()
		.references(() => profileAlias.id),
}));
