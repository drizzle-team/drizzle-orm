import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { BlankPgHookContext, DrizzlePgExtension, DrizzlePgHookContext } from '~/extension-core/pg/index.ts';
import type { TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, type SQL, sql } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';
import { PgDatabase } from './db.ts';
import type { PgDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class PgPreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(
		protected query: Query,
		protected extensions?: DrizzlePgExtension[],
		protected hookContext?: BlankPgHookContext,
	) {}

	protected authToken?: NeonAuthToken;
	private extensionMetas: unknown[] = [];

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	/** @internal */
	setToken(token?: NeonAuthToken) {
		this.authToken = token;
		return this;
	}

	static readonly [entityKind]: string = 'PgPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	async execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;
	/** @internal */
	async execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']>;
	/** @internal */
	async execute(placeholderValues?: Record<string, unknown>, token?: NeonAuthToken): Promise<T['execute']> {
		const {
			extensions,
			hookContext,
			query: {
				sql: queryString,
				params,
			},
			extensionMetas,
		} = this;
		if (!extensions?.length || !hookContext) return await this._execute(placeholderValues, token);

		await tracer.startActiveSpan('drizzle.hooks.beforeExecute', async () => {
			for (const [i, extension] of extensions.entries()) {
				const ext = extension!;
				const config = {
					...hookContext,
					stage: 'before',
					sql: queryString,
					params: params,
					placeholders: placeholderValues,
					metadata: extensionMetas[i],
				} as DrizzlePgHookContext;

				await ext.hook(config);
				extensionMetas[i] = config.metadata;
			}
		});

		const res = await this._execute(placeholderValues, token);

		return await tracer.startActiveSpan('drizzle.hooks.afterExecute', async () => {
			for (const [i, ext] of extensions.entries()) {
				await ext.hook({
					...hookContext,
					metadata: extensionMetas[i],
					stage: 'after',
					data: res as unknown[],
				});
			}

			return res;
		});
	}

	protected abstract _execute(
		placeholderValues?: Record<string, unknown>,
		token?: NeonAuthToken,
	): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export interface PgTransactionConfig {
	isolationLevel?: 'read uncommitted' | 'read committed' | 'repeatable read' | 'serializable';
	accessMode?: 'read only' | 'read write';
	deferrable?: boolean;
}

export abstract class PgSession<
	TQueryResult extends PgQueryResultHKT = PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'PgSession';

	constructor(protected dialect: PgDialect, readonly extensions?: DrizzlePgExtension[]) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		hookContext?: BlankPgHookContext,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): PgPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T>;
	/** @internal */
	execute<T>(query: SQL, token?: NeonAuthToken): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.setToken(token).execute(undefined, token);
		});
	}

	all<T = unknown>(query: SQL): Promise<T[]> {
		return this.prepareQuery<PreparedQueryConfig & { all: T[] }>(
			this.dialect.sqlToQuery(query),
			undefined,
			undefined,
			false,
		).all();
	}

	async count(sql: SQL): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number>;
	/** @internal */
	async count(sql: SQL, token?: NeonAuthToken): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql, token);

		return Number(
			res[0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
		config?: PgTransactionConfig,
	): Promise<T>;
}

export abstract class PgTransaction<
	TQueryResult extends PgQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends PgDatabase<TQueryResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'PgTransaction';

	constructor(
		dialect: PgDialect,
		session: PgSession<any, any, any>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		protected readonly nestedIndex = 0,
		extensions?: DrizzlePgExtension[],
	) {
		super(dialect, session, schema, extensions);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	/** @internal */
	getTransactionConfigSQL(config: PgTransactionConfig): SQL {
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

	setTransaction(config: PgTransactionConfig): Promise<void> {
		return this.session.execute(sql`set transaction ${this.getTransactionConfigSQL(config)}`);
	}

	abstract override transaction<T>(
		transaction: (tx: PgTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface PgQueryResultHKT {
	readonly $brand: 'PgQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type PgQueryResultKind<TKind extends PgQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
