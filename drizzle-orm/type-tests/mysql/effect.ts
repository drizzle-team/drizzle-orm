import type { MysqlClient } from '@effect/sql-mysql2/MysqlClient';
import * as Effect from 'effect/Effect';
import type { SqlError } from 'effect/unstable/sql/SqlError';
import type { Equal } from 'type-tests/utils.ts';
import { Expect } from 'type-tests/utils.ts';
import type { EffectDrizzleQueryError, MigratorInitError } from '~/effect-core/errors.ts';
import { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import type { EffectMysql2Database } from '~/effect-mysql2/index.ts';
import { make, makeWithDefaults } from '~/effect-mysql2/index.ts';
import { migrate } from '~/effect-mysql2/migrator.ts';
import { MySqlEffectDatabase } from '~/mysql-core/effect/db.ts';
import { MySqlQueryResultHKT } from '~/mysql-core/session.ts';
import type { EmptyRelations } from '~/relations.ts';
import { eq } from '~/sql/expressions/index.ts';
import { cities, users } from './tables.ts';

type AsEffect<T> = T extends Effect.Effect<infer A, infer E, infer R> ? Effect.Effect<A, E, R> : T;

{
	const dbEffect = makeWithDefaults();
	type DbEffect = typeof dbEffect;

	Expect<
		Equal<
			DbEffect,
			Effect.Effect<EffectMysql2Database<EmptyRelations> & { $client: MysqlClient }, never, MysqlClient>
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
				EffectMysql2Database<EmptyRelations> & { $client: MysqlClient },
				never,
				| import('~/effect-core/logger.ts').EffectLogger
				| import('~/cache/core/cache-effect.ts').EffectCache
				| MysqlClient
			>
		>
	>;
}

declare const db: EffectMysql2Database<Record<string, never>>;

{
	const selectAll = db.select().from(users);
	type SelectAllEffect = AsEffect<typeof selectAll>;

	Expect<Equal<SelectAllEffect, Effect.Effect<(typeof users.$inferSelect)[], EffectDrizzleQueryError, never>>>;
}

{
	const selectColumns = db.select({
		id: users.id,
		name: users.text,
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
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).$returningId();

	type InsertReturningEffect = AsEffect<typeof insertReturning>;

	Expect<
		Equal<
			InsertReturningEffect,
			Effect.Effect<
				{
					id: number;
					serialNullable: number;
					serialNotNull: number;
				}[],
				EffectDrizzleQueryError,
				never
			>
		>
	>;
}

{
	const insertReturningColumns = db.insert(users).values({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).$returningId();
	type InsertReturningColumnsEffect = AsEffect<typeof insertReturningColumns>;

	Expect<
		Equal<
			InsertReturningColumnsEffect,
			Effect.Effect<
				{
					id: number;
					serialNullable: number;
					serialNotNull: number;
				}[],
				EffectDrizzleQueryError,
				never
			>
		>
	>;
}

{
	const updateAll = db.update(users).set({ text: 'updated' });
	type UpdateAllEffect = AsEffect<typeof updateAll>;

	Expect<Equal<UpdateAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
}

{
	const deleteAll = db.delete(users);
	type DeleteAllEffect = AsEffect<typeof deleteAll>;

	Expect<Equal<DeleteAllEffect, Effect.Effect<readonly never[], EffectDrizzleQueryError, never>>>;
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
	type ExecutedEffect = AsEffect<typeof executed>;

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

{
	type RawExecuteType = { $brand: 'EXECUTED' };
	const db = {} as MySqlEffectDatabase<
		QueryEffectHKTBase & {
			readonly error: EffectDrizzleQueryError;
			readonly context: never;
		},
		MySqlQueryResultHKT & {
			type: RawExecuteType;
		},
		EmptyRelations
	>;

	const p1 = db.insert(users).values({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).prepare()
		.execute();
	const p2 = db.update(users).set({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).prepare()
		.execute();
	const p3 = db.delete(users).prepare()
		.execute();

	const r1 = db.insert(users).values({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).execute();
	const r2 = db.update(users).set({
		homeCity: 1,
		class: 'A',
		age1: 25,
		enumCol: 'a',
	}).execute();
	const r3 = db.delete(users).execute();

	const d1 = Effect.suspend(() =>
		db.insert(users).values({
			homeCity: 1,
			class: 'A',
			age1: 25,
			enumCol: 'a',
		})
	);
	const d2 = Effect.suspend(() =>
		db.update(users).set({
			homeCity: 1,
			class: 'A',
			age1: 25,
			enumCol: 'a',
		})
	);
	const d3 = Effect.suspend(() => db.delete(users));
	const d4 = Effect.suspend(() => db.execute(`somequery`));

	type Expected = Effect.Effect<RawExecuteType, EffectDrizzleQueryError, never>;

	Expect<Equal<typeof p1, Expected>>;
	Expect<Equal<typeof p2, Expected>>;
	Expect<Equal<typeof p3, Expected>>;

	Expect<Equal<typeof r1, Expected>>;
	Expect<Equal<typeof r2, Expected>>;
	Expect<Equal<typeof r3, Expected>>;

	Expect<Equal<typeof d1, Expected>>;
	Expect<Equal<typeof d2, Expected>>;
	Expect<Equal<typeof d3, Expected>>;
	Expect<Equal<typeof d4, Expected>>;
}
