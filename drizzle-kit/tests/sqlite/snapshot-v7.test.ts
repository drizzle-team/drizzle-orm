import { type SqliteSnapshotV7, updateToV8 } from 'src/cli/commands/up-sqlite';
import { expect, test } from 'vitest';

test('upgrades SQLite v7 tables to non-strict v8 metadata', () => {
	const snapshot: SqliteSnapshotV7 = {
		version: '7',
		dialect: 'sqlite',
		id: 'snapshot-id',
		prevIds: ['parent-id'],
		ddl: [
			{
				entityType: 'tables',
				name: 'users',
			},
		],
		renames: [],
	};

	expect(updateToV8(snapshot)).toEqual({
		...snapshot,
		version: '8',
		ddl: [
			{
				entityType: 'tables',
				name: 'users',
				isStrict: false,
			},
		],
	});
});
