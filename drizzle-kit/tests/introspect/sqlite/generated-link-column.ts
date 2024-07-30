import { sql } from 'drizzle-orm';
import { AnySQLiteColumn, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id'),
	email: text('email'),
	generatedEmail: text('generatedEmail').generatedAlwaysAs(sql`(\`email\``, { mode: 'virtual' }),
});
