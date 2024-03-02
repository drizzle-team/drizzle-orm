import type { Connection } from '@planetscale/database';
import { Client } from '@planetscale/database';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PlanetScalePreparedQueryHKT, PlanetscaleQueryResultHKT } from './session.ts';
import { PlanetscaleSession } from './session.ts';

export interface PlanetscaleSDriverOptions {
	logger?: Logger;
}

export type PlanetScaleDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> = MySqlDatabase<PlanetscaleQueryResultHKT, PlanetScalePreparedQueryHKT, TSchema>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Client | Connection,
	config: DrizzleConfig<TSchema> = {},
): PlanetScaleDatabase<TSchema> {
	// Client is not Drizzle Object, so we can ignore this rule here
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (!(client instanceof Client)) {
		// Should use error on 0.30.0 release
		// 		throw new DrizzleError({
		// 			message: `You need to pass an instance of Client:

		// import { Client } from "@planetscale/database";

		// const client = new Client({
		//   host: process.env["DATABASE_HOST"],
		//   username: process.env["DATABASE_USERNAME"],
		//   password: process.env["DATABASE_PASSWORD"],
		// });

		// const db = drizzle(client);
		// `,
		// 		});
		console.log(`Warning: You need to pass an instance of Client:

import { Client } from "@planetscale/database";

const client = new Client({
  host: process.env["DATABASE_HOST"],
  username: process.env["DATABASE_USERNAME"],
  password: process.env["DATABASE_PASSWORD"],
});

const db = drizzle(client);
		
Starting from version 0.30.0, you will encounter an error if you attempt to use anything other than a Client instance.\nPlease make the necessary changes now to prevent any runtime errors in the future
		`);
	}

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
	return new MySqlDatabase(dialect, session, schema, 'planetscale') as PlanetScaleDatabase<TSchema>;
}
