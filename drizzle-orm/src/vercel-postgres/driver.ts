import { sql } from '@vercel/postgres';
import * as V1 from '~/_relations.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { PgDialect } from '~/pg-core/index.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { type DrizzleConfig, isConfig } from '~/utils.ts';
import { type VercelPgClient, type VercelPgQueryResultHKT, VercelPgSession } from './session.ts';

export interface VercelPgDriverOptions {
	logger?: Logger;
	cache?: Cache;
}

export class VercelPgDriver {
	static readonly [entityKind]: string = 'VercelPgDriver';

	constructor(
		private client: VercelPgClient,
		private dialect: PgDialect,
		private options: VercelPgDriverOptions = {},
	) {
	}

	createSession(
		relations: AnyRelations,
		schema: V1.RelationalSchemaConfig<V1.TablesRelationalConfig> | undefined,
	): VercelPgSession<Record<string, unknown>, AnyRelations, V1.TablesRelationalConfig> {
		return new VercelPgSession(this.client, this.dialect, relations, schema, {
			logger: this.options.logger,
			cache: this.options.cache,
		});
	}
}

export class VercelPgDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<VercelPgQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'VercelPgDatabase';
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: VercelPgClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): VercelPgDatabase<TSchema, TRelations> & {
	$client: VercelPgClient;
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
	const driver = new VercelPgDriver(client, dialect, { logger, cache: config.cache });
	const session = driver.createSession(relations, schema);
	const db = new VercelPgDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as VercelPgDatabase<TSchema>;
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
	TClient extends VercelPgClient = typeof sql,
>(
	...params: [] | [
		TClient,
	] | [
		TClient,
		DrizzleConfig<TSchema, TRelations>,
	] | [
		(
			& DrizzleConfig<TSchema, TRelations>
			& ({
				client?: TClient;
			})
		),
	]
): VercelPgDatabase<TSchema, TRelations> & {
	$client: VercelPgClient extends TClient ? typeof sql : TClient;
} {
	if (isConfig(params[0])) {
		const { client, ...drizzleConfig } = params[0] as ({ client?: TClient } & DrizzleConfig<TSchema, TRelations>);
		return construct(client ?? sql, drizzleConfig) as any;
	}

	return construct((params[0] ?? sql) as TClient, params[1] as DrizzleConfig<TSchema, TRelations> | undefined) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): VercelPgDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
