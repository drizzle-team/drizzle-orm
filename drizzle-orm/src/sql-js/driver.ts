import type { Database } from 'sql.js';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type SQLJsRunResult, SQLJsSession } from './session.ts';

export class SQLJsDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'sync', SQLJsRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLJsDatabase';
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
	client: Database,
	config: DrizzleSQLiteConfig<TRelations> = {},
): SQLJsDatabase<TRelations> & { $client: Database } {
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
	const session = new SQLJsSession(client, dialect, relations, {
		logger,
	});
	const db = new SQLJsDatabase(
		'sync',
		dialect,
		session,
		relations,
	);
	(<any> db).$client = client;

	return db as any;
}
