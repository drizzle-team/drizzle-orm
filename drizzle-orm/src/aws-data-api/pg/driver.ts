import { RDSDataClient, type RDSDataClientConfig } from '@aws-sdk/client-rds-data';
import type { AnyColumn } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgEnumColumn, PgEnumObjectColumn } from '~/pg-core/index.ts';
import type { PgRaw } from '~/pg-core/query-builders/raw.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { SQL, SQLWrapper } from '~/sql/sql.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResult, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export interface DrizzleAwsDataApiPgConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends DrizzleConfig<TSchema> {
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<AwsDataApiPgQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'AwsDataApiPgDatabase';

	override execute<
		TRow extends Record<string, unknown> = Record<string, unknown>,
	>(query: SQLWrapper | string): PgRaw<AwsDataApiPgQueryResult<TRow>> {
		return super.execute(query);
	}
}

export class AwsPgDialect extends PgDialect {
	static override readonly [entityKind]: string = 'AwsPgDialect';

	override escapeParam(num: number): string {
		return `:${num + 1}`;
	}

	/**
	 * AWS RDS Data API ships parameters over JSON without parameter type negotiation.
	 * String values arrive at Postgres typed as `text`, and Postgres has no implicit cast
	 * from `text` to types like `uuid`, enums, arrays, or custom domains — so queries like
	 * `where uuid_col = $1` fail with "operator does not exist: uuid = text".
	 *
	 * `typeHint` covers only JSON, UUID, TIMESTAMP, DATE, TIME, and DECIMAL — nothing else
	 * (see https://docs.aws.amazon.com/rdsdataservice/latest/APIReference/API_SqlParameter.html).
	 * To make the driver work with every column type, we emit an explicit `cast(...)` for
	 * every parameter bound to a `PgColumn` encoder. Redundant casts (e.g. `cast($1 as uuid)`
	 * on top of `typeHint: UUID`) are harmless.
	 */
	override wrapParam(paramSql: string, column?: AnyColumn): string {
		if (!column) return paramSql;
		return `cast(${paramSql} as ${this.castTypeFor(column)})`;
	}

	private castTypeFor(column: AnyColumn): string {
		if (is(column, PgEnumColumn) || is(column, PgEnumObjectColumn)) {
			const { schema, enumName } = column.enum;
			return schema ? `${this.escapeName(schema)}.${this.escapeName(enumName)}` : this.escapeName(enumName);
		}
		return column.getSQLType();
	}
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: AwsDataApiClient,
	config: DrizzleAwsDataApiPgConfig<TSchema>,
): AwsDataApiPgDatabase<TSchema> & {
	$client: AwsDataApiClient;
} {
	const dialect = new AwsPgDialect({ casing: config.casing });
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

	const session = new AwsDataApiSession(client, dialect, schema, { ...config, logger, cache: config.cache }, undefined);
	const db = new AwsDataApiPgDatabase(dialect, session, schema as any);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends AwsDataApiClient = RDSDataClient,
>(
	...params: [
		TClient,
		DrizzleAwsDataApiPgConfig<TSchema>,
	] | [
		(
			| (
				& DrizzleConfig<TSchema>
				& {
					connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
				}
			)
			| (
				& DrizzleAwsDataApiPgConfig<TSchema>
				& {
					client: TClient;
				}
			)
		),
	]
): AwsDataApiPgDatabase<TSchema> & {
	$client: TClient;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (params[0] instanceof RDSDataClient || params[0].constructor.name !== 'Object') {
		return construct(params[0] as TClient, params[1] as DrizzleAwsDataApiPgConfig<TSchema>) as any;
	}

	if ((params[0] as { client?: TClient }).client) {
		const { client, ...drizzleConfig } = params[0] as {
			client: TClient;
		} & DrizzleAwsDataApiPgConfig<TSchema>;

		return construct(client, drizzleConfig) as any;
	}

	const { connection, ...drizzleConfig } = params[0] as {
		connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
	} & DrizzleConfig<TSchema>;
	const { resourceArn, database, secretArn, ...rdsConfig } = connection;

	const instance = new RDSDataClient(rdsConfig);
	return construct(instance, { resourceArn, database, secretArn, ...drizzleConfig }) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config: DrizzleAwsDataApiPgConfig<TSchema>,
	): AwsDataApiPgDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
