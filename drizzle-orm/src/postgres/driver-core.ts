import type { Pool } from '#postgres';
import type { BatchItem, BatchResponse, SettledBatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresShapeCodecs } from './codecs.ts';
import type { PostgresBatchOptions, PostgresClient, PostgresQueryResultHKT } from './session.ts';
import { PostgresSession } from './session.ts';
import { createShapeGenerator } from './shape.ts';

export class PostgresDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresDatabase';

	/** @internal */
	declare session: PostgresSession<TRelations>;

	/**
	 * Runs multiple queries at once in transaction
	 *
	 * Failing query will throw, stop remaining queries and roll back entire batch
	 */
	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresBatchOptions,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch, options) as Promise<BatchResponse<T>>;
	}

	/**
	 * Pipelines queries back-to-back on a single pooled connection, without a transaction
	 *
	 * Never throws because of a failing query
	 *
	 * Failing query does not stop or roll back the others
	 */
	async pipeline<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<SettledBatchResponse<T>> {
		return this.session.pipeline(batch) as Promise<SettledBatchResponse<T>>;
	}

	/**
	 * Runs queries concurrently, fanned out across pooled connections, without a transaction
	 *
	 * Never throws because of a failing query
	 *
	 * Failing query does not stop or roll back the others
	 */
	async parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<SettledBatchResponse<T>> {
		return this.session.parallel(batch) as Promise<SettledBatchResponse<T>>;
	}
}

/** @internal */
export function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = PostgresClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	const codecs = config.codecs ?? postgresShapeCodecs;
	const dialect = new PgDialect({
		codecs,
		useJitMappers: jitCompatCheck(config.jit),
		shapeGenerator: createShapeGenerator(codecs),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new PostgresSession(client, dialect, relations, {
		logger,
		cache: config.cache,
		paramsInErrors: config.paramsInErrors,
	});

	const db = new PostgresDatabase(
		dialect,
		session,
		relations,
	) as PostgresDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
