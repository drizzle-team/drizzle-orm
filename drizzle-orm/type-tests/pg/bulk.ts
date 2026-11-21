import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable, serial, text, timestamp } from '~/pg-core/index.ts';
import { drizzle, PostgresBulkResult } from '~/postgres/index.ts';
import { sql } from '~/sql/sql.ts';

const db = drizzle.mock();

const items = pgTable('items', {
	id: serial().primaryKey(),
	orgId: integer().notNull(),
	name: text().notNull(),
	note: text(),
	updatedAt: timestamp().$onUpdate(() => new Date()),
});
const other = pgTable('other', { id: serial().primaryKey() });

{
	const res = await db.bulkInsert(items, [{ orgId: 1, name: 'a' }, { id: 5, orgId: 1, name: 'b', note: null }], {
		chunk: 100,
		atomic: false,
	});
	Expect<Equal<PostgresBulkResult, typeof res>>;

	// @ts-expect-error - missing required column
	await db.bulkInsert(items, [{ orgId: 1 }]);
	// @ts-expect-error - SQL values are not accepted
	await db.bulkInsert(items, [{ orgId: 1, name: sql`'a'` }]);
	// @ts-expect-error - not an option of bulkInsert
	await db.bulkInsert(items, [{ orgId: 1, name: 'a' }], { returning: '*' });
}

{
	const res = await db.bulkUpdate(items, [{ id: 1, name: 'a' }, { id: 2, name: 'b' }], { by: items.id });
	Expect<Equal<PostgresBulkResult, typeof res>>;

	await db.bulkUpdate(items, [{ id: 1, orgId: 2, note: null }], { by: [items.id, items.orgId] });

	// @ts-expect-error - missing key column
	await db.bulkUpdate(items, [{ name: 'a' }], { by: items.id });
	// @ts-expect-error - missing second key column
	await db.bulkUpdate(items, [{ id: 1, name: 'a' }], { by: [items.id, items.orgId] });
	// @ts-expect-error - key column of another table
	await db.bulkUpdate(items, [{ id: 1, name: 'a' }], { by: other.id });
	// @ts-expect-error - SQL values are not accepted
	await db.bulkUpdate(items, [{ id: 1, name: sql`'a'` }], { by: items.id });

	await db.transaction(async (tx) => {
		await tx.bulkInsert(items, [{ orgId: 1, name: 'a' }]);
		await tx.bulkUpdate(items, [{ id: 1, name: 'a' }], { by: items.id });
	});
}
