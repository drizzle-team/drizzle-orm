import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { DSQLDialect } from '~/dsql-core/dialect.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { DSQLClient, DSQLQueryResultHKTImpl } from './session.ts';
import { DSQLDriverSession } from './session.ts';

export interface DSQLDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class DSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> {
	static readonly [entityKind]: string = 'DSQLDatabase';

	constructor(
		readonly dialect: DSQLDialect,
		readonly session: DSQLDriverSession<TSchema, TRelations, any>,
		readonly relations: TRelations,
		readonly schema: V1.RelationalSchemaConfig<any> | undefined,
	) {}

	// Query builder methods would be added here
	select(): unknown {
		throw new Error('Method not implemented.');
	}

	insert(table: unknown): unknown {
		throw new Error('Method not implemented.');
	}

	update(table: unknown): unknown {
		throw new Error('Method not implemented.');
	}

	delete(table: unknown): unknown {
		throw new Error('Method not implemented.');
	}

	execute(query: unknown): unknown {
		throw new Error('Method not implemented.');
	}

	transaction<T>(
		transaction: (tx: unknown) => Promise<T>,
		config?: { isolationLevel?: 'repeatable read'; accessMode?: 'read only' | 'read write' },
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}

export interface DSQLConnectionConfig {
	endpoint: string;
	region?: string;
	// AWS credentials would typically come from environment/IAM
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DSQLClient = DSQLClient,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): DSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	const dialect = new DSQLDialect({ casing: config.casing });
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
	const session = new DSQLDriverSession(client, dialect, relations, schema, {
		logger,
		cache: config.cache,
	});

	const db = new DSQLDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as DSQLDatabase<TSchema>;
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
	TClient extends DSQLClient = DSQLClient,
>(
	...params:
		| [
			TClient,
		]
		| [
			TClient,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& {
				client: TClient;
			},
		]
		| [
			& DrizzleConfig<TSchema, TRelations>
			& {
				connection: DSQLConnectionConfig;
			},
		]
): DSQLDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	// Handle different overload patterns
	if (typeof params[0] === 'object' && 'connection' in params[0]) {
		const { connection, ...drizzleConfig } = params[0] as (
			& { connection: DSQLConnectionConfig }
			& DrizzleConfig<TSchema, TRelations>
		);
		// Create DSQL client from connection config
		const client = createDSQLClient(connection);
		return construct(client as TClient, drizzleConfig);
	}

	if (typeof params[0] === 'object' && 'client' in params[0]) {
		const { client, ...drizzleConfig } = params[0] as (
			& { client: TClient }
			& DrizzleConfig<TSchema, TRelations>
		);
		return construct(client, drizzleConfig);
	}

	// Direct client passed
	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

function createDSQLClient(config: DSQLConnectionConfig): DSQLClient {
	// This would create the actual DSQL client (AWS SDK or pg-compatible)
	throw new Error('Method not implemented.');
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): DSQLDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
