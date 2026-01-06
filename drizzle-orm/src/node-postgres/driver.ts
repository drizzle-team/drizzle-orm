import pg, { type Pool, type PoolConfig } from 'pg';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { NodePgClient, NodePgQueryResultHKT } from './session.ts';
import { NodePgSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NodePgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NodePgQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NodePgDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = NodePgClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NodePgDatabase<TSchema, TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {};
	const session = new NodePgSession(client, dialect, relations, schema, {
		logger,
		cache: config.cache,
	});

	const db = new NodePgDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as NodePgDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = Pool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& ({
				client: TClient;
			} | {
				connection: string | PoolConfig;
			}),
		]
): NodePgDatabase<TSchema, TRelations> & {
	$client: NodePgClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as (
		& ({ connection?: PoolConfig | string; client?: TClient })
		& DrizzleConfig<TSchema, TRelations>
	);

	if (client) return construct(client, drizzleConfig);

	const instance = typeof connection === 'string'
		? new pg.Pool({
			connectionString: connection,
		})
		: new pg.Pool(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NodePgDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
