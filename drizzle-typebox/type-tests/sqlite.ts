import { type Static, Type } from '@sinclair/typebox';
import { blob, integer, numeric, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { createInsertSchema, createSelectSchema } from '../src';
import { type Equal, Expect } from './utils';

const blobJsonSchema = Type.Object({
	foo: Type.String(),
});

const testTable = sqliteTable('users', {
	id: integer('id').primaryKey(),
	blobJson: blob('blob', { mode: 'json' })
		.$type<Static<typeof blobJsonSchema>>()
		.notNull(),
	blobBigInt: blob('blob', { mode: 'bigint' }).notNull(),
	numeric: numeric('numeric').notNull(),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	createdAtMs: integer('created_at_ms', { mode: 'timestamp_ms' }).notNull(),
	boolean: integer('boolean', { mode: 'boolean' }).notNull(),
	real: real('real').notNull(),
	text: text('text', { length: 255 }),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
});

const insertSchema = createInsertSchema(testTable);
const selectSchema = createSelectSchema(testTable);

type InsertType = Static<typeof insertSchema>;
type SelectType = Static<typeof selectSchema>;

Expect<
	Equal<InsertType, {
		boolean: boolean;
		blobJson: string | number | boolean | any[] | {
			[x: string]: any;
		} | null;
		blobBigInt: bigint;
		numeric: string;
		createdAt: Date;
		createdAtMs: Date;
		real: number;
		id?: number;
		text?: string | null;
		role?: 'admin' | 'user';
	}>
>;

Expect<
	Equal<SelectType, {
		boolean: boolean;
		id: number;
		blobJson: string | number | boolean | any[] | {
			[x: string]: any;
		} | null;
		blobBigInt: bigint;
		numeric: string;
		createdAt: Date;
		createdAtMs: Date;
		real: number;
		text: string | null;
		role: 'admin' | 'user';
	}>
>;
