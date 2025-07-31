import type { PrismaClient } from '@prisma/client/extension';

import { entityKind } from '~/entity.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import type {
	MySqlDialect,
	MySqlPreparedQueryConfig,
	MySqlPreparedQueryHKT,
	MySqlQueryResultHKT,
	MySqlTransaction,
	MySqlTransactionConfig,
} from '~/mysql-core/index.ts';
import { MySqlPreparedQuery, MySqlSession } from '~/mysql-core/index.ts';
import type { EmptyRelations } from '~/relations.ts';
import { fillPlaceholders } from '~/sql/sql.ts';
import type { Query, SQL } from '~/sql/sql.ts';
import type { Assume } from '~/utils.ts';

export class PrismaMySqlPreparedQuery<T> extends MySqlPreparedQuery<MySqlPreparedQueryConfig & { execute: T }> {
	override iterator(_placeholderValues?: Record<string, unknown> | undefined): AsyncGenerator<unknown, any, unknown> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'PrismaMySqlPreparedQuery';

	constructor(
		private readonly prisma: PrismaClient,
		private readonly query: Query,
		private readonly logger: Logger,
	) {
		super(undefined, undefined, undefined);
	}

	override execute(placeholderValues?: Record<string, unknown>): Promise<T> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.prisma.$queryRawUnsafe(this.query.sql, ...params);
	}
}

export interface PrismaMySqlSessionOptions {
	logger?: Logger;
}

export class PrismaMySqlSession extends MySqlSession {
	static override readonly [entityKind]: string = 'PrismaMySqlSession';

	private readonly logger: Logger;

	constructor(
		dialect: MySqlDialect,
		private readonly prisma: PrismaClient,
		private readonly options: PrismaMySqlSessionOptions,
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	override execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<MySqlPreparedQueryConfig & { execute: T }>(this.dialect.sqlToQuery(query)).execute();
	}

	override all<T = unknown>(_query: SQL): Promise<T[]> {
		throw new Error('Method not implemented.');
	}

	override prepareQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
		query: Query,
	): MySqlPreparedQuery<T> {
		return new PrismaMySqlPreparedQuery(this.prisma, query, this.logger);
	}

	override prepareRelationalQuery<T extends MySqlPreparedQueryConfig = MySqlPreparedQueryConfig>(
		// query: Query,
	): MySqlPreparedQuery<T> {
		throw new Error('Method not implemented');
		// return new PrismaMySqlPreparedQuery(this.prisma, query, this.logger);
	}

	override transaction<T>(
		_transaction: (
			tx: MySqlTransaction<
				PrismaMySqlQueryResultHKT,
				PrismaMySqlPreparedQueryHKT,
				Record<string, never>,
				EmptyRelations,
				Record<string, never>
			>,
		) => Promise<T>,
		_config?: MySqlTransactionConfig,
	): Promise<T> {
		throw new Error('Method not implemented.');
	}
}

export interface PrismaMySqlQueryResultHKT extends MySqlQueryResultHKT {
	type: [];
}

export interface PrismaMySqlPreparedQueryHKT extends MySqlPreparedQueryHKT {
	type: PrismaMySqlPreparedQuery<Assume<this['config'], MySqlPreparedQueryConfig>>;
}
