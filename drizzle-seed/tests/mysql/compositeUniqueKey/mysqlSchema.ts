import { int, mysqlTable, unique, varchar } from 'drizzle-orm/mysql-core';

export const composite = mysqlTable('composite_example', {
	id: int().notNull(),
	name: varchar({ length: 8 }).notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = mysqlTable('unique_column_in_composite_of_two_0', {
	id: int().notNull().unique(),
	name: varchar({ length: 8 }).notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = mysqlTable('unique_column_in_composite_of_two_1', {
	id: int().notNull(),
	name: varchar({ length: 8 }).notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = mysqlTable('unique_column_in_composite_of_three_0', {
	id: int().notNull().unique(),
	name: varchar({ length: 8 }).notNull(),
	slug: varchar({ length: 8 }).notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = mysqlTable('unique_column_in_composite_of_three_1', {
	id: int().notNull(),
	name: varchar({ length: 8 }).notNull(),
	slug: varchar({ length: 8 }).notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);
