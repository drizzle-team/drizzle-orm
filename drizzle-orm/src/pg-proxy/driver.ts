import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type PgRemoteQueryResultHKT, PgRemoteSession } from './session.ts';

export class PgRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgRemoteQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'PgRemoteDatabase';
}

export type RemoteCallback = (
	sql: string,
	params: any[],
	method: 'all' | 'execute',
	typings?: any[],
) => Promise<{ rows: any[] }>;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	callback: RemoteCallback,
	config: DrizzleConfig<TSchema, TRelations> = {},
	_dialect: () => PgDialect = () => new PgDialect({ casing: config.casing }),
): PgRemoteDatabase<TSchema, TRelations> {
	const dialect = _dialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PgRemoteSession(callback, dialect, relations, schema, { logger, cache: config.cache });
	const db = new PgRemoteDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as PgRemoteDatabase<TSchema, TRelations>;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db;
}
