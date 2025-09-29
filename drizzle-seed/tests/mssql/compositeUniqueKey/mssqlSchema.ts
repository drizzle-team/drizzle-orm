import { int, mssqlTable, unique, varchar } from 'drizzle-orm/mssql-core';

export const composite = mssqlTable('composite_example', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = mssqlTable('unique_column_in_composite_of_two_0', {
	id: int('id').notNull().unique(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = mssqlTable('unique_column_in_composite_of_two_1', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = mssqlTable('unique_column_in_composite_of_three_0', {
	id: int('id').notNull().unique(),
	name: varchar('name', { length: 256 }).notNull(),
	slug: varchar('slug', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = mssqlTable('unique_column_in_composite_of_three_1', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
	slug: varchar('slug', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);
