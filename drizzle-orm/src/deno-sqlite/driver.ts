import { Database } from '@db/sqlite';
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
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { SQLiteDenoSession } from './session.ts';

export class DenoSQLiteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'sync', void, TSchema> {
	static override readonly [entityKind]: string = 'DenoSQLiteDatabase';
}

type DrizzleDenoSqliteDatabaseOptions = {
	/**
	 * Whether to open database only in read-only mode. By default, this is false.
	 */
	readonly?: boolean;

	/**
	 * Whether to create a new database file at specified path if one does not exist already. By default this is true.
	 */
	create?: boolean;

	/**
	 * Raw SQLite C API flags. Specifying this ignores all other options.
	 */
	flags?: number;

	/**
	 * Opens an in-memory database.
	 */
	memory?: boolean;

	/**
	 * Whether to support BigInt columns. False by default, integers larger than 32 bit will be inaccurate.
	 */
	int64?: boolean;

	/**
	 * Apply agressive optimizations that are not possible with concurrent clients.
	 */
	unsafeConcurrency?: boolean;

	/**
	 * Enable or disable extension loading
	 */
	enableLoadExtension?: boolean;
};

export type DrizzleDenoSqliteDatabaseConfig =
	| ({
		source?: string;
	} & DrizzleDenoSqliteDatabaseOptions)
	| string
	| undefined;

function construct<TSchema extends Record<string, unknown> = Record<string, never>>(
	client: Database,
	config: DrizzleConfig<TSchema> = {},
): DenoSQLiteDatabase<TSchema> & {
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

	const session = new SQLiteDenoSession(client, dialect, schema, { logger });
	const db = new DenoSQLiteDatabase('sync', dialect, session, schema) as DenoSQLiteDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Database = Database,
>(
	...params:
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
					connection?: DrizzleDenoSqliteDatabaseConfig;
				} | {
					client: TClient;
				})
			),
		]
): DenoSQLiteDatabase<TSchema> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new Database(':memory:') : new Database(params[0]);

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& ({
				connection?: DrizzleDenoSqliteDatabaseConfig | string;
				client?: TClient;
			})
			& DrizzleConfig<TSchema>;

		if (client) {
			return construct(client, drizzleConfig) as any;
		}

		if (!connection) {
			const instance = new Database(':memory:');
			return construct(instance, drizzleConfig) as any;
		}

		if (typeof connection === 'object') {
			const { source = ':memory:', ...opts } = connection;

			const options = Object.values(opts).filter((v) => v !== undefined).length ? opts : undefined;
			const instance = new Database(source, options);
			return construct(instance, drizzleConfig) as any;
		}

		const instance = new Database(connection);
		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as Database, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): DenoSQLiteDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
