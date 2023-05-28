import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { PgDialect } from '~/pg-core';
import { PgDatabase } from '~/pg-core/db';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type DrizzleConfig } from '~/utils';
import { type VercelPgClient, type VercelPgQueryResultHKT, VercelPgSession } from './session';

export interface VercelPgDriverOptions {
	logger?: Logger;
}

export class VercelPgDriver {
	constructor(
		private client: VercelPgClient,
		private dialect: PgDialect,
		private options: VercelPgDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): VercelPgSession<Record<string, unknown>, TablesRelationalConfig> {
		return new VercelPgSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}

	initMappers() {
		// types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		// types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		// types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export type VercelPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<VercelPgQueryResultHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: VercelPgClient,
	config: DrizzleConfig<TSchema> = {},
): VercelPgDatabase<TSchema> {
	const dialect = new PgDialect();
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

	const driver = new VercelPgDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	return new PgDatabase(dialect, session, schema) as VercelPgDatabase<TSchema>;
}
