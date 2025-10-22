import pg, { type Pool, type PoolConfig } from 'pg';
import * as V1 from '~/_relations.ts';
import { CockroachDatabase } from '~/cockroach-core/db.ts';
import { CockroachDialect } from '~/cockroach-core/dialect.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { NodeCockroachClient, NodeCockroachQueryResultHKT } from './session.ts';
import { NodeCockroachSession } from './session.ts';

export interface CockroachDriverOptions {
	logger?: Logger;
}

export class NodeCockroachDriver {
	static readonly [entityKind]: string = 'NodeCockroachDriver';

	constructor(
		private client: NodeCockroachClient,
		private dialect: CockroachDialect,
		private options: CockroachDriverOptions = {},
	) {
	}

	createSession(
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): NodeCockroachSession<Record<string, unknown>, V1.TablesRelationalConfig> {
		return new NodeCockroachSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export class NodeCockroachDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends CockroachDatabase<NodeCockroachQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NodeCockroachDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeCockroachClient = NodeCockroachClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NodeCockroachDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new CockroachDialect({ casing: config.casing });
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

	const driver = new NodeCockroachDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new NodeCockroachDatabase(dialect, session, schema as any) as NodeCockroachDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeCockroachClient = Pool,
>(
	...params:
		| [
			string,
		]
		| [
			string,
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
): NodeCockroachDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new pg.Pool({
			connectionString: params[0],
		});

		return construct(instance, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

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

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NodeCockroachDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
