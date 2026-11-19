// `$dynamic()` builders passed to helpers constrained by the generic builder types
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type {
	SingleStoreDelete,
	SingleStoreInsert,
	SingleStoreSelect,
	SingleStoreUpdate,
} from '~/singlestore-core/index.ts';
import { int, serial, singlestoreTable, text } from '~/singlestore-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { db } from './db.ts';

const users = singlestoreTable('dyn_users', { id: serial().primaryKey(), name: text().notNull(), age: int() });
const pets = singlestoreTable('dyn_pets', { id: serial().primaryKey(), ownerId: int().notNull() });
type User = { id: number; name: string; age: number | null };

const whereSelect = <T extends SingleStoreSelect>(qb: T) => qb.where(eq(users.id, 1));
const passInsert = <T extends SingleStoreInsert>(qb: T) => qb;
const whereUpdate = <T extends SingleStoreUpdate>(qb: T) => qb.where(eq(users.id, 1));
const whereDelete = <T extends SingleStoreDelete>(qb: T) => qb.where(eq(users.id, 1));

export async function singlestoreDynamic() {
	const sel = await whereSelect(db.select().from(users).$dynamic());
	Expect<Equal<typeof sel, User[]>>;
	const joined = await whereSelect(db.select().from(users).leftJoin(pets, eq(users.id, pets.ownerId)).$dynamic());
	Expect<Equal<typeof joined, { dyn_users: User; dyn_pets: { id: number; ownerId: number } | null }[]>>;
	await passInsert(db.insert(users).values({ name: 'a' }).$dynamic());
	await whereUpdate(db.update(users).set({ name: 'a' }).limit(1).$dynamic());
	await whereDelete(db.delete(users).orderBy(users.id).$dynamic());

	// @ts-expect-error -- `where` was already applied
	whereDelete(db.delete(users).where(eq(users.id, 1)));
}
