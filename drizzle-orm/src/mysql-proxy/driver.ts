import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type MySqlRemotePreparedQueryHKT, type MySqlRemoteQueryResultHKT, MySqlRemoteSession } from './session.ts';

export class MySqlRemoteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<MySqlRemoteQueryResultHKT, MySqlRemotePreparedQueryHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'MySqlRemoteDatabase';
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
	_dialect: () => MySqlDialect = () => new MySqlDialect({ casing: config.casing }),
): MySqlRemoteDatabase<TSchema, TRelations> {
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
	const session = new MySqlRemoteSession(callback, dialect, relations, schema, { logger });
	return new MySqlRemoteDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
		'default',
	) as MySqlRemoteDatabase<TSchema, TRelations>;
}
