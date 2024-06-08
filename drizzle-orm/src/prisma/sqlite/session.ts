import type { PrismaClient } from '@prisma/client/extension';

import { entityKind } from '~/entity';
import { type Logger, NoopLogger } from '~/logger';
import { fillPlaceholders } from '~/sql';
import type { Query } from '~/sql';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SelectedFieldsOrdered,
	SQLiteAsyncDialect,
	SQLiteExecuteMethod,
	SQLiteTransaction,
	SQLiteTransactionConfig,
} from '~/sqlite-core';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core';

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class PrismaSQLitePreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: unknown; all: T['all']; get: never; values: never; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'PrismaSQLitePreparedQuery';

	constructor(
		private readonly prisma: PrismaClient,
		query: Query,
		private readonly logger: Logger,
		executeMethod: SQLiteExecuteMethod,
	) {
		super('async', executeMethod, query);
	}

	override all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.prisma.$queryRawUnsafe(this.query.sql, ...params);
	}

	override run(placeholderValues?: Record<string, unknown> | undefined): Promise<unknown> {
		return this.all(placeholderValues);
	}

	override get(_placeholderValues?: Record<string, unknown> | undefined): Promise<never> {
		throw new Error('Method not implemented.');
	}

	override values(_placeholderValues?: Record<string, unknown> | undefined): Promise<never> {
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
	static readonly [entityKind]: string = 'PrismaSQLiteSession';

	private readonly logger: Logger;

	constructor(
		private readonly prisma: PrismaClient,
		dialect: SQLiteAsyncDialect,
		options: PrismaSQLiteSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	override prepareQuery<T extends Omit<PreparedQueryConfig, 'run'>>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
	): PrismaSQLitePreparedQuery<T> {
		return new PrismaSQLitePreparedQuery(this.prisma, query, this.logger, executeMethod);
	}

	override transaction<T>(
		_transaction: (tx: SQLiteTransaction<'async', unknown, Record<string, never>, Record<string, never>>) => Promise<T>,
		_config?: SQLiteTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}
