import Client, { type Database, type Options } from 'better-sqlite3';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { type BetterSQLite3RunResult, BetterSQLiteSession } from './session.ts';

export type DrizzleBetterSQLite3DatabaseConfig =
	| ({
		source?:
			| string
			| Buffer;
	} & Options)
	| string
	| undefined;

export class BetterSQLite3Database<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'sync', BetterSQLite3RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'BetterSQLite3Database';
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Database,
	config: Omit<DrizzleSQLiteConfig<TRelations>, 'cache'> = {},
): BetterSQLite3Database<TRelations> & {
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
	const session = new BetterSQLiteSession(
		client,
		dialect,
		relations,
		{
			logger,
		},
	);
	const db = new BetterSQLite3Database('sync', dialect, session, relations);
	(<any> db).$client = client;
	// (<any> db).$cache = config.cache;
	// if ((<any> db).$cache) {
	// 	(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	// }

	return db as any;
}

export function drizzle<TRelations extends AnyRelations = EmptyRelations>(
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
					connection?: DrizzleBetterSQLite3DatabaseConfig;
				} | {
					client: Database;
				})
			),
		]
): BetterSQLite3Database<TRelations> & {
	$client: Database;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = params[0] === undefined ? new Client() : new Client(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as
		& {
			connection?: DrizzleBetterSQLite3DatabaseConfig;
			client?: Database;
		}
		& DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	if (typeof connection === 'object') {
		const { source, ...options } = connection;

		const instance = new Client(source, options);

		return construct(instance, DrizzleSQLiteConfig) as any;
	}

	const instance = new Client(connection);

	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): BetterSQLite3Database<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
