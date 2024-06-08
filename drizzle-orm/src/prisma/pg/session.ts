import type { PrismaClient } from '@prisma/client/extension';

import { entityKind } from '~/entity';
import { type Logger, NoopLogger } from '~/logger';
import type { PgDialect, PgTransaction, PgTransactionConfig, PreparedQueryConfig, QueryResultHKT } from '~/pg-core';
import { PgPreparedQuery, PgSession } from '~/pg-core';
import { fillPlaceholders } from '~/sql';
import type { Query, SQL } from '~/sql';

export class PrismaPgPreparedQuery<T> extends PgPreparedQuery<PreparedQueryConfig & { execute: T }> {
	static readonly [entityKind]: string = 'PrismaPgPreparedQuery';

	constructor(
		private readonly prisma: PrismaClient,
		query: Query,
		private readonly logger: Logger,
	) {
		super(query);
	}

	override execute(placeholderValues?: Record<string, unknown>): Promise<T> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.prisma.$queryRawUnsafe(this.query.sql, ...params);
	}

	override all(): Promise<unknown> {
		throw new Error('Method not implemented.');
	}

	override isResponseInArrayMode(): boolean {
		return false;
	}
}

export interface PrismaPgSessionOptions {
	logger?: Logger;
}

export class PrismaPgSession extends PgSession {
	static readonly [entityKind]: string = 'PrismaPgSession';

	private readonly logger: Logger;

	constructor(
		dialect: PgDialect,
		private readonly prisma: PrismaClient,
		private readonly options: PrismaPgSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }>(this.dialect.sqlToQuery(query)).execute();
	}

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(query: Query): PgPreparedQuery<T> {
		return new PrismaPgPreparedQuery(this.prisma, query, this.logger);
	}

	override transaction<T>(
		_transaction: (tx: PgTransaction<QueryResultHKT, Record<string, never>, Record<string, never>>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}
