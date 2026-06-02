import { type Config, connect, type Connection } from '@tidbcloud/serverless';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { MySqlDatabase } from '~/mysql-core/db.ts';
import { MySqlDialect } from '~/mysql-core/dialect.ts';
import type { DrizzleMySqlConfig } from '~/mysql-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import type { TiDBServerlessQueryResultHKT } from './session.ts';
import { TiDBServerlessSession } from './session.ts';

export class TiDBServerlessDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends MySqlDatabase<TiDBServerlessQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'TiDBServerlessDatabase';
}

function construct<TRelations extends AnyRelations = EmptyRelations>(
	client: Connection,
	config: DrizzleMySqlConfig<TRelations> = {},
): TiDBServerlessDatabase<TRelations> & {
	$client: Connection;
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
	const session = new TiDBServerlessSession(client, dialect, undefined, relations, {
		logger,
		cache: config.cache,
	});
	const db = new TiDBServerlessDatabase(dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Connection = Connection,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleMySqlConfig<TRelations>,
	] | [
		& ({
			connection: string | Config;
		} | {
			client: TClient;
		})
		& DrizzleMySqlConfig<TRelations>,
	]
): TiDBServerlessDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = connect({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzleMySqlConfig } = params[0] as
		& { connection?: Config | string; client?: TClient }
		& DrizzleMySqlConfig<TRelations>;

	if (client) return construct(client, DrizzleMySqlConfig) as any;

	const instance = typeof connection === 'string'
		? connect({
			url: connection,
		})
		: connect(connection!);

	return construct(instance, DrizzleMySqlConfig) as any;
}

export namespace drizzle {
	export function mock<TRelations extends AnyRelations = EmptyRelations>(
		config?: DrizzleMySqlConfig<TRelations>,
	): TiDBServerlessDatabase<TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
