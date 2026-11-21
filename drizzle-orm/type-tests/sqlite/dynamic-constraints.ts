// `$dynamic()` builders passed to helpers constrained by the generic builder types: builders with `returning` fit too
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import { eq } from '~/sql/expressions/index.ts';
import type { SQLiteAsyncDelete, SQLiteDelete, SQLiteUpdate } from '~/sqlite-core/index.ts';
import { integer, sqliteTable, text } from '~/sqlite-core/index.ts';
import { bunDb, db } from './db.ts';

const users = sqliteTable('dyn_users', { id: integer().primaryKey(), name: text().notNull() });
type User = { id: number; name: string };

const whereDelete = <T extends SQLiteDelete>(qb: T) => qb.where(eq(users.id, 1));
const whereAsyncDelete = <T extends SQLiteAsyncDelete>(qb: T) => qb.where(eq(users.id, 1));
const whereUpdate = <T extends SQLiteUpdate>(qb: T) => qb.where(eq(users.id, 1));

export async function syncSqlite() {
	await whereDelete(db.delete(users).$dynamic());
	const del = await whereDelete(db.delete(users).returning().$dynamic());
	Expect<Equal<typeof del, User[]>>;
	const delPartial = await whereDelete(db.delete(users).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof delPartial, { id: number }[]>>;
	const upd = await whereUpdate(db.update(users).set({ name: 'a' }).returning().$dynamic());
	Expect<Equal<typeof upd, User[]>>;
}

export async function asyncSqlite() {
	const delAsync = await whereAsyncDelete(bunDb.delete(users).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof delAsync, { id: number }[]>>;
}
