import { neonConfig, Pool, type PoolConfig } from '@neondatabase/serverless';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { neonServerlessCodecs } from './codecs.ts';
import type { NeonClient, NeonQueryResultHKT } from './session.ts';
import { NeonSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMappers?: boolean;
}

export class NeonDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<NeonQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'NeonServerlessDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonClient = NeonClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): NeonDatabase<TRelations> & {
	$client: NeonClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({
		useJitMappers: jitCompatCheck(config.useJitMappers),
		codecs: config.codecs ?? neonServerlessCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new NeonSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new NeonDatabase(dialect, session, relations) as NeonDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonClient = Pool,
>(
	...params: [
		string,
	] | [
		string,
		DrizzlePgConfig<TRelations>,
	] | [
		(
			& DrizzlePgConfig<TRelations>
			& ({
				connection: string | PoolConfig;
			} | {
				client: TClient;
			})
			& {
				ws?: any;
			}
		),
	]
): NeonDatabase<TRelations> & {
	$client: NeonClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ws, ...DrizzlePgConfig } = params[0] as
		& {
			connection?: PoolConfig | string;
			ws?: any;
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (ws) {
		neonConfig.webSocketConstructor = ws;
	}

	if (client) return construct(client, DrizzlePgConfig);

	const instance = typeof connection === 'string'
		? new Pool({
			connectionString: connection,
		})
		: new Pool(connection);

	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzlePgConfig<TRelations>,
	): NeonDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
