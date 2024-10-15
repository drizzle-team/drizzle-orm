import type { HTTPTransactionOptions, NeonQueryFunction } from '@neondatabase/serverless';
import { neon, types } from '@neondatabase/serverless';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { DefaultLogger } from '~/logger.ts';
import { PgDatabase } from '~/pg-core/db.ts';
import { PgDialect } from '~/pg-core/dialect.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { DrizzleConfig, IfNotImported, ImportTypeError } from '~/utils.ts';
import { type NeonHttpClient, type NeonHttpQueryResultHKT, NeonHttpSession } from './session.ts';

export interface NeonDriverOptions {
	logger?: Logger;
}

export class NeonHttpDriver {
	static readonly [entityKind]: string = 'NeonDriver';

	constructor(
		private client: NeonHttpClient,
		private dialect: PgDialect,
		private options: NeonDriverOptions = {},
	) {
		this.initMappers();
	}

	createSession(
		schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined,
	): NeonHttpSession<Record<string, unknown>, TablesRelationalConfig> {
		return new NeonHttpSession(this.client, this.dialect, schema, { logger: this.options.logger });
	}

	initMappers() {
		types.setTypeParser(types.builtins.TIMESTAMPTZ, (val) => val);
		types.setTypeParser(types.builtins.TIMESTAMP, (val) => val);
		types.setTypeParser(types.builtins.DATE, (val) => val);
		types.setTypeParser(types.builtins.INTERVAL, (val) => val);
	}
}

export class NeonHttpDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends PgDatabase<NeonHttpQueryResultHKT, TSchema> {
	static override readonly [entityKind]: string = 'NeonHttpDatabase';

	/** @internal */
	declare readonly session: NeonHttpSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'pg'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<any, any>,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
): NeonHttpDatabase<TSchema> & {
	$client: TClient;
} {
	const dialect = new PgDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(
			config.schema,
			createTableRelationsHelpers,
		);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap,
		};
	}

	const driver = new NeonHttpDriver(client, dialect, { logger });
	const session = driver.createSession(schema);

	const db = new NeonHttpDatabase(
		dialect,
		session,
		schema as RelationalSchemaConfig<ExtractTablesWithRelations<TSchema>> | undefined,
	);
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends NeonQueryFunction<any, any> = NeonQueryFunction<false, false>,
>(
	...params: IfNotImported<
		HTTPTransactionOptions<boolean, boolean>,
		[ImportTypeError<'@neondatabase/serverless'>],
		[
			TClient | string,
		] | [
			TClient | string,
			DrizzleConfig<TSchema>,
		] | [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection: string | HTTPTransactionOptions<boolean, boolean>;
				} | {
					client: TClient;
				})
			),
		]
	>
): NeonHttpDatabase<TSchema> & {
	$client: TClient;
} {
	// eslint-disable-next-line no-instanceof/no-instanceof
	if (typeof params[0] === 'function') {
		return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
	}

	if (typeof params[0] === 'object') {
		const { connection, client, ...drizzleConfig } = params[0] as
			& {
				connection?:
					| ({
						connectionString: string;
					} & HTTPTransactionOptions<boolean, boolean>)
					| string;
				client?: TClient;
			}
			& DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig);

		if (typeof connection === 'object') {
			const { connectionString, ...options } = connection;

			const instance = neon(connectionString, options);

			return construct(instance, drizzleConfig) as any;
		}

		const instance = neon(connection!);

		return construct(instance, drizzleConfig) as any;
	}

	const instance = neon(params[0] as string);
	return construct(instance, params[1]) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): NeonHttpDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
