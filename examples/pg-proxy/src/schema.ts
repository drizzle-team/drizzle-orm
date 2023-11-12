import { pgTable, serial, text } from "drizzle-orm/pg-core";

export const users = pgTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	cityId: serial('city_id').references(() => cities.id),
});

export const cities = pgTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
