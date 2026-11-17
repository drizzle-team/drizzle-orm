import { int, mysqlTable } from 'drizzle-orm/mysql-core';
import { pushSchema } from 'src/payload/mysql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { prepareTestDatabase, type TestDatabase } from './mocks';

describe.skipIf(!process.env['MYSQL_CONNECTION_STRING'])('payload pushSchema', () => {
	let _: TestDatabase;

	beforeAll(async () => {
		_ = await prepareTestDatabase();
	});

	afterAll(async () => {
		await _.close();
	});

	beforeEach(async () => {
		await _.clear();
	});

	test('push asks for a rename hint first and for a data loss confirmation after a create hint', async () => {
		await _.client.query('CREATE TABLE `a` (`id` int PRIMARY KEY);');
		await _.client.query('INSERT INTO `a` VALUES (1);');
		const schema = { b: mysqlTable('b', { id: int('id').primaryKey() }) };

		await expect(pushSchema(schema, _.db, 'drizzle')).rejects.toMatchObject({
			code: 'missing_hints',
			missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['public', 'b'] }],
		});

		await expect(pushSchema(schema, _.db, 'drizzle', undefined, {
			hints: [{ type: 'create', kind: 'table', entity: ['public', 'b'] }],
		})).rejects.toMatchObject({
			code: 'missing_hints',
			missingHints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'], reason: 'non_empty' }],
		});

		const { apply } = await pushSchema(schema, _.db, 'drizzle', undefined, {
			hints: [
				{ type: 'create', kind: 'table', entity: ['public', 'b'] },
				{ type: 'confirm_data_loss', kind: 'table', entity: ['public', 'a'] },
			],
		});
		await apply();

		expect(await _.db.query('SHOW TABLES;', [])).toEqual([{ Tables_in_drizzle: 'b' }]);
	});
});
