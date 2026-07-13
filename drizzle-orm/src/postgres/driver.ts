import { createPool, type Pool, type PoolConfig } from 'minipg';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { miniPgCodecs } from './codecs.ts';
import type { PostgresClient, PostgresQueryResultHKT } from './session.ts';
import { PostgresSession } from './session.ts';
import { buildShape } from './shape.ts';

export class PostgresDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = PostgresClient,
>(
	client: TClient,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({
		codecs: config.codecs ?? miniPgCodecs,
		useJitMappers: jitCompatCheck(config.jit),
		shapeGenerator: buildShape,
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

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PostgresClient = Pool,
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
): PostgresDatabase<TRelations> & {
	$client: PostgresClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createPool({
			url: params[0],
			temporal: 'string',
		});

		return construct(
			instance,
			params[1] as DrizzlePgConfig<TRelations> | undefined,
		) as any;
	}

	const { connection, client, ...config } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzlePgConfig<TRelations>
	);

	if (client) return construct(client, config);

	// `temporal` is drizzle's to decide: a column's `mode` already says whether it wants a `Date` or the raw
	// text, and text is the lossless form (µs, BC eras, `infinity`). Pinning it here - and pinning `:string` in
	// the shape - is what lets the temporal codecs drop their `typeof value === 'string'` guard.
	const instance = typeof connection === 'string'
		? createPool({
			url: connection,
			temporal: 'string',
		})
		: createPool({ ...connection!, temporal: 'string' });

	return construct(instance, config) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
