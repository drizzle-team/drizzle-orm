import { entityKind } from '~/entity.ts';
import { TransactionRollbackError } from '~/errors.ts';
import type { BlankGelHookContext, DrizzleGelExtension, DrizzleGelHookContext } from '~/extension-core/gel/index.ts';
import type { TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import type { Query, SQL } from '~/sql/index.ts';
import { tracer } from '~/tracing.ts';
import type { NeonAuthToken } from '~/utils.ts';
import { GelDatabase } from './db.ts';
import type { GelDialect } from './dialect.ts';
import type { SelectedFieldsOrdered } from './query-builders/select.types.ts';

export interface PreparedQueryConfig {
	execute: unknown;
	all: unknown;
	values: unknown;
}

export abstract class GelPreparedQuery<T extends PreparedQueryConfig> implements PreparedQuery {
	constructor(
		protected query: Query,
		protected extensions?: DrizzleGelExtension[],
		protected hookContext?: BlankGelHookContext,
	) {}

	protected authToken?: NeonAuthToken;
	private extensionMetas: unknown[] = [];

	getQuery(): Query {
		return this.query;
	}

	mapResult(response: unknown, _isFromBatch?: boolean): unknown {
		return response;
	}

	static readonly [entityKind]: string = 'GelPreparedQuery';

	/** @internal */
	joinsNotNullableMap?: Record<string, boolean>;

	async execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']> {
		const {
			extensions,
			hookContext,
			query: {
				sql: queryString,
				params,
			},
			extensionMetas,
		} = this;
		if (!extensions?.length || !hookContext) return await this._execute(placeholderValues);

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
				} as DrizzleGelHookContext;

				await ext.hook(config);
				extensionMetas[i] = config.metadata;
			}
		});

		const res = await this._execute(placeholderValues);

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

	protected abstract _execute(placeholderValues?: Record<string, unknown>): Promise<T['execute']>;

	/** @internal */
	abstract all(placeholderValues?: Record<string, unknown>): Promise<T['all']>;

	/** @internal */
	abstract isResponseInArrayMode(): boolean;
}

export abstract class GelSession<
	TQueryResult extends GelQueryResultHKT = any, // TO
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> {
	static readonly [entityKind]: string = 'GelSession';

	constructor(protected dialect: GelDialect, readonly extensions?: DrizzleGelExtension[]) {}

	abstract prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		name: string | undefined,
		isResponseInArrayMode: boolean,
		hookContext?: BlankGelHookContext,
		customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => T['execute'],
	): GelPreparedQuery<T>;

	execute<T>(query: SQL): Promise<T> {
		return tracer.startActiveSpan('drizzle.operation', () => {
			const prepared = tracer.startActiveSpan('drizzle.prepareQuery', () => {
				return this.prepareQuery<PreparedQueryConfig & { execute: T }>(
					this.dialect.sqlToQuery(query),
					undefined,
					undefined,
					false,
				);
			});

			return prepared.execute(undefined);
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

	async count(sql: SQL): Promise<number> {
		const res = await this.execute<[{ count: string }]>(sql);

		return Number(
			res[0]['count'],
		);
	}

	abstract transaction<T>(
		transaction: (tx: GelTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export abstract class GelTransaction<
	TQueryResult extends GelQueryResultHKT,
	TFullSchema extends Record<string, unknown> = Record<string, never>,
	TSchema extends TablesRelationalConfig = Record<string, never>,
> extends GelDatabase<TQueryResult, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = 'GelTransaction';

	constructor(
		dialect: GelDialect,
		session: GelSession<any, any, any>,
		protected schema: {
			fullSchema: Record<string, unknown>;
			schema: TSchema;
			tableNamesMap: Record<string, string>;
		} | undefined,
		extensions?: DrizzleGelExtension[],
	) {
		super(dialect, session, schema, extensions);
	}

	rollback(): never {
		throw new TransactionRollbackError();
	}

	abstract override transaction<T>(
		transaction: (tx: GelTransaction<TQueryResult, TFullSchema, TSchema>) => Promise<T>,
	): Promise<T>;
}

export interface GelQueryResultHKT {
	readonly $brand: 'GelQueryResultHKT';
	readonly row: unknown;
	readonly type: unknown;
}

export type GelQueryResultKind<TKind extends GelQueryResultHKT, TRow> = (TKind & {
	readonly row: TRow;
})['type'];
