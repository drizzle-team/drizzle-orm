import { RDSDataClient, type RDSDataClientConfig } from '@aws-sdk/client-rds-data';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgColumn, PgInsertConfig, PgTable, TableConfig } from '~/pg-core/index.ts';
import { PgArray } from '~/pg-core/index.ts';
import type { PgRaw } from '~/pg-core/query-builders/raw.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { Param, type SQL, sql, type SQLWrapper } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import type { DrizzleConfig, UpdateSet } from '~/utils.ts';
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

	override buildInsertQuery(
		{ table, values, onConflict, returning, select, withList }: PgInsertConfig<PgTable<TableConfig>>,
	): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];

		if (!select) {
			for (const value of (values as Record<string, Param | SQL>[])) {
				for (const fieldName of Object.keys(columns)) {
					const colValue = value[fieldName];
					if (
						is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray)
						&& Array.isArray(colValue.value)
					) {
						value[fieldName] = sql`cast(${colValue} as ${sql.raw(colValue.encoder.getSQLType())})`;
					}
				}
			}
		}

		return super.buildInsertQuery({ table, values, onConflict, returning, withList });
	}

	override buildUpdateSet(table: PgTable<TableConfig>, set: UpdateSet): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];

		for (const [colName, colValue] of Object.entries(set)) {
			const currentColumn = columns[colName];
			if (
				currentColumn && is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray)
				&& Array.isArray(colValue.value)
			) {
				set[colName] = sql`cast(${colValue} as ${sql.raw(colValue.encoder.getSQLType())})`;
			}
		}
		return super.buildUpdateSet(table, set);
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
