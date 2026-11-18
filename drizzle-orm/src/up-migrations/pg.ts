import type { BatchItem } from '~/batch.ts';
import type { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import type { PgQueryResultHKT } from '~/pg-core/session.ts';
import { asyncMigrationRunner } from '~/runtime/async.ts';
import type { MigrationRunner } from './utils.ts';

/**
 * The migrator's view of an async database. `mode` is how it runs statements atomically:
 * batch - neon http, execute - xata http (no transactions: one by one), transaction - all others
 */
export function pgMigrationRunner(
	db: PgAsyncDatabase<PgQueryResultHKT, any>,
	mode: 'transaction' | 'batch' | 'execute' = 'transaction',
): MigrationRunner {
	return asyncMigrationRunner(
		{
			execute: (query) => db.execute(query),
			objects: (query) => db.session.objects(query),
			transaction: (transaction) => db.transaction(transaction),
		},
		mode === 'batch'
			? async (statements) => {
				const database = db as PgAsyncDatabase<PgQueryResultHKT, any> & {
					batch(batch: [BatchItem<'pg'>, ...BatchItem<'pg'>[]]): Promise<unknown>;
				};
				await database.batch(
					statements.map((s) => database.execute(s)) as unknown as [BatchItem<'pg'>, ...BatchItem<'pg'>[]],
				);
			}
			: mode === 'execute'
			? async (statements) => {
				for (const statement of statements) await db.session.execute(statement);
			}
			: undefined,
	);
}
