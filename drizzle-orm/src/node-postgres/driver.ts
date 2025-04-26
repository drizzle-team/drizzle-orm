import pg, { type Pool, type PoolConfig } from 'pg';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations, TablesRelationalConfig } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { NodePgClient, NodePgQueryResultHKT } from './session.ts';
import { NodePgSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
}

export class NodePgDriver {
	static readonly [entityKind]: string = 'NodePgDriver';

	constructor(
		private client: NodePgClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations | undefined,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NodePgSession<Record<string, unknown>, AnyRelations, TablesRelationalConfig, V1.TablesRelationalConfig> {
		return new NodePgSession(this.client, this.dialect, relations, schema, { logger: this.options.logger });
	}
}

export class NodePgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgDatabase<NodePgQueryResultHKT, TSchema, TRelations> {
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
	const driver = new NodePgDriver(client, dialect, { logger });
	const session = driver.createSession(relations, schema);
	const db = new NodePgDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as NodePgDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NodePgClient = Pool,
>(
	...params:
		| [
			TClient | string,
		]
		| [
			TClient | string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection: string | PoolConfig;
				} | {
					client: TClient;
				})
			),
		]
): NodePgDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
	}

	if (isConfig(params[0])) {
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

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
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
