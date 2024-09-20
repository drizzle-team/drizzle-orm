import { pgTable, serial, text } from 'drizzle-orm/pg-core'

export const User = pgTable('User', {
	id: serial('id').notNull().primaryKey(),
	email: text('email').notNull().unique(),
	name: text('name')
});