import { relations } from 'drizzle-orm/_relations';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// MODEL
export const modelTable = sqliteTable(
	'model',
	{
		id: integer().primaryKey(),
		name: text().notNull(),
		defaultImageId: integer().references(() => modelImageTable.id),
	},
);

export const modelRelations = relations(modelTable, ({ one, many }) => ({
	images: many(modelImageTable),
	defaultImage: one(modelImageTable, {
		fields: [modelTable.defaultImageId],
		references: [modelImageTable.id],
	}),
}));

// MODEL IMAGE
export const modelImageTable = sqliteTable(
	'model_image',
	{
		id: integer().primaryKey(),
		url: text().notNull(),
		caption: text(),
		modelId: integer()
			.notNull()
			.references((): AnySQLiteColumn => modelTable.id),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = sqliteTable(
	'model1',
	{
		id: integer().primaryKey(),
		name: text().notNull(),
		userId: integer()
			.references(() => user.id),
		defaultImageId: integer().references(() => modelImageTable1.id),
	},
);

export const modelImageTable1 = sqliteTable(
	'model_image1',
	{
		id: integer().primaryKey(),
		url: text().notNull(),
		caption: text(),
		modelId: integer().notNull()
			.references((): AnySQLiteColumn => modelTable1.id),
	},
);

export const user = sqliteTable(
	'user',
	{
		id: integer().primaryKey(),
		name: text(),
		invitedBy: integer().references((): AnySQLiteColumn => user.id),
		imageId: integer()
			.notNull()
			.references((): AnySQLiteColumn => modelImageTable1.id),
	},
);
