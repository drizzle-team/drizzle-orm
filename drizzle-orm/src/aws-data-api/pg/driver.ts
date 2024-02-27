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
import type { DrizzleConfig } from '~/utils.ts';
import type { AwsDataApiClient, AwsDataApiPgQueryResultHKT } from './session.ts';
import { AwsDataApiSession } from './session.ts';
import { PgSelectConfig, PgTimestampString } from '~/pg-core/index.ts';
import { Param, SQL, sql } from '~/index.ts';

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

	override buildSelectQuery(config: PgSelectConfig): SQL<unknown> {
		if (config.where) {
			config.where = this.castTimestampStringParamAsTimestamp(config.where)
		}

		return super.buildSelectQuery(config)
	}

	castTimestampStringParamAsTimestamp(existingSql: SQL<unknown>): SQL<unknown> {
		return sql.join(existingSql.queryChunks.map((chunk) => {
			if (is(chunk, Param) && is(chunk.encoder, PgTimestampString)) {
				return sql`cast(${chunk.value} as timestamp)`
			}
			if (is(chunk, SQL)) {
				return this.castTimestampStringParamAsTimestamp(chunk)
			}

			return chunk
		}))
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
