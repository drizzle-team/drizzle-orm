import { cockroachTable, int4, text, unique, varchar } from 'drizzle-orm/cockroach-core';

export const composite = cockroachTable('composite_example', {
	id: int4('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = cockroachTable('unique_column_in_composite_of_two_0', {
	id: int4('id').notNull().unique(),
	name: varchar('name', { length: 8 }).notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = cockroachTable('unique_column_in_composite_of_two_1', {
	id: int4('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = cockroachTable('unique_column_in_composite_of_three_0', {
	id: int4('id').notNull().unique(),
	name: text('name').notNull(),
	slug: varchar('slug').notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = cockroachTable('unique_column_in_composite_of_three_1', {
	id: int4('id').notNull(),
	name: text('name').notNull(),
	slug: varchar('slug').notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);
