import { DatabaseSync, type DatabaseSyncOptions, type StatementResultingChanges } from 'node:sqlite';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { NodeSQLiteSession } from './session.ts';

export class NodeSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', StatementResultingChanges, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NodeSQLiteDatabase';
}

export type DrizzleNodeSQLiteDatabaseConfig =
	| ({
		path?: string;
	} & DatabaseSyncOptions)
	| string
	| undefined;

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: DatabaseSync,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NodeSQLiteDatabase<TSchema, TRelations> & {
	$client: DatabaseSync;
} {
	const dialect = new SQLiteSyncDialect();
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
	const session = new NodeSQLiteSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>(client, dialect, relations, schema as V1.RelationalSchemaConfig<any>, { logger });
	const db = new NodeSQLiteDatabase(
		'sync',
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as NodeSQLiteDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends DatabaseSync = DatabaseSync,
>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection?: DrizzleNodeSQLiteDatabaseConfig | string;
				} | {
					client: TClient;
				})
			),
		]
): NodeSQLiteDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new DatabaseSync(':memory:') : new DatabaseSync(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& ({
			connection?: DrizzleNodeSQLiteDatabaseConfig | string;
			client?: TClient;
		})
		& DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object') {
		const { path, ...options } = connection;

		const instance = new DatabaseSync(path ?? ':memory:', options);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = new DatabaseSync(connection ?? ':memory:');

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NodeSQLiteDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
