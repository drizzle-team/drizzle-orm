import { relations } from 'drizzle-orm/_relations';
import { int, serial, singlestoreTable, text, varchar } from 'drizzle-orm/singlestore-core';

// MODEL
export const modelTable = singlestoreTable(
	'model',
	{
		id: serial().primaryKey(),
		name: varchar({ length: 256 }).notNull(),
		defaultImageId: int(),
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
export const modelImageTable = singlestoreTable(
	'model_image',
	{
		id: serial().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int().notNull(),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = singlestoreTable(
	'model1',
	{
		id: serial().primaryKey(),
		name: varchar({ length: 256 }).notNull(),
		userId: int(),
		defaultImageId: int(),
	},
);

export const modelTable1Relations = relations(modelTable1, ({ one }) => ({
	user: one(user, {
		fields: [modelTable1.userId],
		references: [user.id],
	}),
}));

export const modelImageTable1 = singlestoreTable(
	'model_image1',
	{
		id: serial().primaryKey(),
		url: varchar({ length: 256 }).notNull(),
		caption: varchar({ length: 256 }),
		modelId: int().notNull(),
	},
);

export const modelImageTable1Relations = relations(modelImageTable1, ({ one }) => ({
	user: one(modelTable1, {
		fields: [modelImageTable1.modelId],
		references: [modelTable1.id],
	}),
}));

export const user = singlestoreTable(
	'user',
	{
		id: serial().primaryKey(),
		name: text(),
		invitedBy: int(),
		imageId: int().notNull(),
	},
);

export const userRelations = relations(user, ({ one }) => ({
	intvitedByUser: one(user, {
		fields: [user.invitedBy],
		references: [user.id],
	}),
	image: one(modelImageTable1, {
		fields: [user.imageId],
		references: [modelImageTable1.id],
	}),
}));
