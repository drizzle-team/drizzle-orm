import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import { createTableRelationsHelpers, extractTablesRelationalConfig } from '~/relations.ts';
import type { ExtractTablesWithRelations, RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { D1RestSession } from './session.ts';

export interface D1RestCredentials {
	/** The Cloudflare account ID where the D1 database is located */
	accountId: string;
	/** The D1 database ID */
	databaseId: string;
	/** The Cloudflare API token for the account with D1:edit permissions */
	token: string;
}

export interface D1RestResult<T = unknown> {
	rows?: T[];
}

export class D1RestDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', D1RestResult, TSchema> {
	static override readonly [entityKind]: string = 'D1RestDatabase';

	/** @internal */
	declare readonly session: D1RestSession<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export function drizzle<TSchema extends Record<string, unknown> = Record<string, never>>(
	credentials: D1RestCredentials,
	config: DrizzleConfig<TSchema> = {},
): D1RestDatabase<TSchema> & {
	$client: D1RestCredentials;
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

	const session = new D1RestSession(credentials, dialect, schema, { logger, cache: config.cache });
	const db = new D1RestDatabase('async', dialect, session, schema) as D1RestDatabase<TSchema>;
	(db as any).$client = credentials;
	(db as any).$cache = config.cache;
	if ((db as any).$cache) {
		(db as any).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
