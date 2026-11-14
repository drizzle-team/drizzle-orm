import * as Effect from 'effect/Effect';
import type { QueryEffectHKTBase } from '~/effect-core/query-effect.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { PgEffectSession } from '~/pg-core/effect/session.ts';
import { fromProgram } from '~/runtime/effect.ts';
import { type PgMigrationRunner, upgradeIfNeeded as upgradeIfNeededProgram } from './pg-program.ts';
import type { UpgradeResult } from './utils.ts';

/** The migrator's view of an Effect session: statements run atomically in a transaction */
export const pgEffectMigrationRunner = (session: PgEffectSession<any, any, any>): PgMigrationRunner => ({
	execute: (query) => session.execute(query),
	objects: (query) => session.objects(query),
	atomically: (statements) =>
		session.transaction((tx) => Effect.forEach(statements, (statement) => tx.execute(statement), { discard: true })),
});

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export const upgradeIfNeeded: <TEffectHKT extends QueryEffectHKTBase>(
	migrationsSchema: string,
	migrationsTable: string,
	session: PgEffectSession<TEffectHKT>,
	localMigrations: MigrationMeta[],
) => Effect.Effect<UpgradeResult, TEffectHKT['error'], TEffectHKT['context']> = Effect.fn('upgradeIfNeeded')(
	function*<TEffectHKT extends QueryEffectHKTBase>(
		migrationsSchema: string,
		migrationsTable: string,
		session: PgEffectSession<TEffectHKT>,
		localMigrations: MigrationMeta[],
	) {
		return yield* fromProgram<UpgradeResult, TEffectHKT['error'], TEffectHKT['context']>(() =>
			upgradeIfNeededProgram(migrationsSchema, migrationsTable, pgEffectMigrationRunner(session), localMigrations)
		);
	},
);
