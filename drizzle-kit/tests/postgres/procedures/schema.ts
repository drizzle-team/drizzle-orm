/**
 * Drizzle schema for the playground and fixtures. Procedure files import
 * tables from here and interpolate them into sql`...` — the compiler
 * introspects this module at compile time (like drizzle-kit) and emits
 * quoted, rename-safe identifiers.
 */
import { bigint, boolean, numeric, pgSchema, pgTable, text } from 'drizzle-orm/pg-core';

export const accounts = pgTable('accounts', {
	id: bigint('id', { mode: 'number' }).primaryKey(),
	balance: numeric('balance', { mode: 'number' }).notNull(),
	ownerName: text('owner_name'),
	reviewed: boolean('reviewed').notNull().default(false),
});

export const ledger = pgTable('ledger', {
	fromAccount: bigint('from_account', { mode: 'number' }).notNull(),
	toAccount: bigint('to_account', { mode: 'number' }).notNull(),
	amount: numeric('amount', { mode: 'number' }).notNull(),
});

export const tenant = pgSchema('tenant');
