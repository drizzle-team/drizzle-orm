import { type Client, createClient } from '@libsql/client';
import { eq, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { integer, sqliteSchema, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import fs from 'fs';
import path from 'path';
import { afterAll, beforeAll, expect, test } from 'vitest';

// Define Bronze schema (attached database)
const bronze = sqliteSchema('bronze');

const bronzeMessageSnapshot = bronze.table('message_snapshot', {
	id: text('id').primaryKey(),
	body: text('body').notNull(),
	occurredAt: integer('occurred_at').notNull(),
});

// Define Warehouse schema (main database)
const warehouseMessage = sqliteTable('message', {
	id: text('id').primaryKey(),
	body: text('body').notNull(),
});

// Test context
let client: Client;
let db: ReturnType<typeof drizzle>;
let tmpDir: string;
let bronzePath: string;
let warehousePath: string;

beforeAll(async () => {
	// Create temporary directory
	tmpDir = path.join('/tmp', `drizzle-attach-test-${Date.now()}`);
	fs.mkdirSync(tmpDir, { recursive: true });

	bronzePath = path.join(tmpDir, 'bronze.db');
	warehousePath = path.join(tmpDir, 'warehouse.db');

	// Initialize bronze.db
	const bronzeClient = createClient({ url: `file:${bronzePath}` });
	await bronzeClient.execute(`
		CREATE TABLE message_snapshot (
			id TEXT PRIMARY KEY,
			body TEXT NOT NULL,
			occurred_at INTEGER NOT NULL
		)
	`);
	await bronzeClient.execute(`
		INSERT INTO message_snapshot (id, body, occurred_at)
		VALUES ('msg1', 'Hello from Bronze', 1234567890)
	`);
	bronzeClient.close();

	// Initialize warehouse.db
	client = createClient({ url: `file:${warehousePath}` });
	await client.execute(`
		CREATE TABLE message (
			id TEXT PRIMARY KEY,
			body TEXT NOT NULL
		)
	`);
	await client.execute(`
		INSERT INTO message (id, body)
		VALUES ('msg1', 'Hello from Warehouse')
	`);

	// Create Drizzle instance
	db = drizzle(client, {
		schema: { bronzeMessageSnapshot, warehouseMessage },
	});

	// Attach bronze.db
	await db.$attach('bronze', bronzePath);
});

afterAll(async () => {
	client.close();
	// Clean up temp directory
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('sqliteSchema creates tables with schema prefix', () => {
	// Verify table has schema metadata
	expect(bronzeMessageSnapshot[Symbol.for('drizzle:Schema')]).toBe('bronze');
	expect(warehouseMessage[Symbol.for('drizzle:Schema')]).toBeUndefined();
});

test('$attach method executes ATTACH statement', async () => {
	// Verify attached database is accessible via raw SQL
	const result = await client.execute(`
		SELECT name FROM bronze.sqlite_master WHERE type='table'
	`);
	expect(result.rows.length).toBeGreaterThan(0);
	expect(result.rows.some((r: any) => r.name === 'message_snapshot')).toBe(true);
});

test('query attached schema via Drizzle ORM', async () => {
	const rows = await db.select().from(bronzeMessageSnapshot).all();

	expect(rows).toHaveLength(1);
	expect(rows[0]).toEqual({
		id: 'msg1',
		body: 'Hello from Bronze',
		occurredAt: 1234567890,
	});
});

test('query main schema via Drizzle ORM', async () => {
	const rows = await db.select().from(warehouseMessage).all();

	expect(rows).toHaveLength(1);
	expect(rows[0]).toEqual({
		id: 'msg1',
		body: 'Hello from Warehouse',
	});
});

test('cross-database JOIN works', async () => {
	const joined = await db
		.select({
			bronzeId: bronzeMessageSnapshot.id,
			bronzeBody: bronzeMessageSnapshot.body,
			warehouseBody: warehouseMessage.body,
		})
		.from(bronzeMessageSnapshot)
		.leftJoin(warehouseMessage, eq(bronzeMessageSnapshot.id, warehouseMessage.id))
		.all();

	expect(joined).toHaveLength(1);
	expect(joined[0]).toEqual({
		bronzeId: 'msg1',
		bronzeBody: 'Hello from Bronze',
		warehouseBody: 'Hello from Warehouse',
	});
});

test('SQL generation includes schema prefix', async () => {
	// Execute query and capture generated SQL
	const query = db
		.select()
		.from(bronzeMessageSnapshot)
		.where(eq(bronzeMessageSnapshot.id, 'msg1'))
		.toSQL();

	// Verify SQL contains schema prefix
	expect(query.sql).toContain('"bronze"."message_snapshot"');
});

test('$detach method removes attached database', async () => {
	// Detach
	await db.$detach('bronze');

	// Verify bronze schema is no longer accessible
	try {
		await client.execute(`SELECT * FROM bronze.message_snapshot`);
		throw new Error('Should have thrown error');
	} catch (err: any) {
		expect(err.message).toContain('no such table');
	}

	// Re-attach for cleanup
	await db.$attach('bronze', bronzePath);
});
