import { entityKind, is } from '~/entity.ts';
import type { SQL, SQLWrapper } from '~/index.ts';
import { Param, sql, Table } from '~/index.ts';
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
import type { DrizzleConfig, UpdateSet } from '~/utils.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResult, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
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
	static readonly [entityKind]: string = 'AwsDataApiPgDatabase';

	override execute<
		TRow extends Record<string, unknown> = Record<string, unknown>,
	>(query: SQLWrapper): PgRaw<AwsDataApiPgQueryResult<TRow>> {
		return super.execute(query);
	}
}

export class AwsPgDialect extends PgDialect {
	static readonly [entityKind]: string = 'AwsPgDialect';

	override escapeParam(num: number): string {
		return `:${num + 1}`;
	}

	override buildInsertQuery(
		{ table, values, onConflict, returning }: PgInsertConfig<PgTable<TableConfig>>,
	): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, PgColumn][] = Object.entries(columns);
		for (const value of values) {
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (
					is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray)
					&& Array.isArray(colValue.value)
				) {
					value[fieldName] = sql`cast(${col.mapToDriverValue(colValue.value)} as ${
						sql.raw(colValue.encoder.getSQLType())
					})`;
				}
			}
		}

		return super.buildInsertQuery({ table, values, onConflict, returning });
	}

	override buildUpdateSet(table: PgTable<TableConfig>, set: UpdateSet): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];

		for (const [colName, colValue] of Object.entries(set)) {
			const currentColumn = columns[colName];
			if (
				currentColumn && is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray)
				&& Array.isArray(colValue.value)
			) {
				set[colName] = sql`cast(${currentColumn?.mapToDriverValue(colValue.value)} as ${
					sql.raw(colValue.encoder.getSQLType())
				})`;
			}
		}
		return super.buildUpdateSet(table, set);
	}
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: AwsDataApiClient,
	config: DrizzleAwsDataApiPgConfig<TSchema>,
): AwsDataApiPgDatabase<TSchema> {
	const dialect = new AwsPgDialect();
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
			tables: config.schema,
			tablesConfig: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new AwsDataApiSession(client, dialect, schema, { ...config, logger }, undefined);
	return new PgDatabase(dialect, session, schema) as AwsDataApiPgDatabase<TSchema>;
}
