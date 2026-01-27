import type { PgClient } from '@effect/sql-pg/PgClient';
import type { SqlError } from '@effect/sql/SqlError';
import type * as Effect from 'effect/Effect';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectDrizzleQueryError, MigratorInitError } from '~/effect-core/errors.ts';
import { drizzle, type EffectPgDatabase } from '~/effect-postgres/index.ts';
import { migrate } from '~/effect-postgres/migrator.ts';
import { eq } from '~/sql/expressions/index.ts';
import { cities, users } from './tables.ts';

declare const client: PgClient;

const db = drizzle(client);

Expect<Equal<typeof db, EffectPgDatabase<Record<string, never>> & { $client: PgClient }>>;

{
	const selectAll = db.select().from(users);
	type SelectAllEffect = Effect.Effect.AsEffect<typeof selectAll>;

	Expect<Equal<SelectAllEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const selectColumns = db.select({
		id: users.id,
		name: users.text,
	}).from(users);
	type SelectColumnsEffect = Effect.Effect.AsEffect<typeof selectColumns>;

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
	type SelectWithJoinEffect = Effect.Effect.AsEffect<typeof selectWithJoin>;

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
		class: 'A',
		age1: 25,
		enumCol: 'a',
		arrayCol: ['test'],
	});
	type InsertOneEffect = Effect.Effect.AsEffect<typeof insertOne>;

	Expect<Equal<InsertOneEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const insertReturning = db.insert(users).values({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
		arrayCol: ['test'],
	}).returning();
	type InsertReturningEffect = Effect.Effect.AsEffect<typeof insertReturning>;

	Expect<
		Equal<InsertReturningEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>
	>;
}

{
	const insertReturningColumns = db.insert(users).values({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
		arrayCol: ['test'],
	}).returning({ id: users.id, text: users.text });
	type InsertReturningColumnsEffect = Effect.Effect.AsEffect<typeof insertReturningColumns>;

	Expect<
		Equal<
			InsertReturningColumnsEffect,
			Effect.Effect<{ id: number; text: string | null }[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const updateAll = db.update(users).set({ text: 'updated' });
	type UpdateAllEffect = Effect.Effect.AsEffect<typeof updateAll>;

	Expect<Equal<UpdateAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const updateWithReturning = db.update(users)
		.set({ text: 'updated' })
		.where(eq(users.id, 1))
		.returning();
	type UpdateWithReturningEffect = Effect.Effect.AsEffect<typeof updateWithReturning>;

	Expect<
		Equal<
			UpdateWithReturningEffect,
			Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>
		>
	>;
}

{
	const deleteAll = db.delete(users);
	type DeleteAllEffect = Effect.Effect.AsEffect<typeof deleteAll>;

	Expect<Equal<DeleteAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const deleteWithReturning = db.delete(users)
		.where(eq(users.id, 1))
		.returning();
	type DeleteWithReturningEffect = Effect.Effect.AsEffect<typeof deleteWithReturning>;

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
	type CountEffect = Effect.Effect.AsEffect<typeof count>;

	Expect<Equal<CountEffect, Effect.Effect<number, EffectDrizzleQueryError, never>>>;
}

{
	const countFiltered = db.$count(users, eq(users.class, 'A'));
	type CountFilteredEffect = Effect.Effect.AsEffect<typeof countFiltered>;

	Expect<Equal<CountFilteredEffect, Effect.Effect<number, EffectDrizzleQueryError, never>>>;
}

{
	const prepared = db.select().from(users).prepare('get_users');
	const executed = prepared.execute();
	type ExecutedEffect = Effect.Effect.AsEffect<typeof executed>;

	Expect<Equal<ExecutedEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
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
