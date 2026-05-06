import { connect, type Connection, type Statement } from '@tursodatabase/serverless';
import * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { type DrizzleConfig, jitCompatCheck } from '~/utils.ts';
import { TursoDatabaseServerlessSession } from './session.ts';

export type TursoDatabaseServerlessRunResult = Awaited<ReturnType<Statement['run']>>;

export class TursoDatabaseServerlessDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', TursoDatabaseServerlessRunResult, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'TursoDatabaseServerlessDatabase';

	/** @internal */
	declare readonly session: TursoDatabaseServerlessSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Connection,
	config: DrizzleConfig<TSchema, TRelations> = {},
): TursoDatabaseServerlessDatabase<TSchema, TRelations> & {
	$client: Connection;
} {
	const dialect = new SQLiteAsyncDialect();
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
	const session = new TursoDatabaseServerlessSession(
		client,
		dialect,
		relations,
		schema,
		{ logger, cache: config.cache, useJitMappers: jitCompatCheck(config.jit) },
	);
	const db = new TursoDatabaseServerlessDatabase(
		'async',
		dialect,
		session as TursoDatabaseServerlessSession<
			TSchema,
			TRelations,
			V1.ExtractTablesWithRelations<TSchema>
		>,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as TursoDatabaseServerlessDatabase<TSchema, TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}

export type ConnectionOptions = Connection extends ((options: infer options) => any) ? options : never;

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends Connection = Connection,
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
				connection: string | ConnectionOptions;
			} | {
				client: TClient;
			})
		),
	]
): TursoDatabaseServerlessDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = connect({ url: params[0] });

		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& { connection?: ConnectionOptions; client?: TClient }
		& DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	const instance = typeof connection === 'string'
		? connect({ url: connection })
		: connect(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): TursoDatabaseServerlessDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
