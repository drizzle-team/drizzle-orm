import type { DatabasePromise, StatementPromise } from '@tursodatabase/database-common';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { TursoDatabaseSession } from './session.ts';

export type TursoDatabaseRunResult = Awaited<ReturnType<StatementPromise['run']>>;

export class TursoDatabaseDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', TursoDatabaseRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'TursoDatabaseDatabase';

	/** @internal */
	declare readonly session: TursoDatabaseSession<TRelations>;
}

/** @internal */
export function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: DatabasePromise,
	config: DrizzleSQLiteConfig<TRelations> = {},
): TursoDatabaseDatabase<TRelations> & {
	$client: DatabasePromise;
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
	const session = new TursoDatabaseSession(client, dialect, relations, { logger, cache: config.cache });
	const db = new TursoDatabaseDatabase('async', dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}
