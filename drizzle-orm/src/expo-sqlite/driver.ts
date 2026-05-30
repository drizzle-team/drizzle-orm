import type { SQLiteDatabase } from 'expo-sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type ExpoSQLiteRunResult, ExpoSQLiteSession } from './session.ts';

export class ExpoSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends BaseSQLiteDatabase<'sync', ExpoSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteDatabase';
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: SQLiteDatabase,
	config: DrizzleSQLiteConfig<TRelations> = {},
): ExpoSQLiteDatabase<TRelations> & {
	$client: SQLiteDatabase;
} {
	const dialect = new SQLiteSyncDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new ExpoSQLiteSession(client, dialect, relations, {
		logger,
	});
	const db = new ExpoSQLiteDatabase(
		'sync',
		dialect,
		session,
		relations,
	) as ExpoSQLiteDatabase<TRelations>;
	(<any> db).$client = client;

	return db as any;
}
