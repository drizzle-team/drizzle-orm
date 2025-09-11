import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SingleStoreDatabase } from '~/singlestore-core/db.ts';
import { SingleStoreDialect } from '~/singlestore-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import {
	type SingleStoreRemotePreparedQueryHKT,
	type SingleStoreRemoteQueryResultHKT,
	SingleStoreRemoteSession,
} from './session.ts';

export class SingleStoreRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends SingleStoreDatabase<SingleStoreRemoteQueryResultHKT, SingleStoreRemotePreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'SingleStoreRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
) => Promise<{ rows: any[]; insertId?: number; affectedRows?: number }>;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema, TRelations> = {},
): SingleStoreRemoteDatabase<TSchema, TRelations> {
	const dialect = new SingleStoreDialect({ casing: config.casing });
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

	const relations = config.relations ?? {} as TRelations;
	const session = new SingleStoreRemoteSession(callback, dialect, relations, schema, { logger });
	return new SingleStoreRemoteDatabase(dialect, session, relations, schema as any) as SingleStoreRemoteDatabase<
		TSchema,
		TRelations
	>;
}
