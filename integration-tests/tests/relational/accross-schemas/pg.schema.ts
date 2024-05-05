import { boolean, char, integer, type PgColumn, pgSchema, pgTable, serial, text } from 'drizzle-orm/pg-core';

import { relations } from 'drizzle-orm';

export const mySchema = pgSchema('private');

export const usersTable = mySchema.table('users', {
	id: integer('id').notNull().primaryKey().references((): PgColumn => publicUsersTable.id),
	password: text('password').notNull(),
});

export const usersRelations = relations(usersTable, ({ one }) => ({
	main: one(publicUsersTable, {
		fields: [usersTable.id],
		references: [publicUsersTable.id],
	}),
}));

export const citiesTable = mySchema.table('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	state: char('state', { length: 2 }),
});

export const citiesRelations = relations(citiesTable, ({ many }) => ({
	users: many(publicUsersTable),
}));

export const publicUsersTable = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	verified: boolean('verified').notNull().default(false),
	cityId: integer('city_id').references(() => citiesTable.id),
});

export const publicUsersRelations = relations(publicUsersTable, ({ one }) => ({
	private: one(usersTable, {
		fields: [publicUsersTable.id],
		references: [usersTable.id],
	}),
	city: one(citiesTable, {
		fields: [publicUsersTable.cityId],
		references: [citiesTable.id],
	}),
}));

export const schema1 = pgSchema('Test');

export const parentTable1 = schema1.table('ParentTable', {
	id: integer('Id').primaryKey().notNull(),
	name: text('Name').notNull(),
});

export const childTable1 = schema1.table('ChildTable', {
	id: integer('Id').primaryKey().notNull(),
	parentId: integer('ParentId').notNull(),
	name: text('Name').notNull(),
});

export const parentTableRelations1 = relations(parentTable1, ({ many }) => ({
	children: many(childTable1),
}));

export const childTableRelations1 = relations(childTable1, ({ one }) => ({
	parent: one(parentTable1, {
		fields: [childTable1.parentId],
		references: [parentTable1.id],
	}),
}));

export const schema2 = pgSchema('Schema2');
export const parentTable2 = schema2.table('ParentTable', {
	id: integer('Id').notNull(),
	name: text('Name').notNull(),
});

export const parentTableRelations2 = relations(parentTable2, ({ many }) => ({
	children: many(childTable2),
}));

export const childTable2 = schema2.table('ChildTable', {
	id: integer('Id').notNull(),
	parentId: integer('ParentId').notNull(),
	name: text('Name').notNull(),
});

export const childTableRelations2 = relations(childTable2, ({ one }) => ({
	parent: one(parentTable2, {
		fields: [childTable2.parentId],
		references: [parentTable2.id],
	}),
}));
