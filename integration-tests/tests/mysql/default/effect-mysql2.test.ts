import { MysqlClient } from '@effect/sql-mysql2';
import { expect } from '@effect/vitest';
import {
	defineRelations,
	ExtractTablesFromSchema,
	RelationsBuilder,
	RelationsBuilderConfig,
	Schema,
	sql,
} from 'drizzle-orm';
import * as MySqlDrizzle from 'drizzle-orm/effect-mysql2';
import { migrate } from 'drizzle-orm/effect-mysql2/migrator';
import { getTableConfig, int, mysqlTable, text } from 'drizzle-orm/mysql-core';
import { Redacted } from 'effect';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { DB, runCommonEffectMySqlTests } from '../effect-common';
import relations from '../relations';
import { usersMigratorTable } from '../schema2';

if (!process.env['MYSQL_CONNECTION_STRING']) throw new Error('`MYSQL_CONNECTION_STRING` not set!');

const MySqlClientLive = MysqlClient.layer({
	url: Redacted.make(process.env['MYSQL_CONNECTION_STRING']!),
});

const dbEffect = MySqlDrizzle.make({ relations }).pipe(Effect.provide(MySqlDrizzle.DefaultServices));
const DBLive = Layer.effect(
	DB,
	Effect.gen(function*() {
		const db = yield* dbEffect;

		return db;
	}),
);

const connectionStringFor = (database: string) => {
	const url = new URL(process.env['MYSQL_CONNECTION_STRING']!);
	url.pathname = `/${database}`;
	return url.toString();
};

const onDatabase = <A, E, R>(
	database: string,
	use: (db: any) => Effect.Effect<A, E, R>,
) =>
	MySqlDrizzle.make({ relations }).pipe(
		Effect.flatMap(use),
		Effect.provide(MySqlDrizzle.DefaultServices),
		Effect.provide(MysqlClient.layer({ url: Redacted.make(connectionStringFor(database)) })),
	);

const createDB = <
	TSchema extends Record<string, any>,
	TConfig extends RelationsBuilderConfig<TTables>,
	TTables extends Schema = ExtractTablesFromSchema<TSchema>,
>(
	schema: TSchema,
	relations: (helpers: RelationsBuilder<TTables>) => TConfig,
	useJitMappers?: boolean,
) =>
	MySqlDrizzle.make({ relations: defineRelations(schema, relations), jit: useJitMappers }).pipe(
		Effect.provide(MySqlDrizzle.DefaultServices),
	);

const TestLive = Layer.merge(MySqlClientLive, DBLive.pipe(Layer.provide(MySqlClientLive)));

runCommonEffectMySqlTests({
	testLayer: TestLive,
	MySqlDrizzle: MySqlDrizzle,
	createDB,
	addTests: (it) => {
		it.effect(
			'migrator',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					yield* db.execute(sql`drop table if exists ${sql.identifier('__drizzle_migrations')}`);
					yield* db.execute(sql`drop table if exists ${usersMigratorTable}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

					yield* migrate(db, { migrationsFolder: './drizzle2/mysql' });

					yield* db.insert(usersMigratorTable).values({ name: 'John', email: 'email' });

					const result = yield* db.select().from(usersMigratorTable);

					expect(result).toEqual([{ id: 1, name: 'John', email: 'email' }]);
				}),
		);

		it.effect(
			'migrator : --init',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					const migrationsTable = 'drzl_init';

					yield* db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
					yield* db.execute(sql`drop table if exists ${usersMigratorTable}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

					const migratorRes = yield* migrate(db, {
						migrationsFolder: './drizzle2/mysql',
						migrationsTable,
						// @ts-ignore - internal param
						init: true,
					});

					const meta = yield* db.select({
						hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
						createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
					}).from(sql`${sql.identifier(migrationsTable)}`);

					const res = yield* db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
						SELECT 1
						FROM INFORMATION_SCHEMA.TABLES
						WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
						AND TABLE_SCHEMA = DATABASE()
					) as ${sql.identifier('tableExists')};`);

					expect(migratorRes).toStrictEqual(undefined);
					expect(meta.length).toStrictEqual(1);
					expect(!!res[0]?.tableExists).toStrictEqual(false);
				}),
		);

		it.effect(
			'migrator : --init - local migrations error',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					const migrationsTable = 'drzl_init';

					yield* db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
					yield* db.execute(sql`drop table if exists ${usersMigratorTable}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

					const migratorRes = yield* Effect.flip(migrate(db, {
						migrationsFolder: './drizzle2/mysql-init',

						migrationsTable,
						// @ts-ignore - internal param
						init: true,
					}));

					const meta = yield* db.select({
						hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
						createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
					}).from(sql`${sql.identifier(migrationsTable)}`);

					const res = yield* db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
						SELECT 1
						FROM INFORMATION_SCHEMA.TABLES
						WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
						AND TABLE_SCHEMA = DATABASE()
					) as ${sql.identifier('tableExists')};`);

					expect((migratorRes as Extract<typeof migratorRes, { exitCode: unknown }>).exitCode)
						.toStrictEqual('localMigrations');
					expect(meta.length).toStrictEqual(0);
					expect(!!res[0]?.tableExists).toStrictEqual(false);
				}),
		);

		it.effect(
			'migrator : --init - db migrations error',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					const migrationsTable = 'drzl_init';

					yield* db.execute(sql`drop table if exists ${sql.identifier(migrationsTable)} cascade;`);
					yield* db.execute(sql`drop table if exists ${usersMigratorTable}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('cities_migration')}`);
					yield* db.execute(sql`drop table if exists ${sql.identifier('users_migration')}`);

					yield* migrate(db, {
						migrationsFolder: './drizzle2/mysql',
						migrationsTable,
					});

					const migratorRes = yield* Effect.flip(migrate(db, {
						migrationsFolder: './drizzle2/mysql-init',

						migrationsTable,
						// @ts-ignore - internal param
						init: true,
					}));

					const meta = yield* db.select({
						hash: sql<string>`${sql.identifier('hash')}`.as('hash'),
						createdAt: sql<number>`${sql.identifier('created_at')}`.mapWith(Number).as('created_at'),
					}).from(sql`${sql.identifier(migrationsTable)}`);

					const res = yield* db.execute<{ tableExists: boolean | number }>(sql`SELECT EXISTS (
						SELECT 1
						FROM INFORMATION_SCHEMA.TABLES
						WHERE TABLE_NAME = ${getTableConfig(usersMigratorTable).name}
						AND TABLE_SCHEMA = DATABASE()
					) as ${sql.identifier('tableExists')};`);

					expect((migratorRes as Extract<typeof migratorRes, { exitCode: unknown }>).exitCode)
						.toStrictEqual('databaseMigrations');
					expect(meta.length).toStrictEqual(1);
					expect(!!res[0]?.tableExists).toStrictEqual(true);
				}),
		);

		it.effect(
			'migrator: local migration is unapplied. Migrations timestamp is less than last db migration',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					const users = mysqlTable('migration_users', {
						id: int('id').primaryKey(),
						name: text().notNull(),
						email: text().notNull(),
						age: int(),
					});

					const users2 = mysqlTable('migration_users2', {
						id: int('id').primaryKey(),
						name: text().notNull(),
						email: text().notNull(),
						age: int(),
					});

					yield* db.execute(sql`drop table if exists ${users}`);
					yield* db.execute(sql`drop table if exists ${users2}`);

					// create migration directory
					const migrationDir = './migrations/mysql';
					if (existsSync(migrationDir)) rmSync(migrationDir, { recursive: true });
					mkdirSync(migrationDir, { recursive: true });

					// first branch
					mkdirSync(`${migrationDir}/20240101010101_initial`, { recursive: true });
					writeFileSync(
						`${migrationDir}/20240101010101_initial/migration.sql`,
						'CREATE TABLE `migration_users` (\n`id` INT PRIMARY KEY,\n`name` text NOT NULL,\n`email` text NOT NULL\n);',
					);
					mkdirSync(`${migrationDir}/20240303030303_third`, { recursive: true });
					writeFileSync(
						`${migrationDir}/20240303030303_third/migration.sql`,
						'ALTER TABLE `migration_users` ADD COLUMN `age` INT;',
					);

					yield* migrate(db, { migrationsFolder: migrationDir });
					yield* db.insert(users).values({ id: 1, name: 'John', email: '', age: 30 });
					const res1 = yield* db.select().from(users);

					// second migration was not applied yet
					yield* Effect.flip(db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 }));

					// insert migration with earlier timestamp
					mkdirSync(`${migrationDir}/20240202020202_second`, { recursive: true });
					writeFileSync(
						`${migrationDir}/20240202020202_second/migration.sql`,
						'CREATE TABLE `migration_users2` (\n`id` INT PRIMARY KEY,\n`name` text NOT NULL,\n`email` text NOT NULL\n,`age` INT\n);',
					);
					yield* migrate(db, { migrationsFolder: migrationDir });

					yield* db.insert(users2).values({ id: 1, name: 'John', email: '', age: 30 });
					const res2 = yield* db.select().from(users2);

					const expected = [{ id: 1, name: 'John', email: '', age: 30 }];
					expect(res1).toStrictEqual(expected);
					expect(res2).toStrictEqual(expected);

					rmSync(migrationDir, { recursive: true });
				}),
		);

		it.effect(
			'managing multiple databases #1',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					yield* db.execute('drop database if exists drizzle1;');
					yield* db.execute('create database drizzle1;');
					yield* db.execute('drop database if exists drizzle2;');
					yield* db.execute('create database drizzle2;');

					// drizzle1
					const result1 = yield* onDatabase('drizzle1', (db1) =>
						Effect.gen(function*() {
							yield* migrate(db1, { migrationsFolder: './drizzle2/mysql' });
							yield* db1.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
							return yield* db1.select().from(usersMigratorTable);
						}));

					// drizzle2
					const result2 = yield* onDatabase('drizzle2', (db2) =>
						Effect.gen(function*() {
							yield* migrate(db2, { migrationsFolder: './drizzle2/mysql' });
							yield* db2.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
							return yield* db2.select().from(usersMigratorTable);
						}));

					yield* db.execute('drop database if exists drizzle1;');
					yield* db.execute('drop database if exists drizzle2;');

					expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
					expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
				}),
		);

		it.effect(
			'managing multiple databases #2',
			() =>
				Effect.gen(function*() {
					const db = yield* DB;
					yield* db.execute('drop database if exists drizzle1;');
					yield* db.execute('drop database if exists drizzle2;');
					yield* db.execute('create database drizzle1;');
					yield* db.execute('create database drizzle2;');

					// drizzle1
					const result1 = yield* onDatabase('drizzle1', (db1) =>
						Effect.gen(function*() {
							yield* migrate(db1, { migrationsFolder: './drizzle2/mysql' });
							yield* db1.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
							return yield* db1.select().from(usersMigratorTable);
						}));

					// drizzle2
					const result2 = yield* onDatabase('drizzle2', (db2) =>
						Effect.gen(function*() {
							yield* migrate(db2, { migrationsFolder: './drizzle2/mysql' });
							yield* db2.insert(usersMigratorTable).values({ name: 'John', email: 'email' });
							return yield* db2.select().from(usersMigratorTable);
						}));

					yield* db.execute('drop database drizzle1;');
					yield* db.execute('drop database drizzle2;');

					expect(result1).toEqual([{ id: 1, name: 'John', email: 'email' }]);
					expect(result2).toEqual([{ id: 1, name: 'John', email: 'email' }]);
				}),
		);
	},
});
