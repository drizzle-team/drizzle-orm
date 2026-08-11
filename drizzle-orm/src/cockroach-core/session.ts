import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { PreparedQuery } from '~/session.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/index.ts';
import { hasTelemetry, tracer } from '~/tracing.ts';
import { CockroachDatabase } from './db.ts';
import type { CockroachDialect } from './dialect.ts';

export interface PreparedQueryConfig {
	execute: unknown;
}

export abstract class CockroachBasePreparedQuery implements PreparedQuery {
	static readonly [entityKind]: string = 'CockroachBasePreparedQuery';

	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): unknown;
}

export class CockroachPreparedQuery<T extends PreparedQueryConfig> extends CockroachBasePreparedQuery {
	static override readonly [entityKind]: string = 'CockroachPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	private fastPath: boolean;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
	) {
		super(query);
		this.mapper = mapper;
		this.fastPath = !hasTelemetry;
	}

	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper, fastPath } = this;

		if (fastPath) {
			const params = query.params.length === 0
				? query.params
				: fillPlaceholders(query.params, placeholderValues);
			logger.logQuery(query.sql, params);
			const res = executor(params).catch((e) => {
				throw new DrizzleQueryError(query.sql, params, e as Error);
			});
			if (!mapper) return res;

			return res.then((rows) => mapper(rows));
		}

		return tracer.startActiveSpan('drizzle.execute', async (span) => {
			const params = fillPlaceholders(query.params, placeholderValues);

			span?.setAttributes({
				'drizzle.query.text': query.sql,
				'drizzle.query.params': JSON.stringify(params),
			});

			logger.logQuery(query.sql, params);

			const rows = tracer.startActiveSpan('drizzle.driver.execute', async (span) => {
				span?.setAttributes({
					'drizzle.query.text': query.sql,
					'drizzle.query.params': JSON.stringify(params),
				});

				// return await so tracer captures time accurately
				return await executor(params).catch((e) => {
					throw new DrizzleQueryError(query.sql, params, e as Error);
				});
			});

			if (!mapper) return rows;

			return rows.then((rows) => tracer.startActiveSpan('drizzle.mapResponse', () => mapper(rows as unknown[])));
		});
	}
}

export interface CockroachTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class CockroachSession<
	TQueryResult extends CockroachQueryResultHKT = CockroachQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'CockroachSession';

	constructor(protected dialect: CockroachDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		name: string | boolean,
		mapper?: (rows: any[]) => any,
	): CockroachPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					'raw',
					false,
				);
			});

			return prepared.execute();
		});
	}

	arrays<T = unknown>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'arrays',
					false,
				);
			});

			return prepared.execute();
		});
	}

	objects<T = unknown>(query: SQL): Promise<T[]> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T[] }>(
					this.dialect.sqlToQuery(query),
					'objects',
					false,
				);
			});

			return prepared.execute();
		});
	}

	abstract transaction<T>(
		transaction: (tx: CockroachTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: CockroachTransactionConfig,
	): Promise<T>;
}

export abstract class CockroachTransaction<
	TQueryResult extends CockroachQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> extends CockroachDatabase<TQueryResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'CockroachTransaction';

	constructor(
		dialect: CockroachDialect,
		session: CockroachSession<any, any, any>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
	) {
		super(dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: CockroachTransactionConfig): SQL {
		const chunks: string[] = [];
		if (config.isolationLevel) {
			chunks.push(`isolation level ${config.isolationLevel}`);
		}
		if (config.accessMode) {
			chunks.push(config.accessMode);
		}
		if (typeof config.deferrable === 'boolean') {
			chunks.push(config.deferrable ? 'deferrable' : 'not deferrable');
		}
		return sql.raw(chunks.join(' '));
	}

	setTransaction(config: CockroachTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (tx: CockroachTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface CockroachQueryResultHKT {
	readonly $brand: 'CockroachQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type CockroachQueryResultKind<TKind extends CockroachQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
