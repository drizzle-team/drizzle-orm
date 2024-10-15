import Client, { type Database, type Options, type RunResult } from 'better-sqlite3';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MockDriver } from '~/mock.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteSyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig, IfNotImported, ImportTypeError } from '~/utils.ts';
import { BetterSQLiteSession } from './session.ts';

export type DrizzleBetterSQLite3DatabaseConfig =
	| ({
		source?:
			| string
			| Buffer;
	} & Options)
	| string
	| undefined;

export class BetterSQLite3Database<TSchema extends Record<string, unknown> = Record<string, never>>
	extends BaseSQLiteDatabase<'sync', RunResult, TSchema>
{
	static override readonly [entityKind]: string = 'BetterSQLite3Database';
}

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): BetterSQLite3Database<TSchema> & {
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

	const session = new BetterSQLiteSession(client, dialect, schema, { logger });
	const db = new BetterSQLite3Database('sync', dialect, session, schema);
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(
	...params: IfNotImported<
		Database,
		[ImportTypeError<'better-sqlite3'>],
		| []
		| [
			Database | string,
		]
		| [
			Database | string,
			DrizzleConfig<TSchema>,
		]
		| [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection?: DrizzleBetterSQLite3DatabaseConfig;
				} | {
					client: Database;
				})
			),
		]
		| [
			MockDriver,
		]
		| [
			MockDriver,
			DrizzleConfig<TSchema>,
		]
	>
): BetterSQLite3Database<TSchema> & {
	$client: Database;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (params[0] instanceof MockDriver) {
		return construct(params[0] as any, params[1] as DrizzleConfig<TSchema>) as any;
	}

	// eslint-disable-next-line no-instanceof/no-instanceof
	if (params[0] instanceof Client) {
		return construct(params[0] as Database, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (typeof params[0] === 'object') {
		const { connection, client, ...drizzleConfig } = params[0] as
			& {
				connection?: DrizzleBetterSQLite3DatabaseConfig;
				client?: Database;
			}
			& DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		if (typeof connection === 'object') {
			const { source, ...options } = connection;

			const instance = new Client(source, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = new Client(connection);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = new Client(params[0]);

	return construct(instance, params[1]) as any;
}
