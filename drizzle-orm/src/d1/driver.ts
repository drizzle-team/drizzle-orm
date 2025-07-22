/// <reference types="@cloudflare/workers-types" />
import type { D1Database as MiniflareD1Database } from '@miniflare/d1';
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
import type { DrizzleConfig, IfNotImported } from '~/utils.ts';
import { SQLiteD1Session } from './session.ts';

export type AnyD1Database = IfNotImported<
	D1Database,
	MiniflareD1Database,
	D1Database | IfNotImported<MiniflareD1Database, never, MiniflareD1Database>
>;

export class DrizzleD1Database<
	TSchema extends Record<string, unknown> = Record<string, never>,
> extends BaseSQLiteDatabase<'async', D1Result, TSchema> {
	static override readonly [entityKind]: string = 'D1Database';
	private bookmark: D1SessionBookmark | D1SessionConstraint | null;
	private meta: D1Meta | null;

	constructor(...args: ConstructorParameters<typeof BaseSQLiteDatabase<'async', D1Result, TSchema>>) {
		super(...args);
		this.bookmark = null;
		this.meta = null;
	}

	getBookmark(): D1SessionBookmark | D1SessionConstraint | null {
		return this.bookmark ?? null;
	}

	getMeta(): D1Meta | null {
		return this.meta ?? null;
	}

	/** @internal */
	declare readonly session: SQLiteD1Session<TSchema, ExtractTablesWithRelations<TSchema>>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		const result = await this.session.batch(batch) as BatchResponse<T>;
		console.log('Batch results!');
		this.bookmark = this.session.getBookmark();
		this.meta = this.session.getMeta();
		return result;
	}
}

export function drizzle<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TClient extends AnyD1Database = AnyD1Database,
>(
	client: TClient,
	config: DrizzleConfig<TSchema> = {},
	withSession: D1SessionBookmark | D1SessionConstraint | null = null,
): DrizzleD1Database<TSchema> & {
	$client: TClient;
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

	if (withSession === null) {
		withSession = 'disabled';
		console.log("D1 Session is disabled at driver");
	}

	const session = new SQLiteD1Session(client as D1Database, dialect, schema, {
		logger,
		cache: config.cache,
		withSession: withSession,
	});

	const db = new DrizzleD1Database('async', dialect, session, schema) as DrizzleD1Database<TSchema>;
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
