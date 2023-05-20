import type { Connection } from '@planetscale/database';
import type { Logger } from '~/logger';
import { DefaultLogger } from '~/logger';
import { MySqlDatabase } from '~/mysql-core/db';
import { MySqlDialect } from '~/mysql-core/dialect';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations';
import { type DrizzleConfig } from '~/utils';
import type { PlanetScalePreparedQueryHKT, PlanetscaleQueryResultHKT } from './session';
import { PlanetscaleSession } from './session';

export interface PlanetscaleSDriverOptions {
	logger?: Logger;
}

export type PlanetScaleDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = MySqlDatabase<PlanetscaleQueryResultHKT, PlanetScalePreparedQueryHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Connection,
	config: DrizzleConfig<TSchema> = {},
): PlanetScaleDatabase<TSchema> {
	const dialect = new MySqlDialect();
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

	const session = new PlanetscaleSession(client, dialect, undefined, schema, { logger });
	return new MySqlDatabase(dialect, session, schema) as PlanetScaleDatabase<TSchema>;
}
