import type { BatchItem } from '~/batch.ts';
import type { MigrationMeta } from '~/migrator.ts';
import type { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import type { PgAsyncTransaction } from '~/pg-core/async/session.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import { run } from '~/runtime/async.ts';
import type { SQL } from '~/sql/sql.ts';
import { assertUnreachable } from '~/utils.ts';
import { type PgMigrationRunner, upgradeIfNeeded as upgradeIfNeededProgram } from './pg-program.ts';
import type { UpgradeResult } from './utils.ts';

/**
 * The migrator's view of an async database. `mode` is how it runs statements atomically:
 * batch - neon http, execute - xata http, transaction - all others
 */
export function pgMigrationRunner(
	db: PgAsyncDatabase<PgQueryResultHKT, any>,
	mode: 'transaction' | 'batch' | 'execute' = 'transaction',
): PgMigrationRunner {
	return {
		execute: (query) => db.execute(query),
		objects: (query) => db.session.objects(query),
		atomically: async (statements: SQL[]) => {
			if (mode === 'transaction') {
				await db.transaction(async (tx: PgAsyncTransaction<any, any>) => {
					for (const statement of statements) {
						await tx.execute(statement);
					}
				});
			} else if (mode === 'batch') {
				const database = db as PgAsyncDatabase<PgQueryResultHKT, any> & {
					batch(batch: [BatchItem<'pg'>, ...BatchItem<'pg'>[]]): Promise<unknown>;
				};

				await database.batch(
					statements.map((s) => database.execute(s)) as unknown as [BatchItem<'pg'>, ...BatchItem<'pg'>[]],
				);
			} else if (mode === 'execute') {
				for (const statement of statements) {
					await db.session.execute(statement);
				}
			} else {
				assertUnreachable(mode);
			}
		},
	};
}

/**
 * Detects the current version of the migrations table schema and upgrades it if needed.
 *
 * Version 0: Original schema (id, hash, created_at)
 * Version 1: Extended schema (id, hash, created_at, name, applied_at)
 */
export function upgradeIfNeeded(
	migrationsSchema: string,
	migrationsTable: string,
	db: PgAsyncDatabase<PgQueryResultHKT, any>,
	localMigrations: MigrationMeta[],
	// batch - neon http
	// execute - xata http
	// transaction - all others
	mode: 'transaction' | 'batch' | 'execute' = 'transaction',
): Promise<UpgradeResult> {
	return run(upgradeIfNeededProgram(migrationsSchema, migrationsTable, pgMigrationRunner(db, mode), localMigrations));
}
