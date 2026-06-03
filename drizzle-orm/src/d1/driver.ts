/// <reference types="@cloudflare/workers-types" />
import type { D1Database as MiniflareD1Database } from '@miniflare/d1';
import type { BatchItem, BatchResponse } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import { DefaultLogger } from '~/logger.ts';
import type { AnyRelations, EmptyRelations } from '~/relations.ts';
import { SQLiteAsyncDatabase } from '~/sqlite-core/async/db.ts';
import { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { DrizzleSQLiteConfig } from '~/sqlite-core/utils.ts';
import type { IfNotImported } from '~/utils.ts';
import { type D1RunResult, SQLiteD1Session } from './session.ts';

export type AnyD1Database = IfNotImported<
	D1Database,
	MiniflareD1Database,
	| D1Database
	| IfNotImported<D1DatabaseSession, never, D1DatabaseSession>
	| IfNotImported<MiniflareD1Database, never, MiniflareD1Database>
>;

export class DrizzleD1Database<TRelations extends AnyRelations = EmptyRelations>
	extends SQLiteAsyncDatabase<'async', D1RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'D1Database';

	/** @internal */
	declare readonly session: SQLiteD1Session<TRelations>;

	async batch<U extends BatchItem<'sqlite'>, T extends Readonly<[U, ...U[]]>>(
		batch: T,
	): Promise<BatchResponse<T>> {
		return this.session.batch(batch) as Promise<BatchResponse<T>>;
	}
}

export function drizzle<
	TRelations extends AnyRelations = EmptyRelations,
	TClient extends AnyD1Database = AnyD1Database,
>(
	client: TClient,
	config: Omit<DrizzleSQLiteConfig<TRelations>, 'jit'> = {},
): DrizzleD1Database<TRelations> & {
	$client: TClient;
} {
	const dialect = new SQLiteDialect();
	let logger;
	if (config.logger === true) {
		logger = new DefaultLogger();
	} else if (config.logger !== false) {
		logger = config.logger;
	}

	const relations = config.relations ?? {} as TRelations;
	const session = new SQLiteD1Session(client as D1Database, dialect, relations, {
		logger,
		cache: config.cache,
	});
	const db = new DrizzleD1Database(
		'async',
		dialect,
		session,
		relations,
		true,
	);
	(<any> db).$client = client;
	(<any> db).$cache = config.cache;
	if ((<any> db).$cache) {
		(<any> db).$cache['invalidate'] = config.cache?.onMutate;
	}

	return db as any;
}
