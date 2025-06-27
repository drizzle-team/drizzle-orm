import type { PrismaClient } from '@prisma/client/extension';
import type { WithCacheConfig } from '~/cache/core/types.ts';

import { entityKind } from '~/entity.ts';
import type { BlankSQLiteHookContext, DrizzleSQLiteExtension } from '~/extension-core/sqlite/index.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { Query } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SelectedFieldsOrdered,
	SQLiteAsyncDialect,
	SQLiteExecuteMethod,
	SQLiteTransaction,
	SQLiteTransactionConfig,
} from '~/sqlite-core/index.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/index.ts';

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class PrismaSQLitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: []; all: T['all']; get: T['get']; values: never; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'PrismaSQLitePreparedQuery';

	constructor(
		private readonly prisma: PrismaClient,
		query: Query,
		private readonly logger: Logger,
		executeMethod: SQLiteExecuteMethod,
		extensions?: DrizzleSQLiteExtension[],
		hookContext?: BlankSQLiteHookContext,
	) {
		super('async', executeMethod, query, undefined, undefined, undefined, extensions, hookContext);
	}

	override _all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.prisma.$queryRawUnsafe(this.query.sql, ...params);
	}

	override async _run(placeholderValues?: Record<string, unknown> | undefined): Promise<[]> {
		await this.all(placeholderValues);
		return [];
	}

	override async _get(placeholderValues?: Record<string, unknown> | undefined): Promise<T['get']> {
		const all = await this.all(placeholderValues) as unknown[];
		return all[0];
	}

	override _values(_placeholderValues?: Record<string, unknown> | undefined): Promise<never> {
		throw new Error('Method not implemented.');
	}

	override isResponseInArrayMode(): boolean {
		return false;
	}
}

export interface PrismaSQLiteSessionOptions {
	logger?: Logger;
}

export class PrismaSQLiteSession extends SQLiteSession<'async', unknown, Record<string, never>, Record<string, never>> {
	static override readonly [entityKind]: string = 'PrismaSQLiteSession';

	private readonly logger: Logger;

	constructor(
		private readonly prisma: PrismaClient,
		dialect: SQLiteAsyncDialect,
		options: PrismaSQLiteSessionOptions,
		extensions?: DrizzleSQLiteExtension[],
	) {
		super(dialect, extensions);
		this.logger = options.logger ?? new NoopLogger();
	}

	override prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		isResponseInArrayMode?: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
		hookContext?: undefined,
	): PrismaSQLitePreparedQuery<T> {
		return new PrismaSQLitePreparedQuery(this.prisma, query, this.logger, executeMethod, this.extensions, hookContext);
	}

	override transaction<T>(
		_transaction: (tx: SQLiteTransaction<'async', unknown, Record<string, never>, Record<string, never>>) => Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}
