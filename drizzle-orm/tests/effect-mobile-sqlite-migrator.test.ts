import { SqliteClient } from '@effect/sql-sqlite-node';
import * as Effect from 'effect/Effect';
import { describe, it } from 'vitest';
import type { EffectExpoSQLiteDatabase } from '~/effect-expo-sqlite/driver.ts';
import { migrate as migrateExpoSQLite } from '~/effect-expo-sqlite/migrator.ts';
import type { EffectOPSQLiteDatabase } from '~/effect-op-sqlite/driver.ts';
import { migrate as migrateOPSQLite } from '~/effect-op-sqlite/migrator.ts';
import type { EffectSQLiteNodeDatabase } from '~/effect-sqlite-node/driver.ts';
import { makeWithDefaults } from '~/effect-sqlite-node/index.ts';
import { sql } from '~/sql/sql.ts';

const journalEntry = {
	idx: 0,
	when: 1732696446109,
	tag: '0000_cuddly_black_bolt',
	breakpoints: true,
};

const migrationConfig = {
	journal: { entries: [journalEntry] },
	migrations: { m0000: 'create table should_not_exist (id integer)' },
};

const upgradeLegacyDb = (
	migrate: (db: EffectSQLiteNodeDatabase) => Effect.Effect<unknown, unknown>,
) =>
	Effect.gen(function*() {
		const db = yield* makeWithDefaults();
		yield* db.run(`create table __drizzle_migrations (
			id integer primary key,
			hash text not null,
			created_at numeric
		)`);
		yield* db.run(sql`insert into __drizzle_migrations (id, hash, created_at) values (1, '', ${journalEntry.when})`);

		yield* migrate(db);

		return {
			migration: yield* db.get<{ name: string }>('select name from __drizzle_migrations where id = 1'),
			table: yield* db.get<{ exists: number }>(
				`select exists(select 1 from sqlite_master where type = 'table' and name = 'should_not_exist') as "exists"`,
			),
		};
	}).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })));

describe('effect mobile SQLite migrators', () => {
	it('upgrades an OP-SQLite legacy migration table from a generated bundle', async ({ expect }) => {
		const result = await Effect.runPromise(
			upgradeLegacyDb((db) =>
				migrateOPSQLite(db as unknown as EffectOPSQLiteDatabase<Record<string, never>>, migrationConfig)
			),
		);

		expect(result.migration).toEqual({ name: journalEntry.tag });
		expect(result.table).toEqual({ exists: 0 });
	});

	it('defers OP-SQLite migration parsing into Effect', async ({ expect }) => {
		const config = { journal: { entries: [journalEntry] }, migrations: {} };
		const db = {} as EffectOPSQLiteDatabase<Record<string, never>>;

		expect(() => migrateOPSQLite(db, config)).not.toThrow();
		const defect = await Effect.runPromise(
			migrateOPSQLite(db, config).pipe(Effect.catchDefect((cause) => Effect.succeed(cause))),
		);
		expect(defect).toEqual(new Error(`Missing migration: ${journalEntry.tag}`));
	});

	it('upgrades an Expo SQLite legacy migration table from a generated bundle', async ({ expect }) => {
		const result = await Effect.runPromise(
			upgradeLegacyDb((db) =>
				migrateExpoSQLite(db as unknown as EffectExpoSQLiteDatabase<Record<string, never>>, migrationConfig)
			),
		);

		expect(result.migration).toEqual({ name: journalEntry.tag });
		expect(result.table).toEqual({ exists: 0 });
	});

	it('defers Expo SQLite migration parsing into Effect', async ({ expect }) => {
		const config = { journal: { entries: [journalEntry] }, migrations: {} };
		const db = {} as EffectExpoSQLiteDatabase<Record<string, never>>;

		expect(() => migrateExpoSQLite(db, config)).not.toThrow();
		const defect = await Effect.runPromise(
			migrateExpoSQLite(db, config).pipe(Effect.catchDefect((cause) => Effect.succeed(cause))),
		);
		expect(defect).toEqual(new Error(`Missing migration: ${journalEntry.tag}`));
	});
});
