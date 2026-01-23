import type { Database } from 'db0';
import { entityKind } from '~/entity.ts';
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
import { type Db0PgQueryResultHKT, Db0PgSession, type Db0PgSessionOptions } from './session.ts';

export class Db0PgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<Db0PgQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'Db0PgDatabase';
}

export function constructPg<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): Db0PgDatabase<TSchema> & { $client: Database } {
	const dialect = new PgDialect({ casing: config.casing });
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

	const sessionOptions: Db0PgSessionOptions = { logger, cache: config.cache };
	const session = new Db0PgSession(client, dialect, schema, sessionOptions);
	const db = new Db0PgDatabase(dialect, session, schema as any) as Db0PgDatabase<TSchema>;
	(<any>db).$client = client;

	return db as any;
}
