import pgClient, { type Options, type PostgresType, type Sql } from 'postgres';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PostgresJsQueryResultHKT } from './session.ts';
import { PostgresJsSession } from './session.ts';

export class PostgresJsDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PostgresJsQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'PostgresJsDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Sql,
	config: DrizzleConfig<TSchema, TRelations> = {},
): PostgresJsDatabase<TSchema, TRelations> & {
	$client: Sql;
} {
	const transparentParser = (val: any) => val;

	// Override postgres.js default date parsers: https://github.com/porsager/postgres/discussions/761
	for (const type of ['1184', '1082', '1083', '1114', '1182', '1185', '1115', '1231']) {
		client.options.parsers[type as any] = transparentParser;
		client.options.serializers[type as any] = transparentParser;
	}
	client.options.serializers['114'] = transparentParser;
	client.options.serializers['3802'] = transparentParser;

	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = V1.extractTablesRelationalConfig(
			config.schema,
			V1.createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new PostgresJsSession(client, dialect, relations, schema, { logger, cache: config.cache });
	const db = new PostgresJsDatabase(dialect, session, relations, schema as V1.RelationalSchemaConfig<any>);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Sql = Sql,
>(
	...params: [
		string,
	] | [
		string,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				connection: string | ({ url?: string } & Options<Record<string, PostgresType>>);
			} | {
				client: TClient;
			})
		),
	]
): PostgresJsDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = pgClient(params[0] as string);

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as {
		connection?: { url?: string } & Options<Record<string, PostgresType>>;
		client?: TClient;
	} & DrizzleConfig<TSchema>;

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object' && connection.url !== undefined) {
		const { url, ...config } = connection;

		const instance = pgClient(url, config);
		return construct(instance, drizzleConfig) as any;
	}

	const instance = pgClient(connection);
	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): PostgresJsDatabase<TSchema, TRelations> & {
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
