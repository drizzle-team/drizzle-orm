/**
 * Type cost of query chains on the async Postgres database. real-effect.bench.ts runs the same chains on the Effect
 * database. The two databases share their builders' implementation, and these counts guard what that costs the
 * type checker: a change that makes either database's types more expensive fails here.
 * Run with: tsx benches/unified-pg/real-async.bench.ts
 */
import { bench } from '@ark/attest';
import { eq } from 'drizzle-orm';
import type { PgAsyncDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { posts, users } from '../../lib/unified-pg-schema.ts';

declare const db: PgAsyncDatabase<PgQueryResultHKT>;
const use = <T>(query: PromiseLike<T>): T => query as never;

bench('select all columns', () => {
	return use(db.select().from(users));
}).types([2457, 'instantiations']);

bench('select fields, join, where, limit', () => {
	return use(
		db.select({ id: users.id, title: posts.title }).from(users).leftJoin(posts, eq(posts.authorId, users.id))
			.where(eq(users.id, 1)).limit(10),
	);
}).types([4515, 'instantiations']);

bench('insert returning', () => {
	return use(db.insert(users).values({ name: 'a' }).returning());
}).types([3318, 'instantiations']);

bench('update set, where, returning', () => {
	return use(db.update(users).set({ name: 'b' }).where(eq(users.id, 1)).returning({ id: users.id }));
}).types([10828, 'instantiations']);

bench('delete where returning', () => {
	return use(db.delete(users).where(eq(users.id, 1)).returning());
}).types([2135, 'instantiations']);
