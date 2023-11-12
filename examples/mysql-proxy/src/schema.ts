import { mysqlTable, serial, text } from "drizzle-orm/mysql-core";

export const users = mysqlTable('users', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	cityId: serial('city_id').references(() => cities.id),
});

export const cities = mysqlTable('cities', {
	id: serial('id').primaryKey(),
	name: text('name').notNull(),
});
