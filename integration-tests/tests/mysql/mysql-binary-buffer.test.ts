import retry from 'async-retry';
import { binary, int, mysqlTable, varbinary } from 'drizzle-orm/mysql-core';
import type { MySql2Database } from 'drizzle-orm/mysql2';
import { drizzle } from 'drizzle-orm/mysql2';
import * as mysql from 'mysql2/promise';
import { afterAll, beforeAll, expect, expectTypeOf, test } from 'vitest';
import { createDockerDB } from './mysql-common';

const binaryTable = mysqlTable('binary_buffer_test', {
	id: int('id').primaryKey(),
	binaryData: binary('binary_data', { length: 3 }).notNull(),
	varbinaryData: varbinary('varbinary_data', { length: 4 }).notNull(),
});

let db: MySql2Database;
let client: mysql.Connection;

beforeAll(async () => {
	const { connectionString } = await createDockerDB();
	client = await retry(async () => {
		const connection = await mysql.createConnection({
			uri: connectionString,
			supportBigNumbers: true,
		});
		await connection.connect();
		return connection;
	}, {
		retries: 20,
		factor: 1,
		minTimeout: 250,
		maxTimeout: 250,
		randomize: false,
	});

	await client.query('drop table if exists binary_buffer_test');
	await client.query(`
		create table binary_buffer_test (
			id int primary key,
			binary_data binary(3) not null,
			varbinary_data varbinary(4) not null
		)
	`);

	db = drizzle(client);
});

afterAll(async () => {
	await client?.query('drop table if exists binary_buffer_test');
	await client?.end();
});

test('mysql2 preserves binary and varbinary values as Buffers', async () => {
	const binaryValue = Buffer.from([0xff, 0xfe, 0xfd]);
	const varbinaryValue = Buffer.from([0xff, 0x00, 0x80, 0x01]);

	await db.insert(binaryTable).values({
		id: 1,
		binaryData: binaryValue,
		varbinaryData: varbinaryValue,
	});

	const [row] = await db.select().from(binaryTable);

	expect(row).toBeDefined();
	expectTypeOf(row!.binaryData).toEqualTypeOf<Buffer>();
	expectTypeOf(row!.varbinaryData).toEqualTypeOf<Buffer>();
	expect(Buffer.isBuffer(row!.binaryData)).toBe(true);
	expect(Buffer.isBuffer(row!.varbinaryData)).toBe(true);
	expect([...row!.binaryData]).toEqual([...binaryValue]);
	expect([...row!.varbinaryData]).toEqual([...varbinaryValue]);
});

test('binary columns preserve Uint8Array bytes returned by serverless drivers', () => {
	const value = new Uint8Array([0xff, 0x00, 0x80, 0x01]);

	expect([...binaryTable.binaryData.mapFromDriverValue(value)]).toEqual([...value]);
	expect([...binaryTable.varbinaryData.mapFromDriverValue(value)]).toEqual([...value]);
});
