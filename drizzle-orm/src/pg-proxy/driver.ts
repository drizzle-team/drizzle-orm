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
import { type PgRemoteQueryResultHKT, PgRemoteSession } from './session.ts';

export class PgRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<PgRemoteQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'PgRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
	typings?: any[],
) => Promise<{ rows: any[] }>;

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema> = {},
	_dialect: () => PgDialect = () => new PgDialect({ casing: config.casing }),
): PgRemoteDatabase<TSchema> {
	const dialect = _dialect();
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

	const session = new PgRemoteSession(callback, dialect, schema, { logger, cache: config.cache });
	const db = new PgRemoteDatabase(dialect, session, schema as any) as PgRemoteDatabase<TSchema>;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db;
}
