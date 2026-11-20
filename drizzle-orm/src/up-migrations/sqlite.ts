import type { AnyRelations } from '~/relations.ts';
import { asyncMigrationRunner } from '~/runtime/async.ts';
import { type SQL, sql } from '~/sql/sql.ts';
import type { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import type { SQLiteAsyncSession } from '~/sqlite-core/async/session.ts';
import type { MigrationRunner } from './utils.ts';

export function sqliteSyncMigrationRunner(
	session: SQLiteAsyncSession<'sync', unknown, AnyRelations>,
	atomically?: MigrationRunner['atomically'],
): MigrationRunner {
	return {
		execute: (query) => session.run(query),
		objects: (query) => session.objects(query),
		atomically: atomically ?? ((statements: SQL[]) => {
			session.run(sql`BEGIN`);
			try {
				for (const statement of statements) session.run(statement);
				session.run(sql`COMMIT`);
			} catch (e) {
				try {
					session.run(sql`ROLLBACK`);
				} catch {
					// original error takes priority
				}
				throw e;
			}
		}),
	};
}

export function sqliteAsyncMigrationRunner(
	db: SQLiteAsyncDatabase<'async', unknown, AnyRelations>,
	atomically?: MigrationRunner['atomically'],
): MigrationRunner {
	return asyncMigrationRunner({
		execute: (query) => db.session.run(query),
		objects: (query) => db.session.objects(query),
		transaction: (transaction) => db.session.transaction((tx) => transaction({ execute: (query) => tx.run(query) })),
	}, atomically);
}
