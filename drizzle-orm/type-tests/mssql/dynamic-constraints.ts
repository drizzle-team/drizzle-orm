// `$dynamic()` builders passed to helpers constrained by the generic builder types: builders with `output` fit too
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { MsSqlDelete, MsSqlInsert, MsSqlSelect, MsSqlUpdate } from '~/mssql-core/index.ts';
import { int, mssqlTable, text } from '~/mssql-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { db } from './db.ts';

const users = mssqlTable('dyn_users', { id: int().primaryKey(), name: text().notNull(), age: int() });
const pets = mssqlTable('dyn_pets', { id: int().primaryKey(), ownerId: int().notNull() });
type User = { id: number; name: string; age: number | null };

const whereSelect = <T extends MsSqlSelect>(qb: T) => qb.where(eq(users.id, 1));
const outputInsert = <T extends MsSqlInsert>(qb: T) => qb;
const whereUpdate = <T extends MsSqlUpdate>(qb: T) => qb.where(eq(users.id, 1));
const whereDelete = <T extends MsSqlDelete>(qb: T) => qb.where(eq(users.id, 1));

export async function mssqlDynamic() {
	const sel = await whereSelect(db.select().from(users).$dynamic());
	Expect<Equal<typeof sel, User[]>>;
	const joined = await whereSelect(db.select().from(users).leftJoin(pets, eq(users.id, pets.ownerId)).$dynamic());
	Expect<Equal<typeof joined, { dyn_users: User; dyn_pets: { id: number; ownerId: number } | null }[]>>;

	const ins = await outputInsert(db.insert(users).output({ id: users.id }).values({ id: 1, name: 'a' }).$dynamic());
	Expect<Equal<typeof ins, { id: number }[]>>;
	await whereUpdate(db.update(users).set({ name: 'a' }).$dynamic());
	const upd = await whereUpdate(db.update(users).set({ name: 'a' }).output().$dynamic());
	Expect<Equal<typeof upd, User[]>>;
	await whereDelete(db.delete(users).$dynamic());
	const del = await whereDelete(db.delete(users).output({ id: users.id }).$dynamic());
	Expect<Equal<typeof del, { id: number }[]>>;

	// @ts-expect-error -- `where` was already applied
	whereDelete(db.delete(users).where(eq(users.id, 1)));
}
