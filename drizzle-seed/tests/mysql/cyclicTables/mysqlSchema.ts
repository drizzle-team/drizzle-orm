import { relations } from 'drizzle-orm/_relations';
import type { AnyMySqlColumn } from 'drizzle-orm/mysql-core';
import { int, mysqlTable, serial, text, varchar } from 'drizzle-orm/mysql-core';

// MODEL
export const modelTable = mysqlTable(
	'model',
	{
		id: serial().primaryKey(),
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
export const modelImageTable = mysqlTable(
	'model_image',
	{
		id: serial().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int()
			.notNull()
			.references((): AnyMySqlColumn => modelTable.id),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = mysqlTable(
	'model1',
	{
		id: serial().primaryKey(),
		name: varchar({ length: 256 }).notNull(),
		userId: int()
			.references(() => user.id),
		defaultImageId: int(),
	},
);

export const modelImageTable1 = mysqlTable(
	'model_image1',
	{
		id: serial().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int().notNull()
			.references((): AnyMySqlColumn => modelTable1.id),
	},
);

export const user = mysqlTable(
	'user',
	{
		id: serial().primaryKey(),
		name: text(),
		invitedBy: int().references((): AnyMySqlColumn => user.id),
		imageId: int()
			.notNull()
			.references((): AnyMySqlColumn => modelImageTable1.id),
	},
);
