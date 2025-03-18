/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations, ExtractTablesWithRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { SQLiteBunSession } from './session.ts';

export class BunSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'sync', void, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLiteDatabase';
}

type DrizzleBunSqliteDatabaseOptions = {
	/**
	 * Open the database as read-only (no write operations, no create).
	 *
	 * Equivalent to {@link constants.SQLITE_OPEN_READONLY}
	 */
	readonly?: boolean;
	/**
	 * Allow creating a new database
	 *
	 * Equivalent to {@link constants.SQLITE_OPEN_CREATE}
	 */
	create?: boolean;
	/**
	 * Open the database as read-write
	 *
	 * Equivalent to {@link constants.SQLITE_OPEN_READWRITE}
	 */
	readwrite?: boolean;
};

export type DrizzleBunSqliteDatabaseConfig =
	| ({
		source?: string;
	} & DrizzleBunSqliteDatabaseOptions)
	| string
	| undefined;

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Database,
	config: DrizzleConfig<TSchema, TRelations> = {},
): BunSQLiteDatabase<TSchema, TRelations> & {
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
	const session = new SQLiteBunSession<
		TSchema,
		TRelations,
		ExtractTablesWithRelations<TRelations>,
		V1.ExtractTablesWithRelations<TSchema>
	>(client, dialect, relations, schema as V1.RelationalSchemaConfig<any>, { logger });
	const db = new BunSQLiteDatabase(
		'sync',
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as BunSQLiteDatabase<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Database = Database,
>(
	...params:
		| []
		| [
			TClient | string,
		]
		| [
			TClient | string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection?: DrizzleBunSqliteDatabaseConfig;
				} | {
					client: TClient;
				})
			),
		]
): BunSQLiteDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new Database() : new Database(params[0]);

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& ({
				connection?: DrizzleBunSqliteDatabaseConfig | string;
				client?: TClient;
			})
			& DrizzleConfig<TSchema, TRelations>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object') {
			const { source, ...opts } = connection;

			const options = Object.values(opts).filter((v) => v !== undefined).length ? opts : undefined;

			const instance = new Database(source, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = new Database(connection);

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
	): BunSQLiteDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
