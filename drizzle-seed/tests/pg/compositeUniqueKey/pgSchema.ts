import { integer, pgTable, text, unique, varchar } from 'drizzle-orm/pg-core';

export const composite = pgTable('composite_example', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo0 = pgTable('unique_column_in_composite_of_two_0', {
	id: integer('id').notNull().unique(),
	name: varchar('name', { length: 8 }).notNull(),
}, (t) => [
	unique('custom_name0').on(t.id, t.name),
]);

export const uniqueColumnInCompositeOfTwo1 = pgTable('unique_column_in_composite_of_two_1', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('custom_name1').on(t.id, t.name),
	unique('custom_name1_id').on(t.id),
]);

export const uniqueColumnInCompositeOfThree0 = pgTable('unique_column_in_composite_of_three_0', {
	id: integer('id').notNull().unique(),
	name: text('name').notNull(),
	slug: varchar('slug').notNull(),
}, (t) => [
	unique('custom_name2').on(t.id, t.name, t.slug),
]);

export const uniqueColumnInCompositeOfThree1 = pgTable('unique_column_in_composite_of_three_1', {
	id: integer('id').notNull(),
	name: text('name').notNull(),
	slug: varchar('slug').notNull(),
}, (t) => [
	unique('custom_name3').on(t.id, t.name, t.slug),
	unique('custom_name3_id').on(t.id),
]);

// Regression schema for https://github.com/drizzle-team/drizzle-orm/issues/5919:
// a column (`org_id`) shared across two composite unique constraints. This is
// the multi-tenant pattern (composite-FK target + per-tenant business key) and
// PostgreSQL accepts it; drizzle-seed used to throw "Currently, multiple
// composite unique keys that share the same column are not supported."
export const sharedColumnInTwoComposites = pgTable('shared_column_in_two_composites', {
	id: integer('id').notNull(),
	orgId: integer('org_id').notNull(),
	name: text('name').notNull(),
}, (t) => [
	unique('shared_org_id_unique').on(t.orgId, t.id),
	unique('shared_org_name_unique').on(t.orgId, t.name),
]);
