import { describe, test } from 'vitest';
import { getTableMetadata } from '~/metadata.ts';
import { integer, pgEnum, pgTable, serial, text, timestamp } from '~/pg-core/index.ts';
import { int, mysqlTable, varchar } from '~/mysql-core/index.ts';
import { sqliteTable, text as sqliteText } from '~/sqlite-core/index.ts';

/**
 * Core guarantee of the metadata API: output must be JSON-serializable.
 *
 * Why: PR 2 emits this metadata as a .ts file at build time so that PR 3's
 * `createInsertSchemaFromMeta` can run client-side without pulling any drizzle
 * runtime into the bundle. If anything non-serializable (SQL fragments,
 * functions, Symbol-keyed values, Column instances, ...) leaks through here,
 * the whole bundle-bloat fix collapses.
 */
describe.concurrent('getTableMetadata: output is JSON-serializable', () => {
	test('pg table with array, enum, defaults, generated identity', ({ expect }) => {
		const role = pgEnum('role', ['admin', 'user']);
		const t = pgTable('users', {
			id: serial('id').primaryKey(),
			email: text('email').notNull().unique(),
			role: role('role').notNull().default('user'),
			tags: text('tags').array(),
			createdAt: timestamp('created_at').defaultNow(),
			counter: integer('counter').generatedAlwaysAsIdentity(),
		});

		const meta = getTableMetadata(t);
		const roundtripped = JSON.parse(JSON.stringify(meta));

		expect(roundtripped).toEqual(meta);
	});

	test('mysql table', ({ expect }) => {
		const t = mysqlTable('items', {
			id: int('id').primaryKey().autoincrement(),
			code: varchar('code', { length: 20 }),
		});

		const meta = getTableMetadata(t);
		expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
	});

	test('sqlite table', ({ expect }) => {
		const t = sqliteTable('rows', {
			name: sqliteText('name').notNull(),
		});

		const meta = getTableMetadata(t);
		expect(JSON.parse(JSON.stringify(meta))).toEqual(meta);
	});
});
