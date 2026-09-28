import { type AuroraDSQLConfig, auroraDSQLPostgres } from '@aws/aurora-dsql-postgresjs-connector';
import type { PostgresType, Sql } from 'postgres';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { DsqlAsyncDatabase } from '~/pg-core/async/dsql/db.ts';
import type { DsqlAsyncTransaction } from '~/pg-core/async/dsql/session.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { DrizzlePgConfig } from '~/pg-core/utils.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { jitCompatCheck } from '~/utils.ts';
import { postgresJsCodecs } from './codecs.ts';
import type {
	PostgresJsDsqlQueryResultHKT,
	PostgresJsDsqlTransaction,
	PostgresJsDsqlTransactionConfig,
} from './session.ts';
import { PostgresJsDsqlSession } from './session.ts';

export class PostgresJsDsqlDatabase<TRelations extends AnyRelations = EmptyRelations>
	extends DsqlAsyncDatabase<PostgresJsDsqlQueryResultHKT, TRelations>
{
	static override readonly [entityKind]: string = 'PostgresJsDsqlDatabase';

	override transaction<T>(
		transaction: (tx: PostgresJsDsqlTransaction<TRelations>) => Promise<T>,
		config?: PostgresJsDsqlTransactionConfig,
	): Promise<T> {
		return super.transaction(
			transaction as (tx: DsqlAsyncTransaction<PostgresJsDsqlQueryResultHKT, TRelations>) => Promise<T>,
			config,
		);
	}
}

function construct<
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Sql,
	config: DrizzlePgConfig<TRelations> = {},
): PostgresJsDsqlDatabase<TRelations> & {
	$client: Sql;
} {
	const transparentParser = (val: any) => val;
	// oxlint-disable-next-line drizzle-internal/no-instanceof
	const dateSerializer = (val: any) => (val instanceof Date ? val.toISOString() : val);

	// Override postgres.js default timestamptz, timestamp, date, time parsers: https://github.com/porsager/postgres/discussions/761
	// `new Date(x)` parse is lossy - not suitable for string-mode columns
	for (const type of ['1184', '1082', '1083', '1114']) {
		client.options.parsers[type as any] = transparentParser;
	}

	// Transparent serializer breaks `Date` instance encoding for the entire driver
	for (const type of ['1184', '1114', '1082', '1083']) {
		client.options.serializers[type as any] = dateSerializer;
	}

	const dialect = new PgDialect({
		useJitMappers: jitCompatCheck(config.jit),
		codecs: config.codecs ?? postgresJsCodecs,
	});
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PostgresJsDsqlSession(client, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new PostgresJsDsqlDatabase(dialect, session, relations);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Sql = Sql,
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
				connection: string | ({ url?: string } & AuroraDSQLConfig<Record<string, PostgresType>>);
			} | {
				client: TClient;
			})
		),
	]
): PostgresJsDsqlDatabase<TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = auroraDSQLPostgres(params[0] as string);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...DrizzlePgConfig } = params[0] as {
		connection?: { url?: string } & AuroraDSQLConfig<Record<string, PostgresType>>;
		client?: TClient;
	} & DrizzlePgConfig<TRelations>;

	if (client) return construct(client, DrizzlePgConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = auroraDSQLPostgres(url, config);
		return construct(instance, DrizzlePgConfig) as any;
	}

	const instance = auroraDSQLPostgres(connection!);
	return construct(instance, DrizzlePgConfig) as any;
}

export namespace drizzle {
	export function mock<
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzlePgConfig<TRelations>,
	): PostgresJsDsqlDatabase<TRelations> & {
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
