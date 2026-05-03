import { SqliteClient } from '@effect/sql-sqlite-node';
import { assert, expect, it } from '@effect/vitest';
import { defineRelations, eq, placeholder, sql } from 'drizzle-orm';
import { EffectCache, type EffectCacheShape } from 'drizzle-orm/cache/core/cache-effect';
import * as SQLiteDrizzle from 'drizzle-orm/effect-sqlite';
import { migrate } from 'drizzle-orm/effect-sqlite/migrator';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { withReplicas } from 'drizzle-orm/sqlite-core/effect';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import * as Predicate from 'effect/Predicate';
import * as Result from 'effect/Result';
import * as Reactivity from 'effect/unstable/reactivity/Reactivity';
import { SqlClient } from 'effect/unstable/sql/SqlClient';
import { anotherUsersMigratorTable, usersMigratorTable } from './sqlite-common';

const cities = sqliteTable('effect_sqlite_cities', {
	id: integer('id').primaryKey(),
	name: text('name').notNull(),
});

const users = sqliteTable('effect_sqlite_users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	name: text('name').notNull(),
	cityId: integer('city_id').references(() => cities.id),
	verified: integer('verified', { mode: 'boolean' }).notNull().default(false),
});

const posts = sqliteTable('effect_sqlite_posts', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id').notNull().references(() => users.id),
	content: text('content').notNull(),
});

const relations = defineRelations({ cities, users, posts }, (r) => ({
	cities: {
		users: r.many.users(),
	},
	users: {
		city: r.one.cities({
			from: r.users.cityId,
			to: r.cities.id,
		}),
		posts: r.many.posts(),
	},
	posts: {
		author: r.one.users({
			from: r.posts.userId,
			to: r.users.id,
		}),
	},
}));

const dbEffect = SQLiteDrizzle.make({ relations }).pipe(Effect.provide(SQLiteDrizzle.DefaultServices));

class DB extends Context.Service<DB, Effect.Success<typeof dbEffect>>()('EffectSQLiteTestDB') {}

const DBLive = Layer.effect(DB, dbEffect);
const SqliteLive = SqliteClient.layer({ filename: ':memory:', disableWAL: true });
const TestLive = Layer.merge(SqliteLive, DBLive.pipe(Layer.provide(SqliteLive)));
const migrationInitConfig = {
	migrationsFolder: './drizzle2/sqlite',
	init: true,
} satisfies Parameters<typeof migrate>[1] & { init: true };

const makeIsolatedDb = (client: SqliteClient.SqliteClient) =>
	SQLiteDrizzle.make({ relations }).pipe(
		Effect.provide(SQLiteDrizzle.DefaultServices),
		Effect.provideService(SqlClient, client),
	);

const createSchema = (db: Effect.Success<typeof dbEffect>) =>
	Effect.gen(function*() {
		yield* db.run(sql`
		create table ${cities} (
			id integer primary key,
			name text not null
		)
	`);
		yield* db.run(sql`
		create table ${users} (
			id integer primary key autoincrement,
			name text not null,
			city_id integer references ${cities}(${sql.identifier(cities.id.name)}),
			verified integer not null default 0
		)
	`);
		yield* db.run(sql`
		create table ${posts} (
			id integer primary key autoincrement,
			user_id integer not null references ${users}(${sql.identifier(users.id.name)}),
			content text not null
		)
	`);
	});

const resetDb = Effect.gen(function*() {
	const db = yield* DB;

	yield* db.run(sql`drop table if exists ${posts}`);
	yield* db.run(sql`drop table if exists ${users}`);
	yield* db.run(sql`drop table if exists ${cities}`);
	yield* db.run(sql`drop table if exists ${usersMigratorTable}`);
	yield* db.run(sql`drop table if exists ${anotherUsersMigratorTable}`);
	yield* db.run(sql`drop table if exists __drizzle_migrations`);

	yield* createSchema(db);
});

it.layer(TestLive)((it) => {
	const effect: typeof it.effect = Object.assign(
		(name: string, fn: () => Effect.Effect<any, any, any>, timeout?: number) =>
			it.effect(name, () => Effect.andThen(resetDb, fn()), timeout),
		it.effect,
	);

	effect('selects rows through query builders as Effect values', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(cities).values({ id: 1, name: 'Paris' });
			yield* db.insert(users).values({ name: 'Ada', cityId: 1, verified: true });

			const allUsers = yield* db.select().from(users);
			const selected = yield* db.select({ id: users.id, name: users.name }).from(users);
			const cached = yield* db.select({ id: users.id }).from(users).$withCache();
			const first = yield* db.select().from(users).where(eq(users.name, 'Ada')).get();

			expect(allUsers).toStrictEqual([{ id: 1, name: 'Ada', cityId: 1, verified: true }]);
			expect(selected).toStrictEqual([{ id: 1, name: 'Ada' }]);
			expect(cached).toStrictEqual([{ id: 1 }]);
			expect(first).toStrictEqual({ id: 1, name: 'Ada', cityId: 1, verified: true });
		}));

	effect('maps joined rows and nullability', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(cities).values({ id: 1, name: 'Paris' });
			yield* db.insert(users).values([{ name: 'Ada', cityId: 1 }, { name: 'Linus' }]);

			const result = yield* db.select().from(users).leftJoin(cities, eq(users.cityId, cities.id));

			expect(result).toStrictEqual([
				{
					effect_sqlite_users: { id: 1, name: 'Ada', cityId: 1, verified: false },
					effect_sqlite_cities: { id: 1, name: 'Paris' },
				},
				{
					effect_sqlite_users: { id: 2, name: 'Linus', cityId: null, verified: false },
					effect_sqlite_cities: null,
				},
			]);
		}));

	effect('supports insert, update, and delete returning', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const inserted = yield* db.insert(users).values({ name: 'Ada' }).returning({ id: users.id, name: users.name });
			const updated = yield* db.update(users).set({ name: 'Grace' }).where(eq(users.id, inserted[0]!.id)).returning();
			const deleted = yield* db.delete(users).where(eq(users.id, inserted[0]!.id)).returning({ id: users.id });
			const remaining = yield* db.select().from(users);

			expect(inserted).toStrictEqual([{ id: 1, name: 'Ada' }]);
			expect(updated).toStrictEqual([{ id: 1, name: 'Grace', cityId: null, verified: false }]);
			expect(deleted).toStrictEqual([{ id: 1 }]);
			expect(remaining).toStrictEqual([]);
		}));

	effect('supports raw run, all, get, and values', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.run(sql`insert into ${users} (name, verified) values ('Ada', 1)`);

			const all = yield* db.all<{ id: number; name: string }>(sql`select id, name from ${users}`);
			const one = yield* db.get<{ id: number; name: string }>(sql`select id, name from ${users}`);
			const values = yield* db.values<[number, string]>(sql`select id, name from ${users}`);

			expect(all).toStrictEqual([{ id: 1, name: 'Ada' }]);
			expect(one).toStrictEqual({ id: 1, name: 'Ada' });
			expect(values).toStrictEqual([[1, 'Ada']]);
		}));

	effect('supports count and filtered count', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(users).values([
				{ name: 'Ada', verified: true },
				{ name: 'Linus', verified: false },
			]);

			expect(yield* db.$count(users)).toBe(2);
			expect(yield* db.$count(users, eq(users.verified, true))).toBe(1);
		}));

	effect('supports embedded count expressions', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(cities).values([{ id: 1, name: 'Paris' }, { id: 2, name: 'Berlin' }]);
			yield* db.insert(users).values([
				{ name: 'Ada', cityId: 1 },
				{ name: 'Linus', cityId: 1 },
				{ name: 'Grace', cityId: 2 },
			]);

			expect(
				yield* db.select({
					name: cities.name,
					usersCount: db.$count(users, eq(users.cityId, cities.id)),
				}).from(cities).orderBy(cities.id),
			).toStrictEqual([
				{ name: 'Paris', usersCount: 2 },
				{ name: 'Berlin', usersCount: 1 },
			]);
		}));

	effect('supports prepared statements with placeholders', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			const byName = db.select({ id: users.id }).from(users).where(eq(users.name, placeholder('name'))).prepare();

			yield* db.insert(users).values([{ name: 'Ada' }, { name: 'Linus' }]);

			expect(yield* byName.execute({ name: 'Linus' })).toStrictEqual([{ id: 2 }]);
		}));

	effect('supports on conflict clauses', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(users).values({ id: 1, name: 'Ada' });
			yield* db.insert(users).values({ id: 1, name: 'Ignored' }).onConflictDoNothing({ target: users.id });
			yield* db.insert(users).values({ id: 1, name: 'Grace' }).onConflictDoUpdate({
				target: users.id,
				set: { name: 'Grace' },
			});

			expect(yield* db.select({ id: users.id, name: users.name }).from(users)).toStrictEqual([{
				id: 1,
				name: 'Grace',
			}]);
		}));

	effect('supports insert-select, update-from, and ordered deletes', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(cities).values([{ id: 1, name: 'Paris' }, { id: 2, name: 'Berlin' }]);

			const inserted = yield* db.insert(users).select(
				db.select({
					id: sql<number | null>`null`.as('id'),
					name: cities.name,
					cityId: cities.id,
					verified: sql<boolean>`1`.as('verified'),
				}).from(cities).where(eq(cities.name, 'Paris')),
			).returning({ name: users.name, cityId: users.cityId, verified: users.verified });

			const updated = yield* db.update(users)
				.set({ name: 'Ada' })
				.from(cities)
				.where(eq(users.cityId, cities.id))
				.returning({ name: users.name });

			yield* db.insert(users).values([{ name: 'Linus' }, { name: 'Grace' }]);
			const deleted = yield* db.delete(users)
				.where(eq(users.verified, false))
				.orderBy(users.id)
				.limit(1)
				.returning({ name: users.name });

			expect(inserted).toStrictEqual([{ name: 'Paris', cityId: 1, verified: true }]);
			expect(updated).toStrictEqual([{ name: 'Ada' }]);
			expect(deleted).toStrictEqual([{ name: 'Linus' }]);
		}));

	effect('supports CTE select, update, insert, and delete paths', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(cities).values({ id: 1, name: 'Paris' });
			yield* db.insert(users).values([{ name: 'Ada', cityId: 1 }, { name: 'Linus' }]);

			const ada = db.$with('ada').as(
				db.select({ id: users.id }).from(users).where(eq(users.name, 'Ada')),
			);
			const selected = yield* db.with(ada).select({ id: ada.id }).from(ada);
			const updated = yield* db.with(ada).update(users)
				.set({ verified: true })
				.where(eq(users.id, sql`(select * from ${ada})`))
				.returning({ id: users.id, verified: users.verified });

			const paris = db.$with('paris').as(
				db.select({ id: cities.id }).from(cities).where(eq(cities.name, 'Paris')),
			);
			const inserted = yield* db.with(paris).insert(users)
				.values({ name: 'Grace', cityId: sql`(select * from ${paris})` })
				.returning({ name: users.name, cityId: users.cityId });

			const verified = db.$with('verified_users').as(
				db.select({ id: users.id }).from(users).where(eq(users.verified, true)),
			);
			const deleted = yield* db.with(verified).delete(users)
				.where(eq(users.id, sql`(select * from ${verified})`))
				.returning({ id: users.id });

			expect(selected).toStrictEqual([{ id: 1 }]);
			expect(updated).toStrictEqual([{ id: 1, verified: true }]);
			expect(inserted).toStrictEqual([{ name: 'Grace', cityId: 1 }]);
			expect(deleted).toStrictEqual([{ id: 1 }]);
		}));

	effect('commits transactions', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ name: 'Ada' });
					return yield* tx.select().from(users);
				}), { behavior: 'immediate' });

			expect(result).toStrictEqual([{ id: 1, name: 'Ada', cityId: null, verified: false }]);
			expect(yield* db.select().from(users)).toStrictEqual(result);
		}));

	effect('rolls back transactions on rollback errors', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ name: 'Ada' });
					yield* tx.rollback();
				})
			).pipe(Effect.result);

			assert(Result.isFailure(result));
			assert(Predicate.isTagged(result.failure, 'EffectTransactionRollbackError'));
			expect(yield* db.select().from(users)).toStrictEqual([]);
		}));

	effect('rolls back transactions on query errors', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ id: 1, name: 'Ada' });
					yield* tx.insert(users).values({ id: 1, name: 'Duplicate' });
				})
			).pipe(Effect.result);

			assert(Result.isFailure(result));
			assert(Predicate.isTagged(result.failure, 'EffectDrizzleQueryError'));
			expect(yield* db.select().from(users)).toStrictEqual([]);
		}));

	effect('supports nested transaction commit and rollback', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ name: 'Ada' });
					yield* tx.transaction((nested) => nested.insert(users).values({ name: 'Grace' }));
					yield* tx.transaction((nested) =>
						Effect.gen(function*() {
							yield* nested.insert(users).values({ name: 'Rolled back' });
							yield* nested.rollback();
						})
					).pipe(Effect.ignore);

					return yield* tx.select({ name: users.name }).from(users).orderBy(users.id);
				})
			);

			expect(result).toStrictEqual([{ name: 'Ada' }, { name: 'Grace' }]);
			expect(yield* db.select({ name: users.name }).from(users).orderBy(users.id)).toStrictEqual(result);
		}));

	effect('rolls back failed nested transactions without aborting the outer transaction', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ id: 1, name: 'Ada' });
					yield* tx.transaction((nested) =>
						Effect.gen(function*() {
							yield* nested.insert(users).values({ id: 2, name: 'Grace' });
							yield* nested.insert(users).values({ id: 2, name: 'Duplicate' });
						})
					).pipe(Effect.ignore);

					return yield* tx.select({ name: users.name }).from(users).orderBy(users.id);
				}), { behavior: 'immediate' });

			expect(result).toStrictEqual([{ name: 'Ada' }]);
			expect(yield* db.select({ name: users.name }).from(users)).toStrictEqual([{ name: 'Ada' }]);
		}));

	effect('skips select cache population inside transactions', () =>
		Effect.gen(function*() {
			const cacheOperations: string[] = [];
			const customCacheService: EffectCacheShape = {
				strategy: () => 'all',
				get: () =>
					Effect.sync(() => {
						cacheOperations.push('get');
						return void 0;
					}),
				put: () =>
					Effect.sync(() => {
						cacheOperations.push('put');
					}),
				onMutate: () =>
					Effect.sync(() => {
						cacheOperations.push('mutate');
					}),
				cache: {
					strategy: () => 'all',
					get: async () => void 0,
					put: async () => {},
					onMutate: async () => {},
				},
			};
			const db = yield* SQLiteDrizzle.make({ relations }).pipe(
				Effect.provide(Layer.succeed(EffectCache, customCacheService)),
				Effect.provide(SQLiteDrizzle.DefaultServices),
			);

			yield* db.insert(users).values({ name: 'Before' });
			cacheOperations.length = 0;

			const result = yield* db.transaction((tx) =>
				Effect.gen(function*() {
					yield* tx.insert(users).values({ name: 'Inside' });
					yield* tx.select({ name: users.name }).from(users).orderBy(users.id).$withCache();
					yield* tx.rollback();
				})
			).pipe(Effect.result);

			assert(Result.isFailure(result));
			expect(cacheOperations.filter((operation) => operation === 'get' || operation === 'put')).toStrictEqual([]);

			expect(yield* db.select({ name: users.name }).from(users).$withCache()).toStrictEqual([{ name: 'Before' }]);
			expect(cacheOperations).toContain('get');
			expect(cacheOperations).toContain('put');
		}));

	effect('supports relational queries', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(users).values({ id: 1, name: 'Ada' });
			yield* db.insert(posts).values([
				{ userId: 1, content: 'first' },
				{ userId: 1, content: 'second' },
			]);

			const result = yield* db.query.users.findFirst({
				with: { posts: true },
			});

			expect(result).toStrictEqual({
				id: 1,
				name: 'Ada',
				cityId: null,
				verified: false,
				posts: [
					{ id: 1, userId: 1, content: 'first' },
					{ id: 2, userId: 1, content: 'second' },
				],
			});
		}));

	effect('supports prepared relational queries and toSQL', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.insert(users).values([{ id: 1, name: 'Ada' }, { id: 2, name: 'Linus' }]);
			yield* db.insert(posts).values({ userId: 2, content: 'kernel' });

			const query = db.query.users.findFirst({
				where: { name: { eq: sql.placeholder('name') } },
				with: { posts: true },
			});
			const prepared = query.prepare();

			expect(query.toSQL().sql).toContain('select');
			expect(yield* prepared.execute({ name: 'Linus' })).toStrictEqual({
				id: 2,
				name: 'Linus',
				cityId: null,
				verified: false,
				posts: [{ id: 1, userId: 2, content: 'kernel' }],
			});
			expect(yield* db.query.users.findMany({ orderBy: { id: 'asc' } })).toStrictEqual([
				{ id: 1, name: 'Ada', cityId: null, verified: false },
				{ id: 2, name: 'Linus', cityId: null, verified: false },
			]);
		}));

	effect('routes reads and writes with replicas', () =>
		Effect.scoped(Effect.gen(function*() {
			const primary = yield* makeIsolatedDb(
				yield* SqliteClient.make({ filename: ':memory:', disableWAL: true }).pipe(Effect.provide(Reactivity.layer)),
			);
			const replica = yield* makeIsolatedDb(
				yield* SqliteClient.make({ filename: ':memory:', disableWAL: true }).pipe(Effect.provide(Reactivity.layer)),
			);
			const db = withReplicas(primary, [replica], () => replica);

			yield* createSchema(primary);
			yield* createSchema(replica);
			yield* primary.insert(users).values({ name: 'Primary' });
			yield* replica.insert(users).values({ name: 'Replica' });

			expect(yield* db.select({ name: users.name }).from(users)).toStrictEqual([{ name: 'Replica' }]);
			expect(yield* db.$count(users)).toBe(1);
			expect(yield* db.selectDistinct({ name: users.name }).from(users)).toStrictEqual([{ name: 'Replica' }]);
			const replicaUsers = db.$with('replica_users').as(
				db.select({ name: users.name }).from(users),
			);
			expect(yield* db.with(replicaUsers).select({ name: replicaUsers.name }).from(replicaUsers)).toStrictEqual([{
				name: 'Replica',
			}]);
			expect(yield* db.query.users.findMany()).toStrictEqual([{
				id: 1,
				name: 'Replica',
				cityId: null,
				verified: false,
			}]);

			yield* db.insert(users).values({ name: 'Primary write' });
			expect(yield* primary.select({ name: users.name }).from(users).orderBy(users.id)).toStrictEqual([
				{ name: 'Primary' },
				{ name: 'Primary write' },
			]);
		})));

	effect('runs sqlite migrations', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* migrate(db, { migrationsFolder: './drizzle2/sqlite' });
			yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
			yield* db.insert(anotherUsersMigratorTable).values({ name: 'Jane', email: 'email2' });

			expect(yield* db.select().from(usersMigratorTable)).toStrictEqual([{ id: 1, name: 'John', email: 'email' }]);
			expect(yield* db.select().from(anotherUsersMigratorTable)).toStrictEqual([{
				id: 1,
				name: 'Jane',
				email: 'email2',
			}]);
		}));

	effect('initializes sqlite migrations without running SQL', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			const [migration] = readMigrationFiles({ migrationsFolder: './drizzle2/sqlite' });
			assert(migration);

			yield* migrate(db, migrationInitConfig);

			expect(
				yield* db.all<{ hash: string; name: string | null }>(
					sql`select hash, name from __drizzle_migrations`,
				),
			).toStrictEqual([{ hash: migration.hash, name: migration.name }]);
			expect(
				yield* db.all<{ name: string }>(sql`select name from sqlite_master where type = 'table' and name = 'users12'`),
			).toStrictEqual([]);
		}));

	effect('fails migration init when database already has migrations', () =>
		Effect.gen(function*() {
			const db = yield* DB;

			yield* db.run(sql`
				create table __drizzle_migrations (
					id integer primary key,
					hash text not null,
					created_at numeric,
					name text,
					applied_at text
				)
			`);
			yield* db.run(sql`insert into __drizzle_migrations (hash, created_at) values ('hash', 1)`);

			const result = yield* migrate(db, migrationInitConfig).pipe(Effect.result);

			assert(Result.isFailure(result));
			assert(Predicate.isTagged(result.failure, 'MigratorInitError'));
			expect(result.failure.exitCode).toBe('databaseMigrations');
		}));

	effect('upgrades legacy sqlite migration tables', () =>
		Effect.gen(function*() {
			const db = yield* DB;
			const [migration] = readMigrationFiles({ migrationsFolder: './drizzle2/sqlite' });
			assert(migration);

			yield* db.run(sql`
				create table __drizzle_migrations (
					id integer primary key,
					hash text not null,
					created_at numeric
				)
			`);
			yield* db.run(
				sql`insert into __drizzle_migrations (id, hash, created_at) values (1, ${migration.hash}, ${migration.folderMillis})`,
			);

			yield* migrate(db, { migrationsFolder: './drizzle2/sqlite' });

			expect(
				yield* db.all<{ name: string | null; applied_at: string | null }>(
					sql`select name, applied_at from __drizzle_migrations`,
				),
			).toStrictEqual([{ name: migration.name, applied_at: null }]);
		}));
});
