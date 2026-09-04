import pg from 'pg';
import { expect, test } from 'vitest';
import { drizzle } from '~/node-postgres';
import { integer, pgTable, text } from '~/pg-core';
import { createPgReturningOldNewMapper } from '~/pg-core/query-builders/returning';

const { Client } = pg;
const db = drizzle({ client: new Client() });

const users = pgTable('users', {
	id: integer().primaryKey(),
	name: text().notNull(),
});

test('builds PostgreSQL 18 OLD/NEW returning clauses', () => {
	const insert = db.insert(users).values({ id: 1, name: 'Jane' }).returning({ old: true, new: true }).toSQL();
	const update = db.update(users).set({ name: 'Janet' }).returning({ old: true, new: true }).toSQL();
	const deleted = db.delete(users).returning({ old: true, new: true }).toSQL();

	for (const query of [insert, update, deleted]) {
		expect(query.sql).toContain(
			'returning with (old as "__drizzle_old", new as "__drizzle_new")',
		);
		expect(query.sql).toContain('"__drizzle_old"."id" as "__drizzle_old_0"');
		expect(query.sql).toContain('"__drizzle_new"."id" as "__drizzle_new_0"');
		expect(query.sql).toContain('"__drizzle_old"."tableoid" is not null as "__drizzle_old_present"');
		expect(query.sql).toContain('"__drizzle_new"."tableoid" is not null as "__drizzle_new_present"');
	}

	const oldOnly = db.update(users).set({ name: 'Jane' }).returning({ old: true }).toSQL();
	expect(oldOnly.sql).toContain('returning with (old as "__drizzle_old")');
	expect(oldOnly.sql).not.toContain('new as "__drizzle_new"');
});

test('maps unavailable row versions to null and hides presence fields', () => {
	const mapper = createPgReturningOldNewMapper(
		() => [{
			old: { id: null, name: null },
			new: { id: 1, name: 'Jane' },
			__drizzle_old_present: false,
			__drizzle_new_present: true,
		}],
		{ old: true, new: true },
	);

	expect(mapper([])).toEqual([{
		old: null,
		new: { id: 1, name: 'Jane' },
	}]);
});

test('rejects mixing OLD/NEW rows with a regular projection', () => {
	expect(() =>
		db.update(users).set({ name: 'Jane' }).returning({
			old: true,
			id: users.id,
		} as any)
	).toThrowError(
		'PostgreSQL OLD/NEW returning only supports the `old` and `new` whole-row fields',
	);
});

test('clears OLD/NEW state when a dynamic query replaces the returning selection', () => {
	const query = db.update(users)
		.set({ name: 'Jane' })
		.$dynamic()
		.returning({ old: true })
		.returning({ id: users.id })
		.toSQL();

	expect(query.sql).not.toContain('returning with');
	expect(query.sql).toContain('returning "id"');
});
