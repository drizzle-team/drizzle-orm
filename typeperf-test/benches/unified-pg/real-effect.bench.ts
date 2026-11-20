/**
 * Type cost of query chains on the Effect Postgres database. real-async.bench.ts runs the same chains on the async
 * database. The two databases share their builders' implementation, and these counts guard what that costs the
 * type checker: a change that makes either database's types more expensive fails here.
 * Run with: tsx benches/unified-pg/real-effect.bench.ts
 */
import { bench } from '@ark/attest';
import { eq } from 'drizzle-orm';
import type { QueryEffectHKTBase } from 'drizzle-orm/effect-core';
import type { PgQueryResultHKT } from 'drizzle-orm/pg-core';
import type { PgEffectDatabase } from 'drizzle-orm/pg-core/effect';
import { posts, users } from '../../lib/unified-pg-schema.ts';

declare const db: PgEffectDatabase<QueryEffectHKTBase, PgQueryResultHKT>;
// What running the query gives: the success value of the Effect
const use = <A>(query: { [Symbol.iterator](): Iterator<unknown, A, any> }): A => query as never;

bench('select all columns', () => {
	return use(db.select().from(users));
}).types([2122, 'instantiations']);

bench('select fields, join, where, limit', () => {
	return use(
		db.select({ id: users.id, title: posts.title }).from(users).leftJoin(posts, eq(posts.authorId, users.id))
			.where(eq(users.id, 1)).limit(10),
	);
}).types([4233, 'instantiations']);

bench('insert returning', () => {
	return use(db.insert(users).values({ name: 'a' }).returning());
}).types([3088, 'instantiations']);

bench('update set, where, returning', () => {
	return use(db.update(users).set({ name: 'b' }).where(eq(users.id, 1)).returning({ id: users.id }));
}).types([10994, 'instantiations']);

bench('delete where returning', () => {
	return use(db.delete(users).where(eq(users.id, 1)).returning());
}).types([1989, 'instantiations']);
