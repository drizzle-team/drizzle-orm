import { int, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const User = sqliteTable('User', {
	id: int('id').notNull().primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name')
});