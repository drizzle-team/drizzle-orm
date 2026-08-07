import type { SQLiteDatabase } from 'expo-sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type ExpoSQLiteAsyncRunResult, ExpoSQLiteAsyncSession } from './session.ts';

export class ExpoSQLiteAsyncDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', ExpoSQLiteAsyncRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'ExpoSQLiteAsyncDatabase';
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: SQLiteDatabase,
	config: DrizzleSQLiteConfig<TRelations> = {},
): ExpoSQLiteAsyncDatabase<TRelations> & {
	$client: SQLiteDatabase;
} {
	const dialect = new SQLiteDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new ExpoSQLiteAsyncSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new ExpoSQLiteAsyncDatabase(
		'async',
		dialect,
		session,
		relations,
	) as ExpoSQLiteAsyncDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
