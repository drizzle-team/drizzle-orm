/// <reference types="bun-types" />

import { SQL } from 'bun';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { bunSqlPgCodecs } from './codecs.ts';
import type { BunSQLQueryResultHKT } from './session.ts';
import { BunSQLSession } from './session.ts';

export class BunSQLDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<BunSQLQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunSQLDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzlePgConfig<TRelations> = {},
): BunSQLDatabase<TRelations> & {
	$client: SQL;
} {
	client.options.bigint = true;
	const dialect = new PgDialect({
		useJitMappers: config.useJitMappers,
		codecs: config.codecs ?? bunSqlPgCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new BunSQLSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new BunSQLDatabase(dialect, session, relations, false, true) as BunSQLDatabase<TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends SQL = SQL,
>(
	...params: [
		string,
	] | [
		string,
		DrizzlePgConfig<TRelations>,
	] | [
		(
			& DrizzlePgConfig<TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunSQLDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as
		& {
			connection?: { url?: string } & SQL.Options;
			client?: TClient;
		}
		& DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, ...config });
		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = new SQL(connection);
	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): BunSQLDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({
			options: {
				parsers: {},
				serializers: {},
			},
		} as any, config) as any;
	}
}
