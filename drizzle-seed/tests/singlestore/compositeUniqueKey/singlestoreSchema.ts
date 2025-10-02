import { int, singlestoreTable, unique, varchar } from 'drizzle-orm/singlestore-core';

export const composite0 = singlestoreTable('composite_example0', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('composite_example_id_name_unique').on(t.id, t.name),
]);

export const composite = singlestoreTable('composite_example', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = singlestoreTable('unique_column_in_composite_of_two_0', {
	id: int('id').notNull().unique(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = singlestoreTable('unique_column_in_composite_of_two_1', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = singlestoreTable('unique_column_in_composite_of_three_0', {
	id: int('id').notNull().unique(),
	name: varchar('name', { length: 256 }).notNull(),
	slug: varchar('slug', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = singlestoreTable('unique_column_in_composite_of_three_1', {
	id: int('id').notNull(),
	name: varchar('name', { length: 256 }).notNull(),
	slug: varchar('slug', { length: 256 }).notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);
