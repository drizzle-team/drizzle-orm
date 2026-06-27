/// <reference types="bun-types" />

import { Database } from 'bun:sqlite';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type SQLiteBunRunResult, SQLiteBunSession } from './session.ts';

export class SQLiteBunDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends SQLiteAsyncDatabase<'sync', SQLiteBunRunResult, TRelations> {
	static override readonly [entityKind]: string = 'SQLiteBunDatabase';
}

type DrizzleSqliteBunDatabaseOptions = {
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
	} & DrizzleSqliteBunDatabaseOptions)
	| string
	| undefined;

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Database,
	config: DrizzleSQLiteConfig<TRelations> = {},
): SQLiteBunDatabase<TRelations> & {
	$client: Database;
} {
	const dialect = new SQLiteDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new SQLiteBunSession<TRelations>(
		client,
		dialect,
		relations,
		{
			logger,
		},
	);
	const db = new SQLiteBunDatabase('sync', dialect, session, relations);
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Database = Database,
>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzleSQLiteConfig<TRelations>,
		]
		| [
			(
				& DrizzleSQLiteConfig<TRelations>
				& ({
					connection?: DrizzleBunSqliteDatabaseConfig;
				} | {
					client: TClient;
				})
			),
		]
): SQLiteBunDatabase<TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new Database() : new Database(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as
		& ({
			connection?: DrizzleBunSqliteDatabaseConfig | string;
			client?: TClient;
		})
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	if (typeof connection === 'object') {
		const { source, ...opts } = connection;

		const options = Object.values(opts).filter((v) => v !== undefined).length ? opts : undefined;

		const instance = new Database(source, options);

		return construct(instance, DrizzleSQLiteConfig) as any;
	}

	const instance = new Database(connection);

	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): SQLiteBunDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
