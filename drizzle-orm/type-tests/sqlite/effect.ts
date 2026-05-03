import type * as Effect from 'effect/Effect';
import type { SqlClient } from 'effect/unstable/sql/SqlClient';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectCache } from '~/cache/core/cache-effect.ts';
import type { EffectDrizzleError, EffectDrizzleQueryError, MigratorInitError } from '~/effect-core/errors.ts';
import type { EffectLogger } from '~/effect-core/logger.ts';
import type { EffectSQLiteDatabase } from '~/effect-sqlite/index.ts';
import { make, makeWithDefaults } from '~/effect-sqlite/index.ts';
import { migrate } from '~/effect-sqlite/migrator.ts';
import type { EmptyRelations } from '~/relations.ts';
import { eq } from '~/sql/expressions/index.ts';
import { sql } from '~/sql/sql.ts';
import { withReplicas } from '~/sqlite-core/effect/index.ts';
import { cities, users } from './tables.ts';

type AsEffect<T> = T extends Effect.Yieldable<infer Self, unknown, unknown, unknown> ? Self : T;

{
	const dbEffect = makeWithDefaults();
	type DbEffect = typeof dbEffect;

	Expect<
		Equal<
			DbEffect,
			Effect.Effect<EffectSQLiteDatabase<EmptyRelations> & { $client: SqlClient }, never, SqlClient>
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
				EffectSQLiteDatabase<EmptyRelations> & { $client: SqlClient },
				never,
				EffectLogger | EffectCache | SqlClient
			>
		>
	>;
}

declare const db: EffectSQLiteDatabase<Record<string, never>>;
declare const replica: EffectSQLiteDatabase<Record<string, never>>;

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
		Equal<SelectColumnsEffect, Effect.Effect<{ id: number; name: string | null }[], EffectDrizzleQueryError, never>>
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
	const cachedSelect = db.select().from(users).$withCache();
	type CachedSelectEffect = AsEffect<typeof cachedSelect>;

	Expect<Equal<CachedSelectEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const dbWithReplicas = withReplicas(db, [replica]);
	const read = dbWithReplicas.select().from(users);
	const write = dbWithReplicas.insert(users).values({
		homeCity: 1,
		serialNotNull: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	});

	type ReplicaReadEffect = AsEffect<typeof read>;
	type ReplicaWriteEffect = AsEffect<typeof write>;

	Expect<Equal<ReplicaReadEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
	Expect<Equal<ReplicaWriteEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
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

	Expect<Equal<InsertOneEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
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

	Expect<Equal<InsertReturningEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
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

	Expect<Equal<UpdateAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const updateWithReturning = db.update(users)
		.set({ name: 'updated' })
		.where(eq(users.id, 1))
		.returning();
	type UpdateWithReturningEffect = AsEffect<typeof updateWithReturning>;

	Expect<
		Equal<UpdateWithReturningEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>
	>;
}

{
	const deleteAll = db.delete(users);
	type DeleteAllEffect = AsEffect<typeof deleteAll>;

	Expect<Equal<DeleteAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const deleteWithReturning = db.delete(users).where(eq(users.id, 1)).returning();
	type DeleteWithReturningEffect = AsEffect<typeof deleteWithReturning>;

	Expect<
		Equal<DeleteWithReturningEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>
	>;
}

{
	const txResult = db.transaction((tx) => tx.select().from(users), { behavior: 'immediate' });
	type TxResultType = typeof txResult;

	Expect<Equal<TxResultType, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError | SqlError, never>>>;
}

{
	const updateJoin = db.update(users).set({ name: 'updated' })
		.from(cities)
		.leftJoin(users, (_users, city) => eq(city.id, 1));
	type UpdateJoinEffect = AsEffect<typeof updateJoin>;

	Expect<Equal<UpdateJoinEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
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
	type ExecutedEffect = AsEffect<typeof executed>;

	Expect<Equal<ExecutedEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const all = db.all<{ id: number }>(sql`select 1 as id`);
	const get = db.get<{ id: number }>(sql`select 1 as id`);
	const values = db.values<[number]>(sql`select 1`);
	const run = db.run(sql`select 1`);

	Expect<Equal<AsEffect<typeof all>, Effect.Effect<{ id: number }[], EffectDrizzleQueryError, never>>>;
	Expect<Equal<AsEffect<typeof get>, Effect.Effect<{ id: number } | undefined, EffectDrizzleQueryError, never>>>;
	Expect<Equal<AsEffect<typeof values>, Effect.Effect<[number][], EffectDrizzleQueryError, never>>>;
	Expect<Equal<AsEffect<typeof run>, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select({ id: users.id }).from(users).where(eq(users.name, sql.placeholder('name'))).prepare();
	const executed = prepared.execute({ name: 'Ada' });

	Expect<Equal<AsEffect<typeof executed>, Effect.Effect<{ id: number }[], EffectDrizzleQueryError, never>>>;
}

{
	const migrateResult = migrate(db, { migrationsFolder: './migrations' });
	type MigrateEffect = typeof migrateResult;

	Expect<
		Equal<
			MigrateEffect,
			Effect.Effect<undefined, EffectDrizzleError | SqlError | EffectDrizzleQueryError | MigratorInitError, never>
		>
	>;
}
