import { relations } from 'drizzle-orm/_relations';
import type { AnyCockroachColumn } from 'drizzle-orm/cockroach-core';
import { cockroachTable, foreignKey, int4, string, varchar } from 'drizzle-orm/cockroach-core';

// MODEL
export const modelTable = cockroachTable(
	'model',
	{
		id: int4().primaryKey().generatedByDefaultAsIdentity(),
		name: varchar().notNull(),
		defaultImageId: int4(),
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
export const modelImageTable = cockroachTable(
	'model_image',
	{
		id: int4().primaryKey(),
		url: varchar().notNull(),
		caption: varchar(),
		modelId: int4()
			.notNull()
			.references((): AnyCockroachColumn => modelTable.id),
	},
);

export const modelImageRelations = relations(modelImageTable, ({ one }) => ({
	model: one(modelTable, {
		fields: [modelImageTable.modelId],
		references: [modelTable.id],
	}),
}));

// 3 tables case
export const modelTable1 = cockroachTable(
	'model1',
	{
		id: int4().primaryKey(),
		name: varchar().notNull(),
		userId: int4()
			.references(() => user.id),
		defaultImageId: int4(),
	},
	(t) => [
		foreignKey({
			columns: [t.defaultImageId],
			foreignColumns: [modelImageTable1.id],
		}),
	],
);

export const modelImageTable1 = cockroachTable(
	'model_image1',
	{
		id: int4().primaryKey(),
		url: varchar().notNull(),
		caption: varchar(),
		modelId: int4().notNull()
			.references((): AnyCockroachColumn => modelTable1.id),
	},
);

export const user = cockroachTable(
	'user',
	{
		id: int4().primaryKey(),
		name: string(),
		invitedBy: int4().references((): AnyCockroachColumn => user.id),
		imageId: int4()
			.notNull()
			.references((): AnyCockroachColumn => modelImageTable1.id),
	},
);
