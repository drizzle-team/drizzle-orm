import type { Client, ResultSet } from '@libsql/client';
import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig } from '~/utils.ts';
import { LibSQLSession } from './session.ts';

export class LibSQLDatabase<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', ResultSet, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'LibSQLDatabase';

	/** @internal */
	declare readonly session: LibSQLSession<
		TSchema,
		TRelations,
		V1.ExtractTablesWithRelations<TSchema>
	>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

/** @internal */
export function construct<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
>(
	client: Client,
	config: DrizzleConfig<TSchema, TRelations> = {},
): LibSQLDatabase<TSchema, TRelations> & {
	$client: Client;
} {
	const dialect = new SQLiteAsyncDialect({ casing: config.casing });
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
	const session = new LibSQLSession(client, dialect, relations, schema, { logger, cache: config.cache }, undefined);
	const db = new LibSQLDatabase(
		'async',
		dialect,
		session as LibSQLSession<
			TSchema,
			TRelations,
			V1.ExtractTablesWithRelations<TSchema>
		>,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as LibSQLDatabase<TSchema, TRelations>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}
	return db as any;
}
