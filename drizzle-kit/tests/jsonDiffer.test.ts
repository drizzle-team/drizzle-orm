import { applyJsonDiff } from 'src/jsonDiffer';
import { expect, test } from 'vitest';

// #5761 regression: when a table's schema changes alongside another diffed
// field (e.g. a partial index whose `where` clause picks up the schema
// qualifier), `applyJsonDiff` used to leave `schema` as the json-diff
// `{ __old, __new }` object instead of a string, breaking the downstream
// Zod check.
test('applyJsonDiff keeps schema a string when it changes alongside another field', () => {
	const baseTable = {
		name: 'widgets',
		schema: '',
		columns: {
			id: { name: 'id', type: 'uuid', primaryKey: true, notNull: true },
			deleted_at: { name: 'deleted_at', type: 'timestamp', notNull: false },
		},
		indexes: {
			idx_widgets_active: {
				name: 'idx_widgets_active',
				columns: [{ expression: 'id', isExpression: false, asc: true }],
				isUnique: true,
				where: '"deleted_at" IS NULL',
				concurrently: false,
				method: 'btree',
				with: {},
			},
		},
		foreignKeys: {},
		compositePrimaryKeys: {},
		uniqueConstraints: {},
		checkConstraints: {},
		policies: {},
		isRLSEnabled: false,
	};

	const json1 = {
		tables: { 'public.widgets': baseTable },
		schemas: {},
		enums: {},
		sequences: {},
		roles: {},
		policies: {},
		views: {},
	};

	const json2 = JSON.parse(JSON.stringify(json1));
	json2.tables['public.widgets'].schema = 'public';
	json2.tables['public.widgets'].indexes.idx_widgets_active.where =
		'"public"."widgets"."deleted_at" IS NULL';

	const result = applyJsonDiff(json1, json2);
	const altered = result.alteredTablesWithColumns[0];
	expect(typeof altered.schema).toBe('string');
	expect(altered.name).toBe('widgets');
});
