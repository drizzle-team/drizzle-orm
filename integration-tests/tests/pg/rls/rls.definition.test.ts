import { crudPolicy } from 'drizzle-orm/neon';
import { getTableConfig, integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';
import { test } from 'vitest';

test.skip('getTableConfig: policies', async () => {
	const schema = pgTable('hhh', {
		id: integer(),
	}, () => [
		pgPolicy('name'),
		crudPolicy({ role: pgRole('users'), read: true, modify: true }),
	]);

	const tc = getTableConfig(schema);

	console.log(tc.policies);
});
