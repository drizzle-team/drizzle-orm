import type { PrismaClient } from '@prisma/client/extension';

import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type { PgAsyncTransaction } from '~/pg-core/async/session.ts';
import { PgAsyncPreparedQuery, PgAsyncSession } from '~/pg-core/async/session.ts';
import type { PgDialect } from '~/pg-core/index.ts';
import type { PgQueryResultHKT, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import type { EmptyRelations } from '~/relations.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';

export class PrismaPgPreparedQuery<T> extends PgAsyncPreparedQuery<PreparedQueryConfig & { execute: T }> {
	static override readonly [entityKind]: string = 'PrismaPgPreparedQuery';

	constructor(
		private readonly prisma: PrismaClient,
		query: Query,
		private readonly logger: Logger,
	) {
		super(query, undefined, undefined, undefined);
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

export class PrismaPgSession extends PgAsyncSession {
	static override readonly [entityKind]: string = 'PrismaPgSession';

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

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(query: Query): PgAsyncPreparedQuery<T> {
		return new PrismaPgPreparedQuery(this.prisma, query, this.logger);
	}

	override prepareRelationalQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		// query: Query,
	): PgAsyncPreparedQuery<T> {
		throw new Error('Method not implemented.');
		// return new PrismaPgPreparedQuery(this.prisma, query, this.logger);
	}

	override transaction<T>(
		_transaction: (
			tx: PgAsyncTransaction<
				PgQueryResultHKT,
				Record<string, never>,
				EmptyRelations,
				Record<string, never>
			>,
		) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}

export interface PrismaPgQueryResultHKT extends PgQueryResultHKT {
	type: [];
}
