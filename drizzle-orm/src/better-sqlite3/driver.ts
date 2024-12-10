import Client, { type Database, type Options, type RunResult } from 'better-sqlite3';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations, ExtractTablesWithRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { BetterSQLiteSession } from './session.ts';

export type DrizzleBetterSQLite3DatabaseConfig =
	| ({
		source?:
			| string
			| Buffer;
	} & Options)
	| string
	| undefined;

export class BetterSQLite3Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', RunResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'BetterSQLite3Database';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Database,
	config: DrizzleConfig<TSchema, TRelations> = {},
): BetterSQLite3Database<TSchema, TRelations> & {
	$client: Database;
} {
	const dialect = new SQLiteSyncDialect({ casing: config.casing });
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

	const relations = config.relations;
	const session = new BetterSQLiteSession<
		TSchema,
		TRelations,
		ExtractTablesWithRelations<TRelations>,
		V1.ExtractTablesWithRelations<TSchema>
	>(client, dialect, relations, schema as V1.RelationalSchemaConfig<any>, { logger });
	const db = new BetterSQLite3Database(
		'sync',
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	);
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	...params:
		| []
		| [
			Database | string,
		]
		| [
			Database | string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection?: DrizzleBetterSQLite3DatabaseConfig;
				} | {
					client: Database;
				})
			),
		]
): BetterSQLite3Database<TSchema, TRelations> & {
	$client: Database;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new Client() : new Client(params[0]);

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& {
				connection?: DrizzleBetterSQLite3DatabaseConfig;
				client?: Database;
			}
			& DrizzleConfig<TSchema, TRelations>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object') {
			const { source, ...options } = connection;

			const instance = new Client(source, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = new Client(connection);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as Database, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): BetterSQLite3Database<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
