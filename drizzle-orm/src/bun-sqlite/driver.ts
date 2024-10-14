/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig, IfNotImported, ImportTypeError } from '~/utils.ts';
import { SQLiteBunSession } from './session.ts';

export class BunSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'sync', void, TSchema> {
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

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): BunSQLiteDatabase<TSchema> & {
	$client: Database;
} {
	const dialect = new SQLiteSyncDialect({ casing: config.casing });
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

	const session = new SQLiteBunSession(client, dialect, schema, { logger });
	const db = new BunSQLiteDatabase('sync', dialect, session, schema) as BunSQLiteDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Database = Database,
>(
	...params: IfNotImported<
		Database,
		[ImportTypeError<'bun-types'>],
		| []
		| [
			TClient | string,
		]
		| [
			TClient | string,
			DrizzleConfig<TSchema>,
		]
		| [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection: DrizzleBunSqliteDatabaseConfig;
				})
			),
		]
	>
): BunSQLiteDatabase<TSchema> & {
	$client: TClient;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (params[0] instanceof Database) {
		return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (typeof params[0] === 'object') {
		const { connection, ...drizzleConfig } = params[0] as {
			connection: DrizzleBunSqliteDatabaseConfig | string | undefined;
		} & DrizzleConfig;

		if (typeof connection === 'object') {
			const { source, ...opts } = connection;

			const options = Object.values(opts).filter((v) => v !== undefined).length ? opts : undefined;

			const instance = new Database(source, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = new Database(connection);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = new Database(params[0]);

	return construct(instance, params[1]) as any;
}
