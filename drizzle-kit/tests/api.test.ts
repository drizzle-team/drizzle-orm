import { integer, pgTable } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';
import { generateDrizzleJson, generateMigration } from '../src/api';

test('generateMigration treats unresolved table changes as create and drop', async () => {
	const from = generateDrizzleJson({
		users: pgTable('users', {
			id: integer('id'),
		}),
	});

	const to = generateDrizzleJson({
		orders: pgTable('orders', {
			id: integer('id'),
		}),
	});

	const sqlStatements = await generateMigration(from, to);

	expect(sqlStatements).toContain('CREATE TABLE "orders" (\n\t"id" integer\n);\n');
	expect(sqlStatements).toContain('DROP TABLE "users" CASCADE;');
});
