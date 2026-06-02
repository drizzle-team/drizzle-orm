/// <reference types="bun-types" />

import { SQL } from 'bun';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { DrizzleMySqlConfig } from '~/mysql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import type { BunMySqlQueryResultHKT } from './session.ts';
import { BunMySqlSession } from './session.ts';

export class BunMySqlDatabase<
	TRelations extends AnyRelations = EmptyRelations,
> extends MySqlDatabase<BunMySqlQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'BunMySqlDatabase';
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: SQL,
	config: DrizzleMySqlConfig<TRelations> = {},
): BunMySqlDatabase<TRelations> & {
	$client: SQL;
} {
	const dialect = new MySqlDialect({
		useJitMappers: jitCompatCheck(config.jit),
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new BunMySqlSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new BunMySqlDatabase(dialect, session, relations) as BunMySqlDatabase<
		TRelations
	>;
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
		DrizzleMySqlConfig<TRelations>,
	] | [
		(
			& DrizzleMySqlConfig<TRelations>
			& ({
				connection: string | ({ url?: string } & SQL.Options);
			} | {
				client: TClient;
			})
		),
	]
): BunMySqlDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = new SQL(params[0]);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as {
		connection?: { url?: string } & SQL.Options;
		client?: TClient;
	} & DrizzleMySqlConfig<TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = new SQL({ url, ...config });
		return construct(instance, drizzleConfig) as any;
	}

	const instance = new SQL(connection);
	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleMySqlConfig<TRelations>,
	): BunMySqlDatabase<TRelations> & {
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
