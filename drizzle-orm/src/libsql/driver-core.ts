import type { Client } from '@libsql/client';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type LibSQLRunResult, LibSQLSession } from './session.ts';

export class LibSQLDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', LibSQLRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'LibSQLDatabase';

	/** @internal */
	declare readonly session: LibSQLSession<TRelations>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

/** @internal */
export function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Client,
	config: DrizzleSQLiteConfig<TRelations> = {},
): LibSQLDatabase<TRelations> & {
	$client: Client;
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
	const session = new LibSQLSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	}, undefined);
	const db = new LibSQLDatabase('async', dialect, session as LibSQLSession<TRelations>, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}
