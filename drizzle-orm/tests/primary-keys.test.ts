import { describe, test } from 'vitest';
import { pgTable, uuid, primaryKey, getTableConfig } from '~/pg-core/index.ts';

describe('primary keys branding', () => {
	test('primaryKey builder builds correctly and configures table', ({ expect }) => {
		const table = pgTable('users', {
			id: uuid('id').notNull(),
			orgId: uuid('org_id').notNull(),
		}, (t) => [
			primaryKey({ columns: [t.id, t.orgId], name: 'users_pk' }),
		]);

		const config = getTableConfig(table);
		expect(config.primaryKeys.length).toBe(1);
		expect(config.primaryKeys[0]?.name).toBe('users_pk');
	});
});
