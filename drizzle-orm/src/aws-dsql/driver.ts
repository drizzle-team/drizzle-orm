import type { Pool, PoolConfig } from 'pg';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgTransactionConfig } from '~/pg-core/session.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { AwsDsqlClient, AwsDsqlQueryResultHKT, AwsDsqlRetryConfig, AwsDsqlTransaction } from './session.ts';
import { AwsDsqlSession } from './session.ts';

export interface AwsDsqlDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class AwsDsqlDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<AwsDsqlQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'AwsDsqlDatabase';

	/**
	 * Executes a transaction with automatic retry on DSQL optimistic concurrency conflicts.
	 *
	 * **Important:** The entire transaction callback will be re-executed on retry.
	 * Only use this for idempotent transactions without side effects.
	 *
	 * @example
	 * ```ts
	 * // Safe: idempotent database operations only
	 * await db.transactionWithRetry(async (tx) => {
	 *   await tx.update(accounts).set({ balance: sql`balance - 100` }).where(...);
	 *   await tx.update(accounts).set({ balance: sql`balance + 100` }).where(...);
	 * });
	 *
	 * // With custom retry config
	 * await db.transactionWithRetry(async (tx) => {
	 *   await tx.insert(orders).values({ ... });
	 * }, undefined, { maxRetries: 5 });
	 * ```
	 *
	 * @param transaction The transaction callback (must be idempotent)
	 * @param config Optional transaction config (isolation level, access mode)
	 * @param retryConfig Optional retry configuration (defaults: maxRetries=3, baseDelayMs=50, maxDelayMs=5000)
	 */
	transactionWithRetry<T>(
		transaction: (tx: AwsDsqlTransaction<TSchema, TRelations, V1.ExtractTablesWithRelations<TSchema>>) => Promise<T>,
		config?: PgTransactionConfig,
		retryConfig?: AwsDsqlRetryConfig,
	): Promise<T> {
		return (this.session as AwsDsqlSession<TSchema, TRelations, V1.ExtractTablesWithRelations<TSchema>>)
			.transactionWithRetry(transaction, config, retryConfig);
	}
}

/**
 * DSQL-specific connection options for IAM authentication.
 */
export interface AwsDsqlOptions {
	/** DSQL cluster hostname (e.g., "abc123.dsql.us-west-2.on.aws") */
	host: string;
	/** AWS region (auto-detected from hostname if not provided) */
	region?: string;
	/** IAM profile name for credentials (defaults to "default") */
	profile?: string;
	/** Token expiration time in seconds */
	tokenDurationSecs?: number;
}

/**
 * DSQL connection configuration combining DSQL-specific options with node-postgres Pool options.
 * Excludes `password` and `ssl` as these are managed by the DSQL connector for IAM authentication.
 *
 * @see https://node-postgres.com/apis/pool
 */
export type AwsDsqlConnectionConfig = AwsDsqlOptions & Omit<PoolConfig, 'password' | 'ssl'>;

/**
 * DSQL-specific configuration options extending the base DrizzleConfig.
 */
export interface AwsDsqlDrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends DrizzleConfig<TSchema, TRelations> {
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AwsDsqlClient = AwsDsqlClient,
>(
	client: TClient,
	config: AwsDsqlDrizzleConfig<TSchema, TRelations> = {},
): AwsDsqlDatabase<TSchema, TRelations> & {
	$client: AwsDsqlClient extends TClient ? Pool : TClient;
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

	const relations = config.relations ?? {};
	const session = new AwsDsqlSession(client, dialect, relations, schema, {
		logger,
		cache: config.cache,
	});

	const db = new AwsDsqlDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as AwsDsqlDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

function createDsqlClient(config: AwsDsqlConnectionConfig): AwsDsqlClient {
	let AuroraDSQLPool;
	try {
		// Dynamic import to avoid bundling issues when the package isn't installed
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		({ AuroraDSQLPool } = require('@aws/aurora-dsql-node-postgres-connector'));
	} catch (error) {
		throw new DrizzleError({
			message: 'Missing required package "@aws/aurora-dsql-node-postgres-connector". '
				+ 'Please install it: npm install @aws/aurora-dsql-node-postgres-connector',
			cause: error,
		});
	}

	// Pass all config options through to the DSQL connector
	// Default user to 'admin' and set applicationName if not provided
	return new AuroraDSQLPool({
		...config,
		user: config.user ?? 'admin',
		application_name: config.application_name ?? 'drizzle',
	});
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AwsDsqlClient = Pool,
>(
	...params:
		| [
			& AwsDsqlDrizzleConfig<TSchema, TRelations>
			& ({
				client: TClient;
			} | {
				connection: AwsDsqlConnectionConfig;
			}),
		]
		| [
			TClient,
		]
		| [
			TClient,
			AwsDsqlDrizzleConfig<TSchema, TRelations>,
		]
): AwsDsqlDatabase<TSchema, TRelations> & {
	$client: AwsDsqlClient extends TClient ? Pool : TClient;
} {
	// Handle config object with connection or client
	if (typeof params[0] === 'object' && params[0] !== null && !('query' in params[0])) {
		const config = params[0] as (
			& ({ connection?: AwsDsqlConnectionConfig; client?: TClient })
			& AwsDsqlDrizzleConfig<TSchema, TRelations>
		);

		if ('connection' in config && config.connection) {
			const { connection, ...drizzleConfig } = config;
			const client = createDsqlClient(connection);
			return construct(client as TClient, drizzleConfig);
		}

		if ('client' in config && config.client) {
			const { client, ...drizzleConfig } = config;
			return construct(client, drizzleConfig);
		}
	}

	// Direct client passed
	return construct(params[0] as TClient, params[1] as AwsDsqlDrizzleConfig<TSchema, TRelations> | undefined) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: AwsDsqlDrizzleConfig<TSchema, TRelations>,
	): AwsDsqlDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
