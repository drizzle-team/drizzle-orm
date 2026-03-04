import { RDSDataClient, type RDSDataClientConfig } from '@aws-sdk/client-rds-data';
import * as V1 from '~/_relations.ts';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import type { PgAsyncRaw } from '~/pg-core/async/raw.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { PgColumn, type PgInsertConfig, type PgTable, type TableConfig } from '~/pg-core/index.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
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
	TRelations extends AnyRelations = EmptyRelations,
> extends DrizzleConfig<TSchema, TRelations> {
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<AwsDataApiPgQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'AwsDataApiPgDatabase';

	override execute<
		TRow extends Record<string, unknown> = Record<string, unknown>,
	>(query: SQLWrapper | string): PgAsyncRaw<AwsDataApiPgQueryResult<TRow>> {
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
					const column = columns[fieldName];
					if (
						is(colValue, Param) && colValue.value !== undefined
						&& is(column, PgColumn) && column.dimensions
						&& Array.isArray(colValue.value)
					) {
						value[fieldName] = sql`cast(${colValue} as ${sql.raw(column.getSQLType())})`;
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
				currentColumn && is(colValue, Param) && colValue.value !== undefined
				&& is(currentColumn, PgColumn) && currentColumn.dimensions
				&& Array.isArray(colValue.value)
			) {
				set[colName] = sql`cast(${colValue} as ${sql.raw(currentColumn.getSQLType())})`;
			}
		}
		return super.buildUpdateSet(table, set);
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: AwsDataApiClient,
	config: DrizzleAwsDataApiPgConfig<TSchema, TRelations>,
): AwsDataApiPgDatabase<TSchema, TRelations> & {
	$client: AwsDataApiClient;
} {
	const dialect = new AwsPgDialect({ casing: config.casing });
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

	const relations = config.relations ?? {} as TRelations;
	const session = new AwsDataApiSession(client, dialect, relations, schema, {
		...config,
		logger,
		cache: config.cache,
	}, undefined);
	const db = new AwsDataApiPgDatabase(dialect, session, relations, schema as V1.RelationalSchemaConfig<any>, true);
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
	TClient extends AwsDataApiClient = RDSDataClient,
>(
	...params: [
		(
			| (
				& DrizzleConfig<TSchema, TRelations>
				& {
					connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
				}
			)
			| (
				& DrizzleAwsDataApiPgConfig<TSchema, TRelations>
				& {
					client: TClient;
				}
			)
		),
	]
): AwsDataApiPgDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if ((params[0] as { client?: TClient }).client) {
		const { client, ...drizzleConfig } = params[0] as {
			client: TClient;
		} & DrizzleAwsDataApiPgConfig<TSchema, TRelations>;

		return construct(client, drizzleConfig) as any;
	}

	const { connection, ...drizzleConfig } = params[0] as {
		connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
	} & DrizzleConfig<TSchema, TRelations>;
	const { resourceArn, database, secretArn, ...rdsConfig } = connection;

	const instance = new RDSDataClient(rdsConfig);
	return construct(instance, { resourceArn, database, secretArn, ...drizzleConfig }) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config: DrizzleAwsDataApiPgConfig<TSchema, TRelations>,
	): AwsDataApiPgDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
