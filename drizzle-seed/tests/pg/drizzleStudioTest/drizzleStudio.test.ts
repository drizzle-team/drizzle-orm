import { expect, test } from 'vitest';
import { seedForDrizzleStudio } from '../../../src/index.ts';

test('a table that generates no rows is still part of the result', async () => {
	const result = await seedForDrizzleStudio({
		sqlDialect: 'postgresql',
		drizzleStudioObject: {
			public: {
				tables: {
					users: {
						columns: { id: { name: 'id', type: 'integer', primaryKey: true, notNull: true, default: undefined } },
					},
				},
			},
		} as any,
		drizzleStudioRelations: [],
		schemasRefinements: { public: { users: { count: 0, columns: {} } } },
	});
	expect(result['public']!.tables.map((t) => t.tableName)).toEqual(['users']);
	expect(result['public']!.tables[0]!.rows).toEqual([]);
});
