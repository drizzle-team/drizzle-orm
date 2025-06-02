import type { PrismaClient } from '@prisma/client/extension';

import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type {
	PgDialect,
	PgQueryResultHKT,
	PgTransaction,
	PgTransactionConfig,
	PreparedQueryConfig,
} from '~/pg-core/index.ts';
import { PgPreparedQuery, PgSession } from '~/pg-core/index.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import { fillPlaceholders } from '~/sql/sql.ts';

export class PrismaPgPreparedQuery<T> extends PgPreparedQuery<PreparedQueryConfig & { execute: T }> {
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

export class PrismaPgSession extends PgSession {
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

	override prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(query: Query): PgPreparedQuery<T> {
		return new PrismaPgPreparedQuery(this.prisma, query, this.logger);
	}

	override transaction<T>(
		_transaction: (tx: PgTransaction<PgQueryResultHKT, Record<string, never>, Record<string, never>>) => Promise<T>,
		_config?: PgTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}

export interface PrismaPgQueryResultHKT extends PgQueryResultHKT {
	type: [];
}
