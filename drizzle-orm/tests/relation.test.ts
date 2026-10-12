import { expect, test } from 'vitest';

import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/_relations.ts';
import { relationsFilterToSQL } from '~/relations.ts';
import { pgSchema, pgTable, text } from '~/pg-core/index.ts';

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

	const relationalSchema = Object.fromEntries(
		Object.entries(schema)
			.flatMap(([key, val]) => {
				// have unique keys across schemas

				const mappedTableEntries = Object.entries(val).map((tableEntry) => {
					return [`__${key}__.${tableEntry[0]}`, tableEntry[1]];
				});

				return mappedTableEntries;
			}),
	);

	const relationsConfig = extractTablesRelationalConfig(
		relationalSchema,
		createTableRelationsHelpers,
	);

	expect(Object.keys(relationsConfig)).toHaveLength(2);
});

test('relationsFilterToSQL skips undefined filter and undefined field values', () => {
	const users = pgTable('users', {
		name: text('name'),
	});

	// Undefined filter should return undefined
	expect(relationsFilterToSQL(users as any, undefined)).toBeUndefined();

	// Filter with undefined properties should skip them
	expect(relationsFilterToSQL(users as any, { name: undefined } as any)).toBeUndefined();
});
