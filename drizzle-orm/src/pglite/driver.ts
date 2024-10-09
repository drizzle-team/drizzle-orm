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
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
}

export class PgliteDriver {
	static readonly [entityKind]: string = 'PgliteDriver';

	constructor(
		private client: PgliteClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): PgliteSession<Record<string, unknown>, TablesRelationalConfig> {
		return new PgliteSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}
}

export class PgliteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<PgliteQueryResultHKT, TSchema> {
	static readonly [entityKind]: string = 'PgliteDatabase';
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: PgliteClient,
	config: DrizzleConfig<TSchema> = {},
): PgliteDatabase<TSchema> & {
	$client: PgliteClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
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

	const driver = new PgliteDriver(client, dialect, { logger });
	const session = driver.createSession(schema);
	const db = new PgliteDatabase(dialect, session, schema as any) as PgliteDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}
