import { neonConfig, Pool, type PoolConfig } from '@neondatabase/serverless';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations, TablesRelationalConfig } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { NeonClient, NeonQueryResultHKT } from './session.ts';
import { NeonSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
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
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NeonSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig, V1.TablesRelationalConfig> {
		return new NeonSession(this.client, this.dialect, relations, schema, { logger: this.options.logger });
	}
}

export class NeonDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgDatabase<NeonQueryResultHKT, TSchema, TRelations> {
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
	$client: TClient;
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

	const relations = config.relations;
	const driver = new NeonDriver(client, dialect, { logger });
	const session = driver.createSession(relations, schema);
	const db = new NeonDatabase(dialect, session, relations, schema as V1.RelationalSchemaConfig<any>) as NeonDatabase<
		TSchema
	>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonClient = Pool,
>(
	...params: [
		TClient | string,
	] | [
		TClient | string,
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
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
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

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
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
