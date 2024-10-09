import { crudPolicy } from 'drizzle-orm/neon';
import { getTableConfig, integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';
import { test } from 'vitest';

test('getTableConfig: policies', async () => {
	const schema = pgTable('hhh', {
		id: integer(),
	}, () => [
		pgPolicy('name'),
		crudPolicy({ role: pgRole('users') }),
	]);

	const tc = getTableConfig(schema);

	console.log(tc.policies);
});
