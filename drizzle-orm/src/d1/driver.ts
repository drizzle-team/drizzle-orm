/// <reference types="@cloudflare/workers-types" />
import type { D1Database as MiniflareD1Database } from '@miniflare/d1';
import * as V1 from '~/_relations.ts';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations, ExtractTablesWithRelations } from '~/relations.ts';
import { BaseSQLiteDatabase } from '~/sqlite-core/db.ts';
import { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleConfig, IfNotImported } from '~/utils.ts';
import { SQLiteD1Session } from './session.ts';

export type AnyD1Database = IfNotImported<
	D1Database,
	MiniflareD1Database,
	D1Database | IfNotImported<MiniflareD1Database, never, MiniflareD1Database>
>;

export class DrizzleD1Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
> extends BaseSQLiteDatabase<'async', D1Result, TSchema, TRelations> {
	static override readonly [entityKind]: string = 'D1Database';

	/** @internal */
	declare readonly session: SQLiteD1Session<
		TSchema,
		TRelations,
		ExtractTablesWithRelations<TRelations>,
		V1.ExtractTablesWithRelations<TSchema>
	>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AnyD1Database = AnyD1Database,
>(
	client: TClient,
	config: DrizzleConfig<TSchema, TRelations> = {},
): DrizzleD1Database<TSchema, TRelations> & {
	$client: TClient;
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

	const relations = config.relations;
	const session = new SQLiteD1Session(client as D1Database, dialect, relations, schema, { logger });
	const db = new DrizzleD1Database(
		'async',
		dialect,
		session as SQLiteD1Session<
			TSchema,
			TRelations,
			ExtractTablesWithRelations<TRelations>,
			V1.ExtractTablesWithRelations<TSchema>
		>,
		relations,
		schema as V1.RelationalSchemaConfig<any>,
	) as DrizzleD1Database<
		TSchema,
		TRelations
	>;
	(<any> db).$client = client;

	return db as any;
}
