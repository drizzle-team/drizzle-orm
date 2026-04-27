import { RDSDataClient, type RDSDataClientConfig } from '@aws-sdk/client-rds-data';
import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgColumn } from '~/pg-core/columns/common.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { PgInsertConfig } from '~/pg-core/query-builders/insert.ts';
import type { PgTable, TableConfig } from '~/pg-core/table.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { Param, type SQL, sql } from '~/sql/sql.ts';
import { Table } from '~/table.ts';
import type { DrizzleConfig, UpdateSet } from '~/utils.ts';
import { awsDataApiPgCodecs } from './codecs.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
	database: string;
	resourceArn: string;
	secretArn: string;
}

export interface DrizzleAwsDataApiPgConfig<TRelations extends AnyRelations = EmptyRelations>
	extends DrizzlePgConfig<TRelations>
{
	database: string;
	resourceArn: string;
	secretArn: string;
}

export class AwsDataApiPgDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends PgAsyncDatabase<AwsDataApiPgQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'AwsDataApiPgDatabase';
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
						value[fieldName] = sql`cast(${colValue} as ${sql.raw(column.getSQLType())}${
							column.dimensions ? sql.raw('[]'.repeat(column.dimensions)) : undefined
						})`;
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
				set[colName] = sql`cast(${colValue} as ${sql.raw(currentColumn.getSQLType())}${
					currentColumn.dimensions ? sql.raw('[]'.repeat(currentColumn.dimensions)) : undefined
				})`;
			}
		}
		return super.buildUpdateSet(table, set);
	}
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: AwsDataApiClient,
	config: DrizzleAwsDataApiPgConfig<TRelations>,
): AwsDataApiPgDatabase<TRelations> & {
	$client: AwsDataApiClient;
} {
	const dialect = new AwsPgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? awsDataApiPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new AwsDataApiSession(client, dialect, relations, {
		...config,
		logger,
		cache: config.cache,
	}, undefined);
	const db = new AwsDataApiPgDatabase(dialect, session, relations, true);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AwsDataApiClient = RDSDataClient,
>(
	...params: [
		(
			| (
				& DrizzlePgConfig<TRelations>
				& {
					connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
				}
			)
			| (
				& DrizzleAwsDataApiPgConfig<TRelations>
				& {
					client: TClient;
				}
			)
		),
	]
): AwsDataApiPgDatabase<TRelations> & {
	$client: TClient;
} {
	if ((params[0] as { client?: TClient }).client) {
		const { client, ...drizzleConfig } = params[0] as {
			client: TClient;
		} & DrizzleAwsDataApiPgConfig<TRelations>;

		return construct(client, drizzleConfig) as any;
	}

	const { connection, ...drizzleConfig } = params[0] as {
		connection: RDSDataClientConfig & Omit<DrizzleAwsDataApiPgConfig, keyof DrizzleConfig>;
	} & DrizzlePgConfig<TRelations>;
	const { resourceArn, database, secretArn, ...rdsConfig } = connection;

	const instance = new RDSDataClient(rdsConfig);
	return construct(instance, { resourceArn, database, secretArn, ...drizzleConfig }) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config: DrizzleAwsDataApiPgConfig<TRelations>,
	): AwsDataApiPgDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
