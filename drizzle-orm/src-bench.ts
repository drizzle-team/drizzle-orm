/**
 * Source-only benchmark - runs against .ts source files directly
 * Run with: npx tsc --noEmit --extendedDiagnostics src-bench.ts
 */
import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from './src/pg-core/index.js';

// Warm up
pgTable('baseline', { id: integer() });

// pg table - 5 columns with modifiers
const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
	email: text().notNull(),
	active: boolean().default(true),
	createdAt: timestamp().defaultNow(),
});

// pg table - 10 columns
const table10 = pgTable('table_10_cols', {
	id: integer().primaryKey(),
	uuid: uuid().notNull(),
	name: text().notNull(),
	email: varchar({ length: 255 }).notNull(),
	bio: text(),
	active: boolean().default(true),
	role: text().default('user'),
	createdAt: timestamp().defaultNow(),
	updatedAt: timestamp(),
	deletedAt: timestamp(),
});

export { table10, users };
