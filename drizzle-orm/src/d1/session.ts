/// <reference types="@cloudflare/workers-types" />

import type { BatchItem } from '~/batch.ts';
import { entityKind } from '~/entity.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import type { RelationalSchemaConfig, TablesRelationalConfig } from '~/relations.ts';
import type { PreparedQuery } from '~/session.ts';
import { type Query, sql, fillPlaceholders } from '~/sql/sql.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteTransaction } from '~/sqlite-core/index.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import type {
	PreparedQueryConfig as PreparedQueryConfigBase,
	SQLiteExecuteMethod,
	SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { SQLitePreparedQuery, SQLiteSession } from '~/sqlite-core/session.ts';
import { mapResultRow } from '~/utils.ts';

export interface SQLiteD1SessionOptions {
	logger?: Logger;
}

type PreparedQueryConfig = Omit<PreparedQueryConfigBase, 'statement' | 'run'>;

export class SQLiteD1Session<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<'async', D1Result, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'SQLiteD1Session';

	private logger: Logger;

	constructor(
		private client: D1Database,
		dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: SQLiteD1SessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
	}

	prepareQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	): D1PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new D1PreparedQuery(stmt, query, this.logger, fields, executeMethod, customResultMapper);
	}

	/*override */ async batch<U extends BatchItem, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const preparedQueries: PreparedQuery[] = [];
		const builtQueries: D1PreparedStatement[] = [];

		for (const query of queries) {
			const preparedQuery = query.prepare();
			const builtQuery = preparedQuery.getQuery();
			preparedQueries.push(preparedQuery);
			if (builtQuery.params.length > 0) {
				builtQueries.push((preparedQuery as D1PreparedQuery).stmt.bind(...builtQuery.params));
			} else {
				const builtQuery = preparedQuery.getQuery();
				builtQueries.push(
					this.client.prepare(builtQuery.sql).bind(...builtQuery.params),
				);
			}
		}

		// const queryToType: (
		// 	| { mode: 'all' }
		// 	| {
		// 		mode: 'all_mapped';
		// 		config: { fields: SelectedFieldsOrdered; joinsNotNullableMap?: Record<string, boolean> };
		// 	}
		// 	| { mode: 'get' }
		// 	| { mode: 'values' }
		// 	| { mode: 'raw' }
		// 	| { mode: 'rqb'; mapper: any }
		// )[] = [];

		// const builtQueries: D1PreparedStatement[] = queries.map((query) => {
		// 	if (is(query, SQLiteSelectBase<any, 'async', any, any, any>)) {
		// 		const prepared = query.prepare() as D1PreparedQuery;
		// 		prepared.fields === undefined
		// 			? queryToType.push({ mode: 'all' })
		// 			: queryToType.push({
		// 				mode: 'all_mapped',
		// 				config: { fields: prepared.fields, joinsNotNullableMap: prepared.joinsNotNullableMap },
		// 			});
		// 		return prepared.stmt.bind(...prepared.params);
		// 	} else if (
		// 		is(query, SQLiteInsertBase<any, 'async', any, any>) || is(query, SQLiteUpdateBase<any, 'async', any, any>)
		// 		|| is(query, SQLiteDeleteBase<any, 'async', any, any>)
		// 	) {
		// 		const prepared = query.prepare() as D1PreparedQuery;
		// 		queryToType.push(
		// 			query.config.returning
		// 				? {
		// 					mode: 'all_mapped',
		// 					config: { fields: query.config.returning },
		// 				}
		// 				: { mode: 'raw' },
		// 		);
		// 		return prepared.stmt.bind(...prepared.params);
		// 	} else if (is(query, SQLiteRaw)) {
		// 		const builtQuery = this.dialect.sqlToQuery(query.getSQL());
		// 		queryToType.push(
		// 			query.config.action === 'run' ? { mode: 'raw' } : { mode: query.config.action },
		// 		);
		// 		return this.client.prepare(builtQuery.sql).bind(...builtQuery.params);
		// 	} else if (is(query, SQLiteRelationalQuery)) {
		// 		const preparedRqb = query.prepare() as D1PreparedQuery;
		// 		queryToType.push({ mode: 'rqb', mapper: preparedRqb.customResultMapper });
		// 		return preparedRqb.stmt.bind(...preparedRqb.params);
		// 	}
		// 	throw new DrizzleError({ message: 'You can use only drizzle queries in D1 batch API' });
		// });

		const batchResults = await this.client.batch<any>(builtQueries);
		return batchResults.map((result, i) => preparedQueries[i]!.mapResult(result, true));

		// const res = this.client.batch<any>(builtQueries).then((stmt) =>
		// 	stmt.map(({ results }, index) => {
		// 		const action = queryToType[index]!;
		// 		if (action.mode === 'all') {
		// 			return results;
		// 		}
		// 		if (action.mode === 'all_mapped') {
		// 			const mappedRows = this.d1ToRawMapping(results);
		// 			return mappedRows!.map((row) => {
		// 				return mapResultRow(
		// 					action.config.fields,
		// 					row,
		// 					action.config.joinsNotNullableMap,
		// 				);
		// 			});
		// 		}
		// 		if (action.mode === 'get') {
		// 			return results![0] as unknown[];
		// 		}
		// 		if (action.mode === 'values') {
		// 			return this.d1ToRawMapping(results);
		// 		}
		// 		if (action.mode === 'raw') {
		// 			return stmt[index];
		// 		}
		// 		return action.mapper(this.d1ToRawMapping(results));
		// 	})
		// );
		// return res;
	}

	override extractRawAllValueFromBatchResult(_result: unknown): unknown {
		return (_result as D1Result).results;
	}

	override extractRawGetValueFromBatchResult(result: unknown): unknown {
		return (result as D1Result).results[0];
	}

	override extractRawValuesValueFromBatchResult(result: unknown): unknown {
		return d1ToRawMapping((result as D1Result).results);
	}

	override async transaction<T>(
		transaction: (tx: D1Transaction<TFullSchema, TSchema>) => T | Promise<T>,
		config?: SQLiteTransactionConfig,
	): Promise<T> {
		const tx = new D1Transaction('async', this.dialect, this, this.schema);
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

export class D1Transaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<'async', D1Result, TFullSchema, TSchema> {
	static readonly [entityKind]: string = 'D1Transaction';

	override async transaction<T>(transaction: (tx: D1Transaction<TFullSchema, TSchema>) => Promise<T>): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new D1Transaction('async', this.dialect, this.session, this.schema, this.nestedIndex + 1);
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

export class D1PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends SQLitePreparedQuery<
	{ type: 'async'; run: D1Result; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'D1PreparedQuery';

	/** @internal */
	customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

	/** @internal */
	fields?: SelectedFieldsOrdered;

	/** @internal */
	stmt: D1PreparedStatement;

	constructor(
		stmt: D1PreparedStatement,
		query: Query,
		private logger: Logger,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod, query);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
		this.stmt = stmt;
	}

	run(placeholderValues?: Record<string, unknown>): Promise<D1Result> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.stmt.bind(...params).run();
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return stmt.bind(...params).all().then(({ results }) => this.mapAllResult(results!));
		}

		const rows = await this.values(placeholderValues);

		return this.mapAllResult(rows);
	}

	override mapAllResult(rows: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			rows = d1ToRawMapping((rows as D1Result).results);
		}

		if (!this.fields && !this.customResultMapper) {
			return rows;
		}

		if (this.customResultMapper) {
			return this.customResultMapper(rows as unknown[][]);
		}

		return (rows as unknown[][]).map((row) => mapResultRow(this.fields!, row, this.joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return stmt.bind(...params).all().then(({ results }) => results![0]);
		}

		const rows = await this.values(placeholderValues);

		if (!rows[0]) {
			return undefined;
		}

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return mapResultRow(fields!, rows[0], joinsNotNullableMap);
	}

	override mapGetResult(result: unknown, isFromBatch?: boolean): unknown {
		if (isFromBatch) {
			result = d1ToRawMapping((result as D1Result).results)[0];
		}

		if (!this.fields && !this.customResultMapper) {
			return result;
		}

		if (this.customResultMapper) {
			return this.customResultMapper([result as unknown[]]) as T['all'];
		}

		return mapResultRow(this.fields!, result as unknown[], this.joinsNotNullableMap);
	}

	values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.stmt.bind(...params).raw();
	}
}
