import { type Client, type ConnectOptions, createClient } from 'gel';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { GelDatabase } from '~/gel-core/db.ts';
import { GelDialect } from '~/gel-core/dialect.ts';
import type { GelQueryResultHKT } from '~/gel-core/session.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations, TablesRelationalConfig } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { GelClient } from './session.ts';
import { GelDbSession } from './session.ts';

export interface GelDriverOptions {
	logger?: Logger;
}

export class GelDriver {
	static readonly [entityKind]: string = 'GelDriver';

	constructor(
		private client: GelClient,
		private dialect: GelDialect,
		private options: GelDriverOptions = {},
	) {}

	createSession(
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): GelDbSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig, V1.TablesRelationalConfig> {
		return new GelDbSession(this.client, this.dialect, relations, schema, { logger: this.options.logger });
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
	$client: TClient;
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

	const relations = config.relations;
	const driver = new GelDriver(client, dialect, { logger });
	const session = driver.createSession(relations, schema);
	const db = new GelJsDatabase(dialect, session, relations, schema as any) as GelJsDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends GelClient = Client,
>(
	...params:
		| [TClient | string]
		| [TClient | string, DrizzleConfig<TSchema, TRelations>]
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
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({ dsn: params[0] });

		return construct(instance, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as (
			& ({ connection?: ConnectOptions | string; client?: TClient })
			& DrizzleConfig<TSchema, TRelations>
		);

		if (client) return construct(client, drizzleConfig);

		const instance = createClient(connection);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
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
