import { PGlite, type PGliteOptions } from '@electric-sql/pglite';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import type { PgliteClient, PgliteQueryResultHKT } from './session.ts';
import { PgliteSession } from './session.ts';

export interface PgDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class PgliteDriver {
	static readonly [entityKind]: string = 'PgliteDriver';

	constructor(
		private client: PgliteClient,
		private dialect: PgDialect,
		private options: PgDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): PgliteSession<Record<string, unknown>, AnyRelations, V1.TablesRelationalConfig> {
		return new PgliteSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class PgliteDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<PgliteQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'PgliteDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: PgliteClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): PgliteDatabase<TSchema, TRelations> & {
	$client: PgliteClient;
} {
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
	const driver = new PgliteDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);
	const db = new PgliteDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as PgliteDatabase<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	// (<any> db).$cache = { invalidate: (<any> config).cache?.onMutate };
	// if (config.cache) {
	// 	for (
	// 		const key of Object.getOwnPropertyNames(Object.getPrototypeOf(config.cache)).filter((key) =>
	// 			key !== 'constructor'
	// 		)
	// 	) {
	// 		(<any> db).$cache[key as keyof typeof config.cache] = (<any> config).cache[key];
	// 	}
	// }

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends PGlite = PGlite,
>(
	...params:
		| []
		| [
			string,
		]
		| [
			string,
			DrizzleConfig<TSchema, TRelations>,
		]
		| [
			(
				& DrizzleConfig<TSchema, TRelations>
				& ({
					connection?: (PGliteOptions & { dataDir?: string }) | string;
				} | {
					client: TClient;
				})
			),
		]
): PgliteDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (params[0] === undefined || typeof params[0] === 'string') {
		const instance = new PGlite(params[0]);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as {
		connection?: PGliteOptions & { dataDir: string };
		client?: TClient;
	} & DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig) as any;

	if (typeof connection === 'object') {
		const { dataDir, ...options } = connection;

		const instance = new PGlite(dataDir, options);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = new PGlite(connection);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): PgliteDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
