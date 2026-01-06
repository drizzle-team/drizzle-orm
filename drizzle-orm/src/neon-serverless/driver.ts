import { neonConfig, Pool, type PoolConfig } from '@neondatabase/serverless';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { NeonClient, NeonQueryResultHKT } from './session.ts';
import { NeonSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class NeonDriver {
	static readonly [entityKind]: string = 'NeonDriver';

	constructor(
		private client: NeonClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NeonSession<Record<string, unknown>, AnyRelations, V1.TablesRelationalConfig> {
		return new NeonSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class NeonDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NeonQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NeonServerlessDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonClient = NeonClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NeonDatabase<TSchema, TRelations> & {
	$client: NeonClient extends TClient ? Pool : TClient;
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

	const relations = config.relations ?? {} as TRelations;
	const driver = new NeonDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);
	const db = new NeonDatabase(dialect, session, relations, schema as V1.RelationalSchemaConfig<any>) as NeonDatabase<
		TSchema
	>;
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
	TClient extends NeonClient = Pool,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
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
): NeonDatabase<TSchema, TRelations> & {
	$client: NeonClient extends TClient ? Pool : TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ws, ...drizzleConfig } = params[0] as {
		connection?: PoolConfig | string;
		ws?: any;
		client?: TClient;
	} & DrizzleConfig<TSchema, TRelations>;

	if (ws) {
		neonConfig.webSocketConstructor = ws;
	}

	if (client) return construct(client, drizzleConfig);

	const instance = typeof connection === 'string'
		? new Pool({
			connectionString: connection,
		})
		: new Pool(connection);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NeonDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
