import { int, mysqlTable, varchar } from 'drizzle-orm/mysql-core'

export const User = mysqlTable('User', {
	id: int('id').notNull().primaryKey().autoincrement(),
	email: varchar('email', { length: 191 }).notNull().unique(),
	name: varchar('name', { length: 191 })
});