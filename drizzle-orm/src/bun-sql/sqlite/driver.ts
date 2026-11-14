/// <reference types="bun-types" />

import { SQL } from 'bun';
import { entityKind } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import { jitCompatCheck } from '~/utils.ts';
import { bunSqlSQLiteCodecs } from './codecs.ts';
import type { BunSQLiteRunResult } from './session.ts';
import { BunSQLiteSession } from './session.ts';

export class BunSQLiteDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', BunSQLiteRunResult, TRelations>
{
	static override readonly [entityKind]: string = 'BunSQLiteDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzleSQLiteConfig<TRelations> = {},
): BunSQLiteDatabase<TRelations> & {
	$client: SQL;
} {
	const options = (client as { options?: { safeIntegers?: boolean } }).options;
	if (options && options.safeIntegers !== true) {
		throw new DrizzleError({
			message: "`bun`'s `SQL` client for SQLite must be created with `safeIntegers: true` (or `bigint: true`): "
				+ 'without it, integers past the safe integer range are returned as numbers, which have already lost precision',
		});
	}

	const dialect = new SQLiteDialect({
		codecs: config.codecs ?? bunSqlSQLiteCodecs,
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new BunSQLiteSession(client, dialect, relations, {
		logger,
		cache: config.cache,
		paramsInErrors: config.paramsInErrors,
	});
	const db = new BunSQLiteDatabase('async', dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

/**
 * Requirements:
 * - The client must be created with `safeIntegers: true` (clients created from connection strings are), throws
 *   otherwise
 */
export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleSQLiteConfig<TRelations>,
	] | [
		(
			& DrizzleSQLiteConfig<TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLiteDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0], { safeIntegers: true } as SQL.Options);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleSQLiteConfig } = params[0] as {
		connection?: { url?: string } & SQL.Options;
		client?: TClient;
	} & DrizzleSQLiteConfig<TRelations>;

	if (client) return construct(client, DrizzleSQLiteConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, safeIntegers: true, ...config } as SQL.Options);
		return construct(instance, DrizzleSQLiteConfig) as any;
	}

	const instance = typeof connection === 'string'
		? new SQL(connection, { safeIntegers: true } as SQL.Options)
		: new SQL({ safeIntegers: true, ...connection } as SQL.Options);
	return construct(instance, DrizzleSQLiteConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleSQLiteConfig<TRelations>,
	): BunSQLiteDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
