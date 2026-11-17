// `$dynamic()` builders passed to helpers constrained by the generic builder types: builders with `returning` fit too
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { CockroachDelete, CockroachInsert, CockroachUpdate } from '~/cockroach-core/index.ts';
import { cockroachTable, int4, text } from '~/cockroach-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { db } from './db.ts';

const users = cockroachTable('dyn_users', { id: int4().primaryKey(), name: text().notNull() });
type User = { id: number; name: string };

const whereDelete = <T extends CockroachDelete>(qb: T) => qb.where(eq(users.id, 1));
const whereUpdate = <T extends CockroachUpdate>(qb: T) => qb.where(eq(users.id, 1));
const conflictInsert = <T extends CockroachInsert>(qb: T) => qb.onConflictDoNothing();

export async function cockroachDynamic() {
	await whereDelete(db.delete(users).$dynamic());
	const del = await whereDelete(db.delete(users).returning().$dynamic());
	Expect<Equal<typeof del, User[]>>;
	const upd = await whereUpdate(db.update(users).set({ name: 'a' }).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof upd, { id: number }[]>>;

	// a dynamic builder keeps its `returning` result
	const insDyn = await db.insert(users).values({ id: 1, name: 'a' }).returning({ id: users.id }).$dynamic();
	Expect<Equal<typeof insDyn, { id: number }[]>>;
	const updDyn = await db.update(users).set({ name: 'a' }).returning().$dynamic().where(eq(users.id, 1));
	Expect<Equal<typeof updDyn, User[]>>;
	const ins = await conflictInsert(db.insert(users).values({ id: 1, name: 'a' }).returning().$dynamic());
	Expect<Equal<typeof ins, User[]>>;
}
