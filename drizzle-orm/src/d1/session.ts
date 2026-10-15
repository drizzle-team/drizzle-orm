/// <reference types="@cloudflare/workers-types" />

import type { BatchItem } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/index.ts';
import type { WithCacheConfig } from '~/cache/core/types.ts';
import { entityKind } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { AnyRelations } from '~/relations.ts';
import { type Query, sql } from '~/sql/sql.ts';
import {
	SQLiteAsyncPreparedQuery,
	type SQLiteAsyncPreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteAsyncSession,
	SQLiteAsyncTransaction,
	type SQLiteQueryExecutors,
} from '~/sqlite-core/async/session.ts';
import type { SQLiteDialect } from '~/sqlite-core/dialect.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type { SQLiteExecuteMethod, SQLiteTransactionConfig } from '~/sqlite-core/session.ts';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
	cache?: Cache;
}

export type D1RunResult = D1Result;

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteD1Session<TRelations extends AnyRelations>
	extends SQLiteAsyncSession<'async', D1RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'SQLiteD1Session';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: D1Database | D1DatabaseSession,
		dialect: SQLiteDialect,
		private relations: TRelations,
		private options: SQLiteD1SessionOptions = {},
	) {
		super(dialect, 'async');
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw',
		_prepare: boolean,
		executeMethod?: SQLiteExecuteMethod,
		mapper?: (rows: any[]) => any,
		queryMetadata?: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		},
		cacheConfig?: WithCacheConfig,
	): D1PreparedQuery {
		let stmt: D1PreparedStatement;
		try {
			stmt = this.client.prepare(query.sql);
		} catch (e) {
			throw new DrizzleQueryError(query.sql, query.params, e as Error);
		}
		const executors: SQLiteQueryExecutors<'async'> = {
			all: (params) => {
				if (mode === 'arrays') return stmt.bind(...params).raw();
				return stmt.bind(...params).all().then(({ results }) => results);
			},
			get: (params) => {
				if (mode === 'arrays') return stmt.bind(...params).raw().then((rows) => rows[0]);
				return stmt.bind(...params).first();
			},
			run: (params) => {
				return stmt.bind(...params).run();
			},
			values: (params) => {
				return stmt.bind(...params).raw();
			},
		};
		return new D1PreparedQuery(
			stmt,
			'async',
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
		);
	}

	async batch<T extends BatchItem<'sqlite'>[] | readonly BatchItem<'sqlite'>[]>(queries: T) {
		const preparedQueries: SQLiteAsyncPreparedQuery<any>[] = [];
		const builtQueries: D1PreparedStatement[] = [];

		for (const query of queries) {
			const preparedQuery = query._prepare() as D1PreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			if (builtQuery.params.length > 0) {
				builtQueries.push((preparedQuery as D1PreparedQuery<any>).stmt.bind(...builtQuery.params));
			} else {
				const builtQuery = preparedQuery.getQuery();
				builtQueries.push(
					this.client.prepare(builtQuery.sql).bind(...builtQuery.params),
				);
			}
		}

		const batchResults = await this.client.batch<any>(builtQueries);
		return batchResults.map((result, i) => {
			const { executeMethod, mapper, mode } = preparedQueries[i]!;

			if (executeMethod === 'run') return result;

			let values: any = result.results;
			if (executeMethod === 'values') return d1ToRawMapping(values);
			if (executeMethod === 'get') {
				if (!values[0]) return;

				if (!mapper) return mode === 'arrays' ? d1ToRawMapping([values[0]])[0] : values[0];

				return mapper(mode === 'arrays' ? d1ToRawMapping([values[0]]) : [values[0]])[0];
			}

			values = mode === 'arrays' ? d1ToRawMapping(values) : values;
			if (!mapper) return values;

			return mapper(values);
		});
	}

	override async transaction<T>(
		transaction: (tx: D1Transaction<TRelations>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new D1Transaction('async', this.dialect, this, this.relations, undefined, true);
		await this.run(sql.raw(`begin${config?.behavior ? ' ' + config.behavior : ''}`));
		try {
			const result = await transaction(tx);
			await this.run(sql`commit`);
			return result;
		} catch (err) {
			await this.run(sql`rollback`);
			throw err;
		}
	}
}

export class D1Transaction<TRelations extends AnyRelations>
	extends SQLiteAsyncTransaction<'async', D1RunResult, TRelations>
{
	static override readonly [entityKind]: string = 'D1Transaction';

	override async transaction<T>(
		transaction: (tx: D1Transaction<TRelations>) => Promise<T>,
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new D1Transaction(
			'async',
			this.dialect,
			this.session,
			this._.relations,
			this.nestedIndex + 1,
			this.forbidJsonb,
		);
		await this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = await transaction(tx);
			await this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			await this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
}

/**
 * This function was taken from the D1 implementation: https://github.com/cloudflare/workerd/blob/4aae9f4c7ae30a59a88ca868c4aff88bda85c956/src/cloudflare/internal/d1-api.ts#L287
 * It may cause issues with duplicated column names in join queries, which should be fixed on the D1 side.
 * @param results
 * @returns
 */
function d1ToRawMapping(results: any) {
	const rows: unknown[][] = [];
	for (const row of results) {
		const entry = Object.keys(row).map((k) => row[k]);
		rows.push(entry);
	}
	return rows;
}

export class D1PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLiteAsyncPreparedQuery<
	{ type: 'async'; run: D1Response; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static override readonly [entityKind]: string = 'D1PreparedQuery';

	/** @internal */
	fields?: SelectedFieldsOrdered;

	/** @internal */
	readonly stmt: D1PreparedStatement;

	constructor(
		stmt: D1PreparedStatement,
		resultKind: 'sync' | 'async',
		executeMethod: SQLiteExecuteMethod = 'all',
		executors: SQLiteQueryExecutors<'async'>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw',
		logger: Logger,
		cache: Cache | undefined,
		queryMetadata: {
			type: 'select' | 'update' | 'delete' | 'insert';
			tables: string[];
		} | undefined,
		cacheConfig: WithCacheConfig | undefined,
	) {
		super(
			resultKind,
			executeMethod,
			executors,
			query,
			mapper,
			mode,
			logger,
			cache,
			queryMetadata,
			cacheConfig,
		);

		this.stmt = stmt;
	}
}
