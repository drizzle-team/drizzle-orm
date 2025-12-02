import { relations } from 'drizzle-orm/_relations';
import type { AnyMsSqlColumn } from 'drizzle-orm/mssql-core';
import { int, mssqlTable, text, varchar } from 'drizzle-orm/mssql-core';

// MODEL
export const modelTable = mssqlTable(
	'model',
	{
		id: int().identity().primaryKey(),
		name: varchar({ length: 256 }).notNull(),
		defaultImageId: int().references(() => modelImageTable.id),
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
export const modelImageTable = mssqlTable(
	'model_image',
	{
		id: int().identity().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int()
			.notNull()
			.references((): AnyMsSqlColumn => modelTable.id),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = mssqlTable(
	'model1',
	{
		id: int().identity().primaryKey(),
		name: varchar({ length: 256 }).notNull(),
		userId: int()
			.references(() => user.id),
		defaultImageId: int(),
	},
);

export const modelImageTable1 = mssqlTable(
	'model_image1',
	{
		id: int().identity().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int().notNull()
			.references((): AnyMsSqlColumn => modelTable1.id),
	},
);

export const user = mssqlTable(
	'user',
	{
		id: int().identity().primaryKey(),
		name: text(),
		invitedBy: int().references((): AnyMsSqlColumn => user.id),
		imageId: int()
			.notNull()
			.references((): AnyMsSqlColumn => modelImageTable1.id),
	},
);
