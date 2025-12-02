import { type Client, type ConnectOptions, createClient } from 'gel';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/index.ts';
import { entityKind } from '~/entity.ts';
import { GelDatabase } from '~/gel-core/db.ts';
import { GelDialect } from '~/gel-core/dialect.ts';
import type { GelQueryResultHKT } from '~/gel-core/session.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { GelClient } from './session.ts';
import { GelDbSession } from './session.ts';

export interface GelDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class GelDriver {
	static readonly [entityKind]: string = 'GelDriver';

	constructor(
		private client: GelClient,
		private dialect: GelDialect,
		private options: GelDriverOptions = {},
	) {}

	createSession(
		relations: AnyRelations,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): GelDbSession<Record<string, unknown>, AnyRelations, V1.TablesRelationalConfig> {
		return new GelDbSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class GelJsDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends GelDatabase<GelQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'GelJsDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends GelClient = GelClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): GelJsDatabase<TSchema, TRelations> & {
	$client: GelClient extends TClient ? Client : TClient;
} {
	const dialect = new GelDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(config.schema, V1.createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {} as TRelations;
	const driver = new GelDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);
	const db = new GelJsDatabase(dialect, session, relations, schema as any) as GelJsDatabase<TSchema>;
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
	TClient extends GelClient = Client,
>(
	...params:
		| [string]
		| [string, DrizzleConfig<TSchema, TRelations>]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& (
				| {
					connection: string | ConnectOptions;
				}
				| {
					client: TClient;
				}
			),
		]
): GelJsDatabase<TSchema, TRelations> & {
	$client: GelClient extends TClient ? Client : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({ dsn: params[0] });

		return construct(instance, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as (
		& ({ connection?: ConnectOptions | string; client?: TClient })
		& DrizzleConfig<TSchema, TRelations>
	);

	if (client) return construct(client, drizzleConfig);

	const instance = createClient(connection);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): GelJsDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
