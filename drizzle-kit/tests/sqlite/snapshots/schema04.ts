// src/db/schema.ts
import { sql } from 'orm044';
import { blob, customType, integer, numeric, real, sqliteTable, text, uniqueIndex } from 'orm044/sqlite-core';

export const allIntsNumbers = sqliteTable(
	'all_ints_number',
	{
		column: integer('column', { mode: 'number' }).notNull().generatedAlwaysAs(1),
		column1: integer('column1', { mode: 'number' }).default(1),
		column2: integer('column2', { mode: 'number' }).notNull(),
	},
);

export const allIntsTimestamps1 = sqliteTable('all_ints_timestamps_1', {
	columnDateNow: integer('column_date_now_0', { mode: 'timestamp' }).defaultNow(),
	columnAll: integer('column_date_now', { mode: 'timestamp' }).default(new Date('2023-03-01 12:47:29')),
	column: integer('column_date_now_1', { mode: 'timestamp' }).default(sql`'2023-02-28 16:18:31'`),
	column2: integer('column_date_now_2', { mode: 'timestamp' }).default(sql`1766401043893`),
});

export const allIntsTimestamps2 = sqliteTable('all_ints_timestamps_2', {
	columnDateNow: integer('column_date_now_0', { mode: 'timestamp_ms' }).defaultNow(),
	columnAll: integer('column_date_now', { mode: 'timestamp_ms' }).default(new Date('2023-03-01 12:47:29.792')),
	column: integer('column_date_now_1', { mode: 'timestamp_ms' }).default(sql`'2023-02-28 16:18:31.18'`),
	column2: integer('column_date_now_2', { mode: 'timestamp_ms' }).default(sql`1766401043893`),
});

export const allIntsBoolean = sqliteTable('all_ints_boolean', {
	column1: integer('column1', { mode: 'boolean' }).default(true),
	column2: integer('column2', { mode: 'boolean' }).default(false),
});

export const allBlobs = sqliteTable('all_blobs', {
	columnText: blob('column_text', { mode: 'bigint' }).notNull(),
	columnJson: blob('column_all', { mode: 'json' }).notNull().default({ hello: 'world' }),
	columnBuffer: blob('column_buffer', { mode: 'buffer' }).notNull().default(Buffer.from('hello, world')),
});

export const allTexts = sqliteTable('all_texts', {
	columnText: text('column_text', { enum: ['hey'], length: 100 }).notNull().default('hey'),
	columnJson: text('column_all', { mode: 'json' }).notNull().default({ hello: 'world' }),
});
