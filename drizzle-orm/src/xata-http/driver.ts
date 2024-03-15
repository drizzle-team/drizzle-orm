import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { XataHttpClient, XataHttpQueryResultHKT } from './session.ts';
import { XataHttpSession } from './session.ts';

export interface XataDriverOptions {
	logger?: Logger;
}

export class XataHttpDriver {
	static readonly [entityKind]: string = 'XataDriver';

	constructor(
		private client: XataHttpClient,
		private dialect: PgDialect,
		private options: XataDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): XataHttpSession<Record<string, unknown>, TablesRelationalConfig> {
		return new XataHttpSession(this.client, this.dialect, schema, {
			logger: this.options.logger,
		});
	}

	initMappers() {
		// TODO: Add custom type parsers
	}
}

export class XataHttpDatabase<TSchema extends Record<string, unknown> = Record<string, never>>
	extends PgDatabase<XataHttpQueryResultHKT, TSchema>
{
	static readonly [entityKind]: string = 'XataHttpDatabase';

	/** @internal */
	declare readonly session: XataHttpSession<TSchema, ExtractTablesWithRelations<TSchema>>;
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: XataHttpClient,
	config: DrizzleConfig<TSchema> = {},
): XataHttpDatabase<TSchema> {
	const dialect = new PgDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new XataHttpDriver(client, dialect, { logger });
	const session = driver.createSession(schema);

	return new XataHttpDatabase(
		dialect,
		session,
		schema as RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> | undefined,
	);
}
