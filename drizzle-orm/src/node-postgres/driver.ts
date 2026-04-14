import pg, { type Pool, type PoolConfig } from 'pg';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { refineGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { NodePgClient, NodePgQueryResultHKT } from './session.ts';
import { NodePgSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class NodePgDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NodePgQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDatabase';
}

export const nodePgCodecs = refineGenericPgCodecs();

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): NodePgDatabase<TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? nodePgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {};
	const session = new NodePgSession(client, dialect, relations, {
		logger,
		cache: config.cache,
		useJitMapper: config.useJitMappers,
	});

	const db = new NodePgDatabase(
		dialect,
		session,
		relations,
	) as NodePgDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = Pool,
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
				connection: string | PoolConfig;
			}),
		]
): NodePgDatabase<TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...drizzlePgCDrizzlePgConfig } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, drizzlePgCDrizzlePgConfig);

	const instance = typeof connection === 'string'
		? new pg.Pool({
			connectionString: connection,
		})
		: new pg.Pool(connection!);

	return construct(instance, drizzlePgCDrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): NodePgDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
