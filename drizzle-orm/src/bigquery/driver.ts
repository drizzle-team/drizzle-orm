import type { BigQuery, BigQueryOptions } from '@google-cloud/bigquery';
import { BigQueryDatabase } from '~/bigquery-core/db.ts';
import { BigQueryDialect } from '~/bigquery-core/dialect.ts';
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
import type { BigQueryQueryResultHKT } from './session.ts';
import { BigQueryClientSession } from './session.ts';

export interface BigQueryDriverOptions {
	logger?: Logger;
}

export class BigQueryDriver {
	static readonly [entityKind]: string = 'BigQueryDriver';

	constructor(
		private client: BigQuery,
		private dialect: BigQueryDialect,
		private options: BigQueryDriverOptions = {},
	) {}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): BigQueryClientSession<Record<string, unknown>, TablesRelationalConfig> {
		return new BigQueryClientSession(this.client, this.dialect, schema, {
			logger: this.options.logger,
		});
	}
}

export class NodeBigQueryDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BigQueryDatabase<BigQueryQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NodeBigQueryDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	client: BigQuery,
	config: DrizzleConfig<TSchema> = {},
): NodeBigQueryDatabase<TSchema> & {
	$client: BigQuery;
} {
	const dialect = new BigQueryDialect({ casing: config.casing });
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

	const driver = new BigQueryDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new NodeBigQueryDatabase(dialect, session, schema as any) as NodeBigQueryDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

/**
 * Create a Drizzle ORM database instance for BigQuery.
 *
 * @param client - BigQuery client instance or configuration
 * @param config - Optional Drizzle configuration
 *
 * @example
 * ```ts
 * import { BigQuery } from '@google-cloud/bigquery';
 * import { drizzle } from 'drizzle-orm/bigquery';
 *
 * const bigquery = new BigQuery();
 * const db = drizzle(bigquery);
 *
 * // Or with configuration
 * const db = drizzle(bigquery, { schema });
 * ```
 */
export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	...params:
		| [BigQuery]
		| [BigQuery, DrizzleConfig<TSchema>]
		| [DrizzleConfig<TSchema> & { client: BigQuery }]
): NodeBigQueryDatabase<TSchema> & {
	$client: BigQuery;
} {
	if (isConfig(params[0])) {
		const { client, ...drizzleConfig } = params[0] as (
			& { client: BigQuery }
			& DrizzleConfig<TSchema>
		);

		return construct(client, drizzleConfig);
	}

	return construct(params[0] as BigQuery, params[1] as DrizzleConfig<TSchema> | undefined);
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NodeBigQueryDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
