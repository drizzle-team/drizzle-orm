import { integer, pgPolicy, pgTable } from 'drizzle-orm/pg-core';
import { diffTestSchemas } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

test('add policy #1', async (t) => {
	const schema1 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}),
	};

	const schema2 = {
		users: pgTable('users', {
			id: integer('id').primaryKey(),
		}, () => ({
			rls: pgPolicy('test', { as: 'permissive' }),
		})),
	};

	const { statements, sqlStatements } = await diffTestSchemas(schema1, schema2, []);

	console.log(sqlStatements);
});
