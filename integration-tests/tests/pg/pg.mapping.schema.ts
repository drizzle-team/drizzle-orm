import { relations } from 'drizzle-orm/_relations';
import { boolean, integer, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

export const menuItems = pgTable('menu_items', {
	id: uuid('id').defaultRandom().primaryKey(),
});

export const modifierGroups = pgTable('modifier_groups', {
	id: uuid('id').defaultRandom().primaryKey(),
});

export const menuItemModifierGroups = pgTable(
	'menu_item_modifier_groups',
	{
		menuItemId: uuid('menu_item_id')
			.notNull()
			.references(() => menuItems.id),
		modifierGroupId: uuid('modifier_group_id')
			.notNull()
			.references(() => modifierGroups.id),
		order: integer('order').default(0),
	},
	(table) => [primaryKey({
		columns: [
			table.menuItemId,
			table.modifierGroupId,
			table.order,
		],
	})],
);

export const ingredients = pgTable('ingredients', {
	id: uuid('id').defaultRandom().primaryKey(),
	name: text('name').notNull(),
	description: text('description'),
	imageUrl: text('image_url'),
	inStock: boolean('in_stock').default(true),
});

export const modifiers = pgTable('modifiers', {
	id: uuid('id').defaultRandom().primaryKey(),
	ingredientId: uuid('ingredient_id').references(() => ingredients.id),
	itemId: uuid('item_id').references(() => menuItems.id),
});

export const menuItemIngredients = pgTable(
	'menu_item_ingredients',
	{
		menuItemId: uuid('menu_item_id')
			.notNull()
			.references(() => menuItems.id),
		ingredientId: uuid('ingredient_id')
			.notNull()
			.references(() => ingredients.id),
		order: integer('order').default(0),
	},
	(table) => [
		primaryKey(
			{
				columns: [table.menuItemId, table.ingredientId, table.order],
			},
		),
	],
);

export const modifierGroupModifiers = pgTable(
	'modifier_group_modifiers',
	{
		modifierGroupId: uuid('modifier_group_id')
			.notNull()
			.references(() => modifierGroups.id),
		modifierId: uuid('modifier_id')
			.notNull()
			.references(() => modifiers.id),
		order: integer('order').default(0),
	},
	(table) => [
		primaryKey({
			columns: [
				table.modifierGroupId,
				table.modifierId,
				table.order,
			],
		}),
	],
);

export const menuItemRelations = relations(menuItems, ({ many }) => ({
	ingredients: many(menuItemIngredients),
	modifierGroups: many(menuItemModifierGroups),
	// category: one(menuCategories, {
	// 	fields: [menuItems.categoryId],
	// 	references: [menuCategories.id],
	// }),
}));

export const menuItemIngredientRelations = relations(
	menuItemIngredients,
	({ one }) => ({
		menuItem: one(menuItems, {
			fields: [menuItemIngredients.menuItemId],
			references: [menuItems.id],
		}),
		ingredient: one(ingredients, {
			fields: [menuItemIngredients.ingredientId],
			references: [ingredients.id],
		}),
	}),
);

export const ingredientRelations = relations(ingredients, ({ many }) => ({
	menuItems: many(menuItemIngredients),
}));

export const modifierGroupRelations = relations(modifierGroups, ({ many }) => ({
	menuItems: many(menuItemModifierGroups),
	modifiers: many(modifierGroupModifiers),
}));

export const modifierRelations = relations(modifiers, ({ one, many }) => ({
	modifierGroups: many(modifierGroupModifiers),
	ingredient: one(ingredients, {
		fields: [modifiers.ingredientId],
		references: [ingredients.id],
	}),
	item: one(menuItems, {
		fields: [modifiers.itemId],
		references: [menuItems.id],
	}),
}));

export const menuItemModifierGroupRelations = relations(
	menuItemModifierGroups,
	({ one }) => ({
		menuItem: one(menuItems, {
			fields: [menuItemModifierGroups.menuItemId],
			references: [menuItems.id],
		}),
		modifierGroup: one(modifierGroups, {
			fields: [menuItemModifierGroups.modifierGroupId],
			references: [modifierGroups.id],
		}),
	}),
);

export const modifierGroupModifierRelations = relations(
	modifierGroupModifiers,
	({ one }) => ({
		modifierGroup: one(modifierGroups, {
			fields: [modifierGroupModifiers.modifierGroupId],
			references: [modifierGroups.id],
		}),
		modifier: one(modifiers, {
			fields: [modifierGroupModifiers.modifierId],
			references: [modifiers.id],
		}),
	}),
);
