import type { PgClient } from '@effect/sql-pg';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import type { Logger } from '~/logger.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { EffectPgDatabase } from './db.ts';
import { EffectPgSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PgClient.PgClient = PgClient.PgClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): EffectPgDatabase<TSchema, TRelations> & {
	$client: PgClient.PgClient;
} {
	const dialect = new PgDialect({ casing: config.casing });

	// TODO: implement?
	// let logger;
	// if (config.logger === true) {
	// 	logger = new DefaultLogger();
	// } else if (config.logger !== false) {
	// 	logger = config.logger;
	// }

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

	const relations = config.relations ?? {} as TRelations;
	const session = new EffectPgSession(client, dialect, relations, schema, {});
	// TODO: EffectPgDatabase
	const db = new EffectPgDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as EffectPgDatabase<TSchema>;
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
	TClient extends PgClient.PgClient = PgClient.PgClient,
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
				connection: string; // TODO:PgClient config?
			}),
		]
): EffectPgDatabase<TSchema, TRelations> & {
	$client: PgClient.PgClient;
} {
	if (typeof params[0] === 'string') {
		// TODO: how to instantiate
		const instance = {} as PgClient.PgClient;

		return construct(instance, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
	}

	// TODO:
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
	): EffectPgDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
