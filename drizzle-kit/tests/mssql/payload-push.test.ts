import { int, mssqlTable } from 'drizzle-orm/mssql-core';
import { drizzle } from 'drizzle-orm/node-mssql';
import { pushSchema } from 'src/payload/mssql';
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { prepareTestDatabase, type TestDatabase } from './mocks';

describe.skipIf(!process.env['MSSQL_CONNECTION_STRING'])('payload pushSchema', () => {
	let _: TestDatabase;

	beforeAll(async () => {
		_ = await prepareTestDatabase(false);
	});

	afterAll(async () => {
		await _.close();
	});

	beforeEach(async () => {
		await _.clear();
	});

	test('push asks for a rename hint first and for a data loss confirmation after a create hint', async () => {
		await _.db.query('CREATE TABLE [a] ([id] int PRIMARY KEY);');
		await _.db.query('INSERT INTO [a] VALUES (1);');
		const db = drizzle({ client: _.client });
		const schema = { b: mssqlTable('b', { id: int('id').primaryKey() }) };

		await expect(pushSchema(schema, db)).rejects.toMatchObject({
			code: 'missing_hints',
			missingHints: [{ type: 'rename_or_create', kind: 'table', entity: ['dbo', 'b'] }],
		});

		await expect(pushSchema(schema, db, undefined, undefined, {
			hints: [{ type: 'create', kind: 'table', entity: ['dbo', 'b'] }],
		})).rejects.toMatchObject({
			code: 'missing_hints',
			missingHints: [{ type: 'confirm_data_loss', kind: 'table', entity: ['dbo', 'a'], reason: 'non_empty' }],
		});

		const { apply } = await pushSchema(schema, db, undefined, undefined, {
			hints: [
				{ type: 'create', kind: 'table', entity: ['dbo', 'b'] },
				{ type: 'confirm_data_loss', kind: 'table', entity: ['dbo', 'a'] },
			],
		});
		await apply();

		expect(await _.db.query(`SELECT name FROM sys.tables;`)).toEqual([{ name: 'b' }]);
	});
});
