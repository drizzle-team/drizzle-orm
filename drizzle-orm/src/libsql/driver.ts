import { type Client, type Config, createClient, type ResultSet } from '@libsql/client';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type ExtractTablesWithRelations,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { type DrizzleConfig, type IfNotImported, type ImportTypeError, isConfig } from '~/utils.ts';
import { LibSQLSession } from './session.ts';

export class LibSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', ResultSet, TSchema> {
	static override readonly [entityKind]: string = 'LibSQLDatabase';

	/** @internal */
	declare readonly session: LibSQLSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
>(client: Client, config: DrizzleConfig<TSchema> = {}): LibSQLDatabase<TSchema> & {
	$client: Client;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
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

	const session = new LibSQLSession(client, dialect, schema, { logger }, undefined);
	const db = new LibSQLDatabase('async', dialect, session, schema) as LibSQLDatabase<TSchema>;
	(<any> db).$client = client;

	return db as any;
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends Client = Client,
>(
	...params: IfNotImported<
		Client,
		[ImportTypeError<'@libsql/client'>],
		[
			TClient | string,
		] | [
			TClient | string,
			DrizzleConfig<TSchema>,
		] | [
			(
				& DrizzleConfig<TSchema>
				& ({
					connection: string | Config;
				} | {
					client: TClient;
				})
			),
		]
	>
): LibSQLDatabase<TSchema> & {
	$client: TClient;
} {
	if (typeof params[0] === 'string') {
		const instance = createClient({
			url: params[0],
		});

		return construct(instance, params[1]) as any;
	}

	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0] as
			& { connection?: Config; client?: TClient }
			& DrizzleConfig<TSchema>;

		if (client) return construct(client, drizzleConfig) as any;

		const instance = typeof connection === 'string' ? createClient({ url: connection }) : createClient(connection!);

		return construct(instance, drizzleConfig) as any;
	}

	return construct(params[0] as TClient, params[1] as DrizzleConfig<TSchema> | undefined) as any;
}

export namespace drizzle {
	export function mock<TSchema extends Record<string, unknown> = Record<string, never>>(
		config?: DrizzleConfig<TSchema>,
	): LibSQLDatabase<TSchema> & {
		$client: '$client is not available on drizzle.mock()';
	} {
		return construct({} as any, config) as any;
	}
}
