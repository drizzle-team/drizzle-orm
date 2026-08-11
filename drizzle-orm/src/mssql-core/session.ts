import type * as V1 from '~/_relations.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError, TransactionRollbackError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import type { PreparedQuery as PreparedQueryBase } from '~/session.ts';
import { fillPlaceholders, type Query, type SQL, sql } from '~/sql/sql.ts';
import type { Assume, Equal } from '~/utils.ts';
import { MsSqlDatabase } from './db.ts';
import type { MsSqlDialect } from './dialect.ts';

export interface QueryResultHKT {
	readonly $brand: 'MsSqlQueryRowHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export interface AnyQueryResultHKT extends QueryResultHKT {
	readonly type: any;
}

export type QueryResultKind<TKind extends QueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];

export interface PreparedQueryConfig {
	execute: unknown;
	iterator: unknown;
}

export interface PreparedQueryHKT {
	readonly $brand: 'MsSqlPreparedQueryHKT';
	readonly config: unknown;
	readonly type: unknown;
}

export type PreparedQueryKind<
	TKind extends PreparedQueryHKT,
	TConfig extends PreparedQueryConfig,
	TAssume extends boolean = false,
> = Equal<TAssume, true> extends true
	? Assume<(TKind & { readonly config: TConfig })['type'], MsSqlBasePreparedQuery<TConfig>>
	: (TKind & { readonly config: TConfig })['type'];

export abstract class MsSqlBasePreparedQuery<T extends PreparedQueryConfig> implements PreparedQueryBase {
	static readonly [entityKind]: string = 'MsSqlBasePreparedQuery';

	constructor(
		protected query: Query,
	) {}

	getQuery(): Query {
		return this.query;
	}

	abstract execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	abstract iterator(placeholderValues?: Record<string, unknown>): AsyncGenerator<T['iterator']>;
}

export class MsSqlPreparedQuery<T extends PreparedQueryConfig> extends MsSqlBasePreparedQuery<T> {
	static override readonly [entityKind]: string = 'MsSqlPreparedQuery';

	/** @internal */
	readonly mapper: {
		(rows: any[]): any;
		body?: string;
	} | undefined;

	constructor(
		protected executor: (params?: unknown[]) => Promise<any>,
		protected _iterator: ((params?: unknown[]) => AsyncGenerator<any>) | undefined,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		readonly mode: 'arrays' | 'objects' | 'raw',
		protected logger: Logger,
	) {
		super(query);
		this.mapper = mapper;
	}

	override async execute(placeholderValues: Record<string, unknown> = {}): Promise<T['execute']> {
		const { query, logger, executor, mapper } = this;
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

	override async *iterator(placeholderValues: Record<string, unknown> = {}): AsyncGenerator<T['iterator']> {
		const { query, logger, executor, _iterator, mapper } = this;
		const params = query.params.length === 0
			? query.params
			: fillPlaceholders(query.params, placeholderValues);
		logger.logQuery(query.sql, params);

		if (_iterator) {
			try {
				if (mapper) {
					for await (const row of _iterator(params)) {
						const mapped = mapper([row]);
						yield Array.isArray(mapped) ? mapped[0] : mapped;
					}

					return;
				}

				for await (const row of _iterator(params)) {
					yield row as Awaited<T['iterator']>;
				}

				return;
			} catch (e) {
				throw new DrizzleQueryError(query.sql, params, e as Error);
			}
		}

		// Fallback for compatibility between drivers
		const rows = await executor(params).catch((e) => {
			throw new DrizzleQueryError(query.sql, params, e as Error);
		});

		if (mapper) {
			for (const row of rows) {
				const mapped = mapper([row]);
				yield Array.isArray(mapped) ? mapped[0] : mapped;
			}

			return;
		}

		for (const row of rows) {
			yield row;
		}
	}
}

export interface MsSqlTransactionConfig {
	isolationLevel: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable' | 'snapshot';
}

export abstract class MsSqlSession<
	TQueryResult extends QueryResultHKT = QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase = PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'MsSqlSession';

	constructor(protected dialect: MsSqlDialect) {}

	abstract prepareQuery<T extends PreparedQueryConfig, TPreparedQueryHKT extends PreparedQueryHKT>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		mapper?: (rows: any[]) => any,
	): PreparedQueryKind<TPreparedQueryHKT, T>;

	execute<T>(query: SQL): Promise<T> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'raw',
		).execute();
	}

	arrays<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T[] }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'arrays',
		).execute();
	}

	objects<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { execute: T[] }, PreparedQueryHKTBase>(
			this.dialect.sqlToQuery(query),
			'objects',
		).execute();
	}

	abstract transaction<T>(
		transaction: (tx: MsSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
		config?: MsSqlTransactionConfig,
	): Promise<T>;

	protected getSetTransactionSQL(config: MsSqlTransactionConfig): SQL | undefined {
		const parts: string[] = [];

		if (config.isolationLevel) {
			parts.push(`isolation level ${config.isolationLevel}`);
		}

		return parts.length ? sql`set transaction ${sql.raw(parts.join(' '))}` : undefined;
	}

	protected getStartTransactionSQL(_config: MsSqlTransactionConfig): SQL | undefined {
		return sql`begin transaction`;
	}
}

export abstract class MsSqlTransaction<
	TQueryResult extends QueryResultHKT,
	TPreparedQueryHKT extends PreparedQueryHKTBase,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends V1.TablesRelationalConfig = Record<string, never>,
> extends MsSqlDatabase<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'MsSqlTransaction';

	constructor(
		dialect: MsSqlDialect,
		session: MsSqlSession,
		protected schema: V1.RelationalSchemaConfig<TSchema> | undefined,
		protected readonly nestedIndex: number,
	) {
		super(dialect, session, schema);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** Nested transactions (aka savepoints) only work with InnoDB engine. */
	abstract override transaction<T>(
		transaction: (tx: MsSqlTransaction<TQueryResult, TPreparedQueryHKT, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PreparedQueryHKTBase extends PreparedQueryHKT {
	type: MsSqlBasePreparedQuery<Assume<this['config'], PreparedQueryConfig>>;
}
