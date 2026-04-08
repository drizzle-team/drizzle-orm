import { relations } from '~/_relations.ts';
import { pgTable, text } from '~/pg-core/index.ts';

// Test: branded/nominal types should work in RQB-V2 where clause
// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/5298

type TypeId<T extends string> = string & { readonly __brand: T };

const users = pgTable('users', {
	id: text('id').$type<TypeId<'user'>>().primaryKey(),
	name: text('name').notNull(),
});

const members = pgTable('members', {
	userId: text('userId').$type<TypeId<'user'>>().notNull(),
	role: text('role').notNull(),
});

const _membersRelations = relations(members, ({ one }) => ({
	user: one(users, { fields: [members.userId], references: [users.id] }),
}));

// This should type-check without error (was broken before the fix):
declare const db: any;
db.query.members.findFirst({
	where: { userId: 'user_123' as TypeId<'user'> },
});
