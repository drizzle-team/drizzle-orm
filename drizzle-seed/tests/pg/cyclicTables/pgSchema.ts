import { relations } from 'drizzle-orm/_relations';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import { foreignKey, integer, pgTable, serial, text, varchar } from 'drizzle-orm/pg-core';

// MODEL
export const modelTable = pgTable(
	'model',
	{
		id: serial().primaryKey(),
		name: varchar().notNull(),
		defaultImageId: integer(),
	},
	(t) => [
		foreignKey({
			columns: [t.defaultImageId],
			foreignColumns: [modelImageTable.id],
		}),
	],
);

export const modelRelations = relations(modelTable, ({ one, many }) => ({
	images: many(modelImageTable),
	defaultImage: one(modelImageTable, {
		fields: [modelTable.defaultImageId],
		references: [modelImageTable.id],
	}),
}));

// MODEL IMAGE
export const modelImageTable = pgTable(
	'model_image',
	{
		id: serial().primaryKey(),
		url: varchar().notNull(),
		caption: varchar(),
		modelId: integer()
			.notNull()
			.references((): AnyPgColumn => modelTable.id),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = pgTable(
	'model1',
	{
		id: serial().primaryKey(),
		name: varchar().notNull(),
		userId: integer()
			.references(() => user.id),
		defaultImageId: integer(),
	},
	(t) => [
		foreignKey({
			columns: [t.defaultImageId],
			foreignColumns: [modelImageTable1.id],
		}),
	],
);

export const modelImageTable1 = pgTable(
	'model_image1',
	{
		id: serial().primaryKey(),
		url: varchar().notNull(),
		caption: varchar(),
		modelId: integer().notNull()
			.references((): AnyPgColumn => modelTable1.id),
	},
);

export const user = pgTable(
	'user',
	{
		id: serial().primaryKey(),
		name: text(),
		invitedBy: integer().references((): AnyPgColumn => user.id),
		imageId: integer()
			.notNull()
			.references((): AnyPgColumn => modelImageTable1.id),
	},
);
