import type { OPSQLiteConnection } from '@op-engineering/op-sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import { type DrizzleConfig, jitCompatCheck } from '~/utils.ts';
import { type OPSQLiteRunResult, OPSQLiteSession } from './session.ts';

export class OPSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', OPSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'OPSQLiteDatabase';
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: OPSQLiteConnection,
	config: DrizzleConfig<TRelations> = {},
): OPSQLiteDatabase<TRelations> & {
	$client: OPSQLiteConnection;
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
	const session = new OPSQLiteSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new OPSQLiteDatabase(
		'async',
		dialect,
		session,
		relations,
	);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
