import pg, { type Pool, type PoolConfig } from 'pg';
import { CockroachDbDatabase } from '~/cockroachdb-core/db.ts';
import { CockroachDbDialect } from '~/cockroachdb-core/dialect.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import type { NodeCockroachDbClient, NodeCockroachDbQueryResultHKT } from './session.ts';
import { NodeCockroachDbSession } from './session.ts';

export interface CockroachDbDriverOptions {
	logger?: Logger;
}

export class NodeCockroachDbDriver {
	static readonly [entityKind]: string = 'NodeCockroachDbDriver';

	constructor(
		private client: NodeCockroachDbClient,
		private dialect: CockroachDbDialect,
		private options: CockroachDbDriverOptions = {},
	) {
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodeCockroachDbSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NodeCockroachDbSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export class NodeCockroachDbDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends CockroachDbDatabase<NodeCockroachDbQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachDbDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeCockroachDbClient = NodeCockroachDbClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NodeCockroachDbDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new CockroachDbDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new NodeCockroachDbDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new NodeCockroachDbDatabase(dialect, session, schema as any) as NodeCockroachDbDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeCockroachDbClient = Pool,
>(
	...params:
		| [
			TClient | string,
		]
		| [
			TClient | string,
			DrizzleConfig<TSchema>,
		]
		| [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection: string | PoolConfig;
				} | {
					client: TClient;
				})
			),
		]
): NodeCockroachDbDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as (
			& ({ connection?: PoolConfig | string; client?: TClient })
			& DrizzleConfig<TSchema>
		);

		if (client) return construct(client, drizzleConfig);

		const instance = typeof connection === 'string'
			? new pg.Pool({
				connectionString: connection,
			})
			: new pg.Pool(connection!);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NodeCockroachDbDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
