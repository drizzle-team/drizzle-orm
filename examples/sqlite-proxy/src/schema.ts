import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull(),
	cityId: int('city_id'),
});

export const cities = sqliteTable('cities', {
	id: int('id').primaryKey(),
	name: text('name').notNull(),
});
