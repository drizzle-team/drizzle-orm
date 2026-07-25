import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import { BaseFirebirdDatabase } from '~/firebird-core/db.ts';
import { FirebirdAsyncDialect } from '~/firebird-core/dialect.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { type NodeFirebirdClient, NodeFirebirdSession, type NodeFirebirdTransactionOptions } from './session.ts';

export interface NodeFirebirdDriverOptions {
	logger?: Logger;
	cache?: Cache;
	transactionOptions?: NodeFirebirdTransactionOptions;
}

export interface NodeFirebirdConfig<TSchema extends Record<string, unknown> = Record<string, never>>
	extends DrizzleConfig<TSchema>
{
	transactionOptions?: NodeFirebirdTransactionOptions;
}

export class NodeFirebirdDriver {
	static readonly [entityKind]: string = 'NodeFirebirdDriver';

	constructor(
		private client: NodeFirebirdClient,
		private dialect: FirebirdAsyncDialect,
		private options: NodeFirebirdDriverOptions = {},
	) {}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NodeFirebirdSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NodeFirebirdSession(this.client, this.dialect, schema, this.options, undefined);
	}
}

export class NodeFirebirdDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseFirebirdDatabase<'async', unknown[], TSchema> {
	static override readonly [entityKind]: string = 'NodeFirebirdDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeFirebirdClient = NodeFirebirdClient,
>(
	client: TClient,
	config: NodeFirebirdConfig<TSchema> = {},
): NodeFirebirdDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new FirebirdAsyncDialect({ casing: config.casing });
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

	const driver = new NodeFirebirdDriver(client, dialect, {
		logger,
		cache: config.cache,
		transactionOptions: config.transactionOptions,
	});
	const session = driver.createSession(schema);
	const db = new NodeFirebirdDatabase('async', dialect, session, schema as any) as NodeFirebirdDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NodeFirebirdClient = NodeFirebirdClient,
>(
	...params:
		| [
			TClient,
		]
		| [
			TClient,
			NodeFirebirdConfig<TSchema>,
		]
		| [
			(
				& NodeFirebirdConfig<TSchema>
				& {
					client: TClient;
				}
			),
		]
): NodeFirebirdDatabase<TSchema> & {
	$client: TClient;
} {
	if (isConfig(params[0])) {
		const { client, ...drizzleConfig } = params[0] as { client: TClient } & NodeFirebirdConfig<TSchema>;
		return construct(client, drizzleConfig);
	}

	return construct(params[0] as TClient, params[1] as NodeFirebirdConfig<TSchema> | undefined);
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: NodeFirebirdConfig<TSchema>,
	): NodeFirebirdDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config);
	}
}
