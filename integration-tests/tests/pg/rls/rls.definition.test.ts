import { crudPolicy } from 'drizzle-orm/neon';
import { getTableConfig, integer, pgPolicy, pgRole, pgTable } from 'drizzle-orm/pg-core';
import { expect, test } from 'vitest';

test('getTableConfig: policies', async () => {
	const schema = pgTable('hhh', {
		id: integer(),
	}, () => [
		pgPolicy('name'),
		crudPolicy({ role: pgRole('users'), read: true, modify: true }),
	]);

	const tc = getTableConfig(schema);

	expect(tc.policies.length).toEqual(5);

	expect(tc.policies.map((p) => p.name)).toEqual([
		'name',
		'crud-users-policy-select',
		'crud-users-policy-insert',
		'crud-users-policy-update',
		'crud-users-policy-delete',
	]);

	expect(tc.policies.map((p) => p.for)).toEqual([
		undefined,
		'select',
		'insert',
		'update',
		'delete',
	]);
});
