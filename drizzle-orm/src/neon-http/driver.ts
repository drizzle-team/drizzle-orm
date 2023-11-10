import { types } from '@neondatabase/serverless';
import { entityKind } from '~/entity.ts';
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
import { type NeonHttpClient, type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
}

export class NeonHttpDriver {
	static readonly [entityKind]: string = 'NeonDriver';

	constructor(
		private client: NeonHttpClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NeonHttpSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NeonHttpSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
	}
}

export type NeonHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = PgDatabase<NeonHttpQueryResultHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: NeonHttpClient,
	config: DrizzleConfig<TSchema> = {},
): NeonHttpDatabase<TSchema> {
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

	const driver = new NeonHttpDriver(client, dialect, { logger });
	const session = driver.createSession(schema);

	return new PgDatabase(dialect, session, schema) as NeonHttpDatabase<TSchema>;
}
