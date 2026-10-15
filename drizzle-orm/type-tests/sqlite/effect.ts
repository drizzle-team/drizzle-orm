import type { SqliteClient } from '@effect/sql-sqlite-node/SqliteClient';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectDrizzleQueryError, MigratorInitError } from '~/effect-core/errors.ts';
import { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import type { EffectSQLiteNodeDatabase } from '~/effect-sqlite-node/index.ts';
import { make, makeWithDefaults } from '~/effect-sqlite-node/index.ts';
import { migrate } from '~/effect-sqlite-node/migrator.ts';
import type { EmptyRelations } from '~/relations.ts';
import { eq } from '~/sql/expressions/index.ts';
import { SQLiteEffectDatabase } from '~/sqlite-core/effect/db.ts';
import { cities, users } from './tables.ts';

type AsEffect<T> = T extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, R> : T;

{
	const dbEffect = makeWithDefaults();
	type DbEffect = typeof dbEffect;

	Expect<
		Equal<
			DbEffect,
			Effect.Effect<EffectSQLiteNodeDatabase<EmptyRelations> & { $client: SqliteClient }, never, SqliteClient>
		>
	>;
}

{
	const dbEffect = make();
	type DbEffect = typeof dbEffect;

	Expect<
		Equal<
			DbEffect,
			Effect.Effect<
				EffectSQLiteNodeDatabase<EmptyRelations> & { $client: SqliteClient },
				never,
				| import('~/effect-core/logger.ts').EffectLogger
				| import('~/cache/core/cache-effect.ts').EffectCache
				| SqliteClient
			>
		>
	>;
}

declare const db: EffectSQLiteNodeDatabase<Record<string, never>>;

{
	const selectAll = db.select().from(users);
	type SelectAllEffect = AsEffect<typeof selectAll>;

	Expect<Equal<SelectAllEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const selectColumns = db.select({
		id: users.id,
		name: users.name,
	}).from(users);
	type SelectColumnsEffect = AsEffect<typeof selectColumns>;

	Expect<
		Equal<
			SelectColumnsEffect,
			Effect.Effect<{ id: number; name: string | null }[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const selectWithJoin = db
		.select()
		.from(users)
		.leftJoin(cities, eq(users.homeCity, cities.id));
	type SelectWithJoinEffect = AsEffect<typeof selectWithJoin>;

	Expect<
		Equal<
			SelectWithJoinEffect,
			Effect.Effect<
				{
					users_table: typeof users.$inferSelect;
					cities_table: typeof cities.$inferSelect | null;
				}[],
				EffectDrizzleQueryError,
				never
			>
		>
	>;
}

{
	const insertOne = db.insert(users).values({
		homeCity: 1,
		serialNotNull: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	});
	type InsertOneEffect = AsEffect<typeof insertOne>;

	Expect<Equal<InsertOneEffect, Effect.Effect<unknown, EffectDrizzleQueryError, never>>>;
}

{
	const insertReturning = db.insert(users).values({
		homeCity: 1,
		serialNotNull: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).returning();
	type InsertReturningEffect = AsEffect<typeof insertReturning>;

	Expect<
		Equal<InsertReturningEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>
	>;
}

{
	const insertReturningColumns = db.insert(users).values({
		homeCity: 1,
		serialNotNull: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).returning({ id: users.id, name: users.name });
	type InsertReturningColumnsEffect = AsEffect<typeof insertReturningColumns>;

	Expect<
		Equal<
			InsertReturningColumnsEffect,
			Effect.Effect<{ id: number; name: string | null }[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const updateAll = db.update(users).set({ name: 'updated' });
	type UpdateAllEffect = AsEffect<typeof updateAll>;

	Expect<Equal<UpdateAllEffect, Effect.Effect<unknown, EffectDrizzleQueryError, never>>>;
}

{
	const updateWithReturning = db.update(users)
		.set({ name: 'updated' })
		.where(eq(users.id, 1))
		.returning();
	type UpdateWithReturningEffect = AsEffect<typeof updateWithReturning>;

	Expect<
		Equal<
			UpdateWithReturningEffect,
			Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const deleteAll = db.delete(users);
	type DeleteAllEffect = AsEffect<typeof deleteAll>;

	Expect<Equal<DeleteAllEffect, Effect.Effect<unknown, EffectDrizzleQueryError, never>>>;
}

{
	const deleteWithReturning = db.delete(users)
		.where(eq(users.id, 1))
		.returning();
	type DeleteWithReturningEffect = AsEffect<typeof deleteWithReturning>;

	Expect<
		Equal<
			DeleteWithReturningEffect,
			Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const txResult = db.transaction((tx) => tx.select().from(users));
	type TxResultType = typeof txResult;

	Expect<
		Equal<TxResultType, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError | SqlError, never>>
	>;
}

{
	const count = db.$count(users);
	type CountEffect = AsEffect<typeof count>;

	Expect<Equal<CountEffect, Effect.Effect<number, EffectDrizzleQueryError, never>>>;
}

{
	const countFiltered = db.$count(users, eq(users.class, 'A'));
	type CountFilteredEffect = AsEffect<typeof countFiltered>;

	Expect<Equal<CountFilteredEffect, Effect.Effect<number, EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare();
	const executed = prepared.execute();
	type ExecutedEffect = typeof executed;

	Expect<Equal<ExecutedEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare();
	const executed = prepared.all();
	type ExecutedEffect = typeof executed;

	Expect<Equal<ExecutedEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare();
	const executed = prepared.get();
	type ExecutedEffect = typeof executed;

	Expect<Equal<ExecutedEffect, Effect.Effect<(typeof users.$inferSelect) | undefined, EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare();
	const executed = prepared.values();
	type ExecutedEffect = typeof executed;

	Expect<Equal<ExecutedEffect, Effect.Effect<any[][], EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare();
	const executed = prepared.run();
	type ExecutedEffect = typeof executed;

	Expect<Equal<ExecutedEffect, Effect.Effect<unknown, EffectDrizzleQueryError, never>>>;
}

{
	const migrateResult = migrate(db, { migrationsFolder: './migrations' });
	type MigrateEffect = typeof migrateResult;

	Expect<
		Equal<
			MigrateEffect,
			Effect.Effect<undefined, SqlError | EffectDrizzleQueryError | MigratorInitError, never>
		>
	>;
}

{
	type RunResult = { $brand: 'RUN' };
	const db = {} as SQLiteEffectDatabase<
		QueryEffectHKTBase & {
			readonly error: EffectDrizzleQueryError;
			readonly context: never;
		},
		RunResult,
		EmptyRelations
	>;

	const p1 = db.select().from(users).prepare().run();
	const p2 = db.selectDistinct().from(users).prepare().run();
	const p3 = db.with(db.$with('sq').as((qb) => qb.select().from(users))).select().from(users).prepare().run();
	const p4 = db.selectDistinct().from(users).prepare().run();
	const p5 = db.insert(users).values({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).prepare()
		.run();
	const p6 = db.insert(users).values({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).returning()
		.prepare()
		.run();
	const p7 = db.update(users).set({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).prepare()
		.run();
	const p8 = db.update(users).set({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).returning()
		.prepare()
		.run();
	const p9 = db.delete(users).prepare()
		.run();
	const p10 = db.delete(users).returning()
		.prepare()
		.run();

	const r1 = db.select().from(users).run();
	const r2 = db.selectDistinct().from(users).run();
	const r3 = db.with(db.$with('sq').as((qb) => qb.select().from(users))).select().from(users).run();
	const r4 = db.selectDistinct().from(users).run();
	const r5 = db.insert(users).values({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).run();
	const r6 = db.insert(users).values({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).returning()
		.run();
	const r7 = db.update(users).set({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).run();
	const r8 = db.update(users).set({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' }).returning()
		.run();
	const r9 = db.delete(users).run();
	const r10 = db.delete(users).returning().run();

	const d1 = Effect.suspend(() =>
		db.insert(users).values({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' })
	);
	const d2 = Effect.suspend(() =>
		db.update(users).set({ homeCity: 1, serialNotNull: 1, class: 'A', age1: 25, enumCol: 'a' })
	);
	const d3 = Effect.suspend(() => db.delete(users));
	const d4 = Effect.suspend(() => db.run(`somequery`));

	type Expected = Effect.Effect<RunResult, EffectDrizzleQueryError, never>;

	Expect<Equal<typeof p1, Expected>>;
	Expect<Equal<typeof p2, Expected>>;
	Expect<Equal<typeof p3, Expected>>;
	Expect<Equal<typeof p4, Expected>>;
	Expect<Equal<typeof p5, Expected>>;
	Expect<Equal<typeof p6, Expected>>;
	Expect<Equal<typeof p7, Expected>>;
	Expect<Equal<typeof p8, Expected>>;
	Expect<Equal<typeof p9, Expected>>;
	Expect<Equal<typeof p10, Expected>>;

	Expect<Equal<typeof r1, Expected>>;
	Expect<Equal<typeof r2, Expected>>;
	Expect<Equal<typeof r3, Expected>>;
	Expect<Equal<typeof r4, Expected>>;
	Expect<Equal<typeof r5, Expected>>;
	Expect<Equal<typeof r6, Expected>>;
	Expect<Equal<typeof r7, Expected>>;
	Expect<Equal<typeof r8, Expected>>;
	Expect<Equal<typeof r9, Expected>>;
	Expect<Equal<typeof r10, Expected>>;

	Expect<Equal<typeof d1, Expected>>;
	Expect<Equal<typeof d2, Expected>>;
	Expect<Equal<typeof d3, Expected>>;
	Expect<Equal<typeof d4, Expected>>;
}
