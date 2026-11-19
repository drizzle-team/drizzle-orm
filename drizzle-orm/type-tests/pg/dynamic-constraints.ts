// `$dynamic()` builders passed to helpers constrained by the generic builder types: every builder the query API can
// produce must fit its generic type, whatever was applied before `$dynamic()` (`returning`, `from`, joins)
import * as Effect from 'effect/Effect';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectPgDatabase } from '~/effect-postgres/index.ts';
import type { PgEffectDelete, PgEffectUpdate } from '~/pg-core/effect/index.ts';
import type {
	PgAsyncDelete,
	PgAsyncInsert,
	PgAsyncSelect,
	PgAsyncUpdate,
	PgDelete,
	PgInsert,
	PgSelect,
	PgUpdate,
} from '~/pg-core/index.ts';
import { integer, pgTable, serial, text } from '~/pg-core/index.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { db } from './db.ts';

const users = pgTable('dyn_users', { id: serial().primaryKey(), name: text().notNull(), age: integer() });
const tags = pgTable('dyn_tags', { id: serial().primaryKey(), petId: integer() });
const pets = pgTable('dyn_pets', { id: serial().primaryKey(), ownerId: integer().notNull(), name: text() });
type User = { id: number; name: string; age: number | null };
type Pet = { id: number; ownerId: number; name: string | null };

const whereSelect = <T extends PgSelect>(qb: T) => qb.where(eq(users.id, 1));
const whereAsyncSelect = <T extends PgAsyncSelect>(qb: T) => qb.where(eq(users.id, 1));
const conflictInsert = <T extends PgInsert>(qb: T) => qb.onConflictDoNothing();
const conflictAsyncInsert = <T extends PgAsyncInsert>(qb: T) => qb.onConflictDoNothing();
const whereUpdate = <T extends PgUpdate>(qb: T) => qb.where(eq(users.id, 1));
const whereAsyncUpdate = <T extends PgAsyncUpdate>(qb: T) => qb.where(eq(users.id, 1));
const whereDelete = <T extends PgDelete>(qb: T) => qb.where(eq(users.id, 1));
const whereAsyncDelete = <T extends PgAsyncDelete>(qb: T) => qb.where(eq(users.id, 1));

export async function asyncDynamic() {
	// select
	const sel1 = await whereSelect(db.select().from(users).$dynamic());
	Expect<Equal<typeof sel1, User[]>>;
	const sel = await whereAsyncSelect(db.select().from(users).leftJoin(pets, eq(users.id, pets.ownerId)).$dynamic());
	Expect<Equal<typeof sel, { dyn_users: User; dyn_pets: Pet | null }[]>>;

	// insert: with and without `returning`
	const ins = await conflictInsert(db.insert(users).values({ name: 'a' }).returning().$dynamic());
	Expect<Equal<typeof ins, User[]>>;
	const insAsync = await conflictAsyncInsert(
		db.insert(users).values({ name: 'a' }).returning({ id: users.id }).$dynamic(),
	);
	Expect<Equal<typeof insAsync, { id: number }[]>>;

	// update: plain, with `returning`, with `from`, with joins
	await whereUpdate(db.update(users).set({ name: 'a' }).$dynamic());
	const upd = await whereUpdate(db.update(users).set({ name: 'a' }).returning().$dynamic());
	Expect<Equal<typeof upd, User[]>>;
	const updPartial = await whereAsyncUpdate(db.update(users).set({ name: 'a' }).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof updPartial, { id: number }[]>>;
	const updFrom = await whereUpdate(
		db.update(users).set({ name: 'a' }).from(pets).returning({ id: users.id, pet: pets.name }).$dynamic(),
	);
	Expect<Equal<typeof updFrom, { id: number; pet: string | null }[]>>;
	const updJoin = await whereAsyncUpdate(
		db.update(users).set({ name: 'a' }).from(pets).leftJoin(tags, eq(tags.petId, pets.id)).returning({
			id: users.id,
			tag: tags.id,
		})
			.$dynamic(),
	);
	Expect<Equal<typeof updJoin, { id: number; tag: number | null }[]>>;

	// delete: plain, with `returning`
	await whereDelete(db.delete(users).$dynamic());
	const del = await whereDelete(db.delete(users).returning().$dynamic());
	Expect<Equal<typeof del, User[]>>;
	const delPartial = await whereAsyncDelete(db.delete(users).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof delPartial, { id: number }[]>>;

	// non-dynamic builders still exclude repeated clauses
	// @ts-expect-error -- `where` was already applied
	whereUpdate(db.update(users).set({ name: 'a' }).where(eq(users.id, 1)));
}

declare const edb: EffectPgDatabase;
const whereEffectUpdate = <T extends PgEffectUpdate>(qb: T) => qb.where(eq(users.id, 1));
const whereEffectDelete = <T extends PgEffectDelete>(qb: T) => qb.where(eq(users.id, 1));

export const effectDynamic = Effect.gen(function*() {
	const upd = yield* whereEffectUpdate(edb.update(users).set({ name: 'a' }).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof upd, { id: number }[]>>;
	const del = yield* whereEffectDelete(edb.delete(users).returning().$dynamic());
	Expect<Equal<typeof del, User[]>>;
	// the common generic types take Effect builders too
	const delCommon = yield* whereDelete(edb.delete(users).returning({ id: users.id }).$dynamic());
	Expect<Equal<typeof delCommon, { id: number }[]>>;
});
