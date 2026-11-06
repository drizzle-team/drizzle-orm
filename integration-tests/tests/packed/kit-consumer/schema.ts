import { integer, pgSchema, text } from 'drizzle-orm/pg-core';

export const packedKit = pgSchema('packed_kit');

export const users = packedKit.table('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
});
