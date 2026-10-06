import { sql } from 'drizzle-orm';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { describe, expect } from 'vitest';
import { randomString } from '~/utils';
import type { Test } from './instrumentation';

export function tests(test: Test) {
	describe('migrator', () => {
		// https://github.com/drizzle-team/drizzle-orm/issues/874
		test('migrator : concurrent migrate calls apply each migration once', async ({ db, openMigrator }) => {
			const migrationsSchema = `migrator_concurrent_${randomString()}`;
			const migrationsFolder = `./migrations/${migrationsSchema}`;
			const writeMigration = (name: string, query: string) => {
				mkdirSync(`${migrationsFolder}/${name}`, { recursive: true });
				writeFileSync(`${migrationsFolder}/${name}/migration.sql`, query);
			};

			const migrators = await Promise.all([openMigrator(), openMigrator(), openMigrator()]);
			const migrateConcurrently = async () => {
				const results = await Promise.allSettled(
					migrators.map((migrator) => migrator.migrate({ migrationsFolder, migrationsSchema })),
				);
				return results.flatMap((result) =>
					result.status === 'rejected' ? [String(result.reason.cause ?? result.reason)] : []
				);
			};

			try {
				// fresh database
				writeMigration(
					'20240101010101_initial',
					`CREATE TABLE "${migrationsSchema}"."runs" ("id" serial PRIMARY KEY NOT NULL, "name" text NOT NULL);\n--> statement-breakpoint\nINSERT INTO "${migrationsSchema}"."runs" ("name") VALUES ('initial');`,
				);
				expect(await migrateConcurrently()).toStrictEqual([]);

				// existing database with a new migration
				writeMigration(
					'20240202020202_second',
					`SELECT pg_sleep(0.2);\n--> statement-breakpoint\nINSERT INTO "${migrationsSchema}"."runs" ("name") VALUES ('second');`,
				);
				expect(await migrateConcurrently()).toStrictEqual([]);

				const names = (table: string) =>
					db.select({ name: sql<string>`"name"` })
						.from(sql`${sql.identifier(migrationsSchema)}.${sql.identifier(table)}`)
						.orderBy(sql`"id"`);
				expect(await names('runs')).toStrictEqual([{ name: 'initial' }, { name: 'second' }]);
				expect(await names('__drizzle_migrations')).toStrictEqual([
					{ name: '20240101010101_initial' },
					{ name: '20240202020202_second' },
				]);
			} finally {
				await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade`);
				rmSync(migrationsFolder, { recursive: true, force: true });
			}
		});

		test('migrator : upgrades a v0 migrations table', async ({ db, openMigrator }) => {
			const migrationsSchema = `migrator_upgrade_${randomString()}`;
			const migrationsFolder = `./migrations/${migrationsSchema}`;
			const table = sql`${sql.identifier(migrationsSchema)}."__drizzle_migrations"`;
			const writeMigration = (name: string, query: string) => {
				mkdirSync(`${migrationsFolder}/${name}`, { recursive: true });
				writeFileSync(`${migrationsFolder}/${name}/migration.sql`, query);
			};
			const tables = () =>
				db.select({ name: sql<string>`table_name` })
					.from(sql`information_schema.tables`)
					.where(sql`table_schema = ${migrationsSchema}`)
					.orderBy(sql`table_name`);

			try {
				writeMigration('20240101010101_initial', 'SELECT 1;');
				writeMigration('20240202020202_second', `CREATE TABLE "${migrationsSchema}"."runs" ("id" serial PRIMARY KEY);`);
				const [initial] = readMigrationFiles({ migrationsFolder });

				await db.execute(sql`create schema ${sql.identifier(migrationsSchema)}`);
				await db.execute(sql`create table ${table} (id serial primary key, hash text not null, created_at bigint)`);
				await db.execute(
					sql`insert into ${table} (hash, created_at) values (${initial!.hash}, ${
						initial!.folderMillis
					}), ('unknown', 0)`,
				);

				const migrator = await openMigrator();
				await expect(migrator.migrate({ migrationsFolder, migrationsSchema })).rejects.toThrow(
					'found 1 migrations (ids: 2) in the database that do not match any local migration',
				);
				expect(await tables()).toStrictEqual([{ name: '__drizzle_migrations' }]);

				await db.execute(sql`delete from ${table} where hash = 'unknown'`);
				await migrator.migrate({ migrationsFolder, migrationsSchema });

				expect(await tables()).toStrictEqual([{ name: '__drizzle_migrations' }, { name: 'runs' }]);
				expect(
					await db.select({ name: sql<string>`"name"`, applied: sql<boolean>`"applied_at" is not null` })
						.from(table)
						.orderBy(sql`"id"`),
				).toStrictEqual([
					{ name: '20240101010101_initial', applied: false },
					{ name: '20240202020202_second', applied: true },
				]);
			} finally {
				await db.execute(sql`drop schema if exists ${sql.identifier(migrationsSchema)} cascade`);
				rmSync(migrationsFolder, { recursive: true, force: true });
			}
		});
	});
}
