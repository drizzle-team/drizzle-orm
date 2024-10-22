import { expect, test } from 'vitest';

import { pgSchema, pgTable } from '~/pg-core/index.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';

test('tables with same name in different schemas', () => {
	const folder = pgSchema('folder');
	const schema = {
		folder: {
			usersInFolder: folder.table('users', {}),
		},
		public: {
			users: pgTable('users', {}),
		},
	};

	const relationalSchema = {
		...Object.fromEntries(
			Object.entries(schema)
				.flatMap(([key, val]) => {
					// have unique keys across schemas

					const mappedTableEntries = Object.entries(val).map((tableEntry) => {
						return [`__${key}__.${tableEntry[0]}`, tableEntry[1]];
					});

					return mappedTableEntries;
				}),
		),
	};

	const relationsConfig = extractTablesRelationalConfig(
		relationalSchema,
		createTableRelationsHelpers,
	);

	expect(Object.keys(relationsConfig)).toHaveLength(2);
});
