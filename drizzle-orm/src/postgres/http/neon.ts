import { createPool, type NeonHttpClient, type NeonHttpConfig } from '#postgres/neon-http';
import type { BatchItem, BatchResponse, SettledBatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresCodecs } from '../codecs.ts';
import { createShapeGenerator } from '../shape.ts';
import { PostgresNeonHttpSession } from './neon-session.ts';
import type { PostgresHttpBatchOptions, PostgresHttpQueryResultHKT, PostgresHttpRequestOptions } from './session.ts';

export class PostgresNeonHttpDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresHttpQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresNeonHttpDatabase';

	/** @internal */
	declare session: PostgresNeonHttpSession<TRelations>;

	/**
	 * Runs multiple queries at once in transaction
	 *
	 * Failing query will throw, stop remaining queries and roll back entire batch
	 */
	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresHttpBatchOptions,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch, options) as Promise<BatchResponse<T>>;
	}

	// No `pipeline`: Neon's multi-statement endpoint always wraps the set in a transaction (that is `batch`)

	/**
	 * Runs queries concurrently, each as it's own request, without a transaction
	 *
	 * Never throws because of a failing query
	 *
	 * Failing query does not stop or roll back the others
	 */
	async parallel<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
		options?: PostgresHttpRequestOptions,
	): Promise<SettledBatchResponse<T>> {
		return this.session.parallel(batch, options) as Promise<SettledBatchResponse<T>>;
	}
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonHttpClient = NeonHttpClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresNeonHttpDatabase<TRelations> & {
	$client: TClient;
} {
	const codecs = config.codecs ?? postgresCodecs;
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
	const session = new PostgresNeonHttpSession(client, dialect, relations, {
		logger,
		cache: config.cache,
		paramsInErrors: config.paramsInErrors,
	});

	const db = new PostgresNeonHttpDatabase(
		dialect,
		session,
		relations,
	) as PostgresNeonHttpDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonHttpClient = NeonHttpClient,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzlePgConfig<TRelations>,
		]
		| [
			& DrizzlePgConfig<TRelations>
			& ({
				client: TClient;
			} | {
				connection: string | NeonHttpConfig;
			}),
		]
): PostgresNeonHttpDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createPool({
			url: params[0],
		});

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...config } = params[0] as (
		& ({ connection?: NeonHttpConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, config) as any;

	const instance = typeof connection === 'string'
		? createPool({ url: connection })
		: createPool(connection!);

	return construct(instance, config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresNeonHttpDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
