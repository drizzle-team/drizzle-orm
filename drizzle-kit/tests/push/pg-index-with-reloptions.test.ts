import { PGlite } from '@electric-sql/pglite';
import { index, pgTable, serial, text } from 'drizzle-orm/pg-core';
import { diffTestSchemasPush } from 'tests/schemaDiffer';
import { expect, test } from 'vitest';

// Regression test for https://github.com/drizzle-team/drizzle-orm/issues/6079
//
// Postgres index storage parameters (`.with()`) are stored as text in
// `pg_class.reloptions`, so the introspected snapshot always holds string
// values (`{ fillfactor: "70" }`). When the schema side serialized numeric
// values (`{ fillfactor: 70 }`), the two snapshots never matched and
// `drizzle-kit push` dropped and recreated the index on every run.
test('push: index .with() numeric params should not trigger drop and recreate', async () => {
	const client = new PGlite();

	const schema = {
		users: pgTable(
			'users',
			{
				id: serial('id').primaryKey(),
				name: text('name'),
			},
			(t) => ({
				indx: index('users_with_idx').on(t.name).with({ fillfactor: 70 }),
			}),
		),
	};

	const { statements, sqlStatements } = await diffTestSchemasPush(client, schema, schema, [], false, ['public']);

	expect(sqlStatements).toStrictEqual([]);
	expect(statements).toStrictEqual([]);
});
