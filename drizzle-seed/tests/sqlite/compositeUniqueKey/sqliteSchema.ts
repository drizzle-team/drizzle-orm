import { integer, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

export const composite = sqliteTable('composite_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = sqliteTable('unique_column_in_composite_of_two_0', {
	id: integer('id').notNull().unique(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = sqliteTable('unique_column_in_composite_of_two_1', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = sqliteTable('unique_column_in_composite_of_three_0', {
	id: integer('id').notNull().unique(),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = sqliteTable('unique_column_in_composite_of_three_1', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	slug: text('slug').notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);
