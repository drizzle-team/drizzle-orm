import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable, text } from '~/pg-core/index.ts';
import type { PgReturningOldNewConfig } from '~/pg-core/query-builders/returning.ts';
import { db } from './db.ts';

const users = pgTable('returning_old_new_types', {
	id: integer().primaryKey(),
	name: text().notNull(),
});
type Row = typeof users.$inferSelect;
type ConfiguredResult<TOld, TNew> = { old: TOld; new?: TNew } | { old?: TOld; new: TNew };

function insertConfigured(config: PgReturningOldNewConfig) {
	return db.insert(users).values({ id: 1, name: 'Jane' }).returning(config);
}
function updateConfigured(config: PgReturningOldNewConfig) {
	return db.update(users).set({ name: 'Jane' }).returning(config);
}
function deleteConfigured(config: PgReturningOldNewConfig) {
	return db.delete(users).returning(config);
}

const inserted = await insertConfigured({ old: true });
Expect<Equal<ConfiguredResult<Row | null, Row>, typeof inserted[number]>>;
const updated = await updateConfigured({ old: true });
Expect<Equal<ConfiguredResult<Row, Row>, typeof updated[number]>>;
const deleted = await deleteConfigured({ old: true });
Expect<Equal<ConfiguredResult<Row, Row | null>, typeof deleted[number]>>;

// @ts-expect-error The broad configuration does not guarantee a NEW row was requested.
updated[0]!.new.id;
// @ts-expect-error The broad configuration does not guarantee an OLD row was requested.
updated[0]!.old.id;

const insertedOld = await db.insert(users).values({ id: 1, name: 'Jane' }).returning({ old: true, new: undefined });
Expect<Equal<{ old: Row | null }[], typeof insertedOld>>;
const insertedNew = await db.insert(users).values({ id: 1, name: 'Jane' }).returning({ old: undefined, new: true });
Expect<Equal<{ new: Row }[], typeof insertedNew>>;

const updatedOld = await db.update(users).set({ name: 'Jane' }).returning({ old: true, new: undefined });
Expect<Equal<{ old: Row }[], typeof updatedOld>>;
const updatedNew = await db.update(users).set({ name: 'Jane' }).returning({ old: undefined, new: true });
Expect<Equal<{ new: Row }[], typeof updatedNew>>;

const deletedOld = await db.delete(users).returning({ old: true, new: undefined });
Expect<Equal<{ old: Row }[], typeof deletedOld>>;
const deletedNew = await db.delete(users).returning({ old: undefined, new: true });
Expect<Equal<{ new: Row | null }[], typeof deletedNew>>;
