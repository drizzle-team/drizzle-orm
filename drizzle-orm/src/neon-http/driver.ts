import type { HTTPQueryOptions, HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless';
import { neon, types } from '@neondatabase/serverless';
import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import type { Cache } from '~/cache/core/cache.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgAsyncDatabase } from '~/pg-core/async/db.ts';
import { extendGenericPgCodecs } from '~/pg-core/codecs.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
	cache?: Cache;
	useJitMapper?: boolean;
}

export class NeonHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends PgAsyncDatabase<NeonHttpQueryResultHKT, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'NeonHttpDatabase';

	/** @intenal */
	declare session: NeonHttpSession<TSchema, TRelations, V1.ExtractTablesWithRelations<TSchema>>;

	$withAuth(
		token: Exclude<HTTPQueryOptions<true, true>['authToken'], undefined>,
	): Omit<this, '$withAuth'> {
		const session = new NeonHttpSession(this.session.client, this.dialect, this._.relations, this.schema, {
			...this.session.options,
			authToken: token,
		});

		return new NeonHttpDatabase(this.dialect, session, this._.relations, this.schema) as any;
	}

	/** @internal */
	declare readonly executor: NeonHttpSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.executor.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export const neonHttpCodecs = extendGenericPgCodecs();

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): NeonHttpDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	const dialect = new PgDialect({ casing: config.casing, useJitMappers: config.useJitMappers, codecs: neonHttpCodecs });
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

	const session = new NeonHttpSession(client, dialect, relations ?? {} as EmptyRelations, schema, {
		logger,
		useJitMapper: config.useJitMappers ?? false,
		cache: config.cache,
	});

	types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
	types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
	types.setTypeParser(types.builtins.DATE, (val) => val);
	types.setTypeParser(types.builtins.INTERVAL, (val) => val);
	types.setTypeParser(1231, (val) => val);
	types.setTypeParser(1115, (val) => val);
	types.setTypeParser(1185, (val) => val);
	types.setTypeParser(1187, (val) => val);
	types.setTypeParser(1182, (val) => val);

	const db = new NeonHttpDatabase(
		dialect,
		session,
		relations,
		schema as V1.RelationalSchemaConfig<V1.ExtractTablesWithRelations<TSchema>> | undefined,
		undefined,
	);
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
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<false, false>,
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
				connection: string | ({ connectionString: string } & HTTPTransactionOptions<boolean, boolean>);
			} | {
				client: TClient;
			})
		),
	]
): NeonHttpDatabase<TSchema, TRelations> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = neon(params[0] as string);
		return construct(instance, params[1]) as any;
	}

	const { connection, client, ...drizzleConfig } = params[0] as
		& {
			connection?:
				| ({
					connectionString: string;
				} & HTTPTransactionOptions<boolean, boolean>)
				| string;
			client?: TClient;
		}
		& DrizzleConfig<TSchema, TRelations>;

	if (client) return construct(client, drizzleConfig);

	if (typeof connection === 'object') {
		const { connectionString, ...options } = connection;

		const instance = neon(connectionString, options);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = neon(connection!);

	return construct(instance, drizzleConfig) as any;
}

export namespace drizzle {
	export function mock<
		TSchema extends Record<string, unknown> = Record<string, never>,
		TRelations extends AnyRelations = EmptyRelations,
	>(
		config?: DrizzleConfig<TSchema, TRelations>,
	): NeonHttpDatabase<TSchema, TRelations> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
