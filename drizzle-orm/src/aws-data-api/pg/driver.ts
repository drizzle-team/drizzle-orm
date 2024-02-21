import { entityKind, is } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig, UpdateSet } from '~/utils.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';
import { PgArray, PgColumn, PgInsertConfig, PgTable, TableConfig } from '~/pg-core/index.ts';
import { Param, SQL, Table, sql } from '~/index.ts';

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

export type AwsDataApiPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<AwsDataApiPgQueryResultHKT, TSchema>;

export class AwsPgDialect extends PgDialect {
	static readonly [entityKind]: string = 'AwsPgDialect';

	override escapeParam(num: number): string {
		return `:${num + 1}`;
	}

	override buildInsertQuery({ table, values, onConflict, returning }: PgInsertConfig<PgTable<TableConfig>>): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];
		const colEntries: [string, PgColumn][] = Object.entries(columns);
		for (let value of values) {
			for (const [fieldName, col] of colEntries) {
				const colValue = value[fieldName];
				if (is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray) &&  Array.isArray(colValue.value)) {
					value[fieldName] = sql`cast(${col.mapToDriverValue(colValue.value)} as ${sql.raw(colValue.encoder.getSQLType())})`
				}
			}
		}

		return super.buildInsertQuery({table, values, onConflict, returning})
	}

	override buildUpdateSet(table: PgTable<TableConfig>, set: UpdateSet): SQL<unknown> {
		const columns: Record<string, PgColumn> = table[Table.Symbol.Columns];
		
		Object.entries(set)
			.forEach(([colName, colValue]) => {
				const currentColumn = columns[colName];
				if (currentColumn && is(colValue, Param) && colValue.value !== undefined && is(colValue.encoder, PgArray) &&  Array.isArray(colValue.value)) {
					set[colName] = sql`cast(${currentColumn?.mapToDriverValue(colValue.value)} as ${sql.raw(colValue.encoder.getSQLType())})`
				}
			})
		return super.buildUpdateSet(table, set)
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
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const session = new AwsDataApiSession(client, dialect, schema, { ...config, logger }, undefined);
	return new PgDatabase(dialect, session, schema) as AwsDataApiPgDatabase<TSchema>;
}
