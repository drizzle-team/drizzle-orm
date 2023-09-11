/// <reference types="@cloudflare/workers-types" />

import type { BatchParameters } from '~/batch.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleError } from '~/errors.ts';
import type { Logger } from '~/logger.ts';
import { NoopLogger } from '~/logger.ts';
import { type RelationalSchemaConfig, type TablesRelationalConfig } from '~/relations.ts';
import { type Query, sql } from '~/sql/index.ts';
import { fillPlaceholders } from '~/sql/index.ts';
import type { SQLiteAsyncDialect } from '~/sqlite-core/dialect.ts';
import { SQLiteDelete, SQLiteInsert, SQLiteSelect, SQLiteTransaction, SQLiteUpdate } from '~/sqlite-core/index.ts';
import { SQLiteRelationalQuery } from '~/sqlite-core/query-builders/query.ts';
import { SQLiteRaw } from '~/sqlite-core/query-builders/raw.ts';
import type { SelectedFieldsOrdered } from '~/sqlite-core/query-builders/select.types.ts';
import {
	type PreparedQueryConfig as PreparedQueryConfigBase,
	type SQLiteExecuteMethod,
	type SQLiteTransactionConfig,
} from '~/sqlite-core/session.ts';
import { PreparedQuery as PreparedQueryBase, SQLiteSession } from '~/sqlite-core/session.ts';
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
	): PreparedQuery {
		const stmt = this.client.prepare(query.sql);
		return new PreparedQuery(stmt, query.sql, query.params, this.logger, fields, executeMethod, customResultMapper);
	}

	private d1ToRawMapping(results: any) {
		const rows: unknown[][] = [];
		for (const row of results) {
			const entry = Object.keys(row).map((k) => row[k]);
			rows.push(entry);
		}
		return rows;
	}

	/*override */ batch<U extends BatchParameters, T extends Readonly<[U, ...U[]]>>(queries: T) {
		const queryToType: (
			| { mode: 'all' }
			| {
				mode: 'all_mapped';
				config: { fields: SelectedFieldsOrdered; joinsNotNullableMap?: Record<string, boolean> };
			}
			| { mode: 'get' }
			| { mode: 'values' }
			| { mode: 'raw' }
			| { mode: 'rqb'; mapper: any }
		)[] = [];

		const builtQueries: D1PreparedStatement[] = queries.map((query) => {
			if (is(query, SQLiteSelect<any, 'async', any, any, any>)) {
				const prepared = query.prepare() as PreparedQuery;
				prepared.fields === undefined
					? queryToType.push({ mode: 'all' })
					: queryToType.push({
						mode: 'all_mapped',
						config: { fields: prepared.fields, joinsNotNullableMap: prepared.joinsNotNullableMap },
					});
				return prepared.stmt.bind(...prepared.params);
			} else if (
				is(query, SQLiteInsert<any, 'async', any, any>) || is(query, SQLiteUpdate<any, 'async', any, any>)
				|| is(query, SQLiteDelete<any, 'async', any, any>)
			) {
				const prepared = query.prepare() as PreparedQuery;
				queryToType.push(
					query.config.returning
						? {
							mode: 'all_mapped',
							config: { fields: query.config.returning },
						}
						: { mode: 'raw' },
				);
				return prepared.stmt.bind(...prepared.params);
			} else if (is(query, SQLiteRaw)) {
				const builtQuery = this.dialect.sqlToQuery(query.getSQL());
				queryToType.push(
					query.config.action === 'run' ? { mode: 'raw' } : { mode: query.config.action },
				);
				return this.client.prepare(builtQuery.sql).bind(...builtQuery.params);
			} else if (is(query, SQLiteRelationalQuery)) {
				const preparedRqb = query.prepare() as PreparedQuery;
				queryToType.push({ mode: 'rqb', mapper: preparedRqb.customResultMapper });
				return preparedRqb.stmt.bind(...preparedRqb.params);
			}
			throw new DrizzleError('You can use only drizzle queries in D1 batch api');
		});

		const res = this.client.batch<any>(builtQueries).then((stmt) =>
			stmt.map(({ results }, index) => {
				const action = queryToType[index]!;
				if (action.mode === 'all') {
					return results![0];
				}
				if (action.mode === 'all_mapped') {
					const mappedRows = this.d1ToRawMapping(results);
					return mappedRows!.map((row) => {
						return mapResultRow(
							action.config.fields,
							row,
							action.config.joinsNotNullableMap,
						);
					});
				}
				if (action.mode === 'get') {
					return results[0] as unknown[];
				}
				if (action.mode === 'values') {
					return this.d1ToRawMapping(results);
				}
				if (action.mode === 'raw') {
					return stmt[index];
				}
				return action.mapper(this.d1ToRawMapping(results));
			})
		);
		return res;
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

export class PreparedQuery<T extends PreparedQueryConfig = PreparedQueryConfig> extends PreparedQueryBase<
	{ type: 'async'; run: D1Result; all: T['all']; get: T['get']; values: T['values']; execute: T['execute'] }
> {
	static readonly [entityKind]: string = 'D1PreparedQuery';

	/** @internal */
	customResultMapper?: (rows: unknown[][], mapColumnValue?: (value: unknown) => unknown) => unknown;

	/** @internal */
	fields?: SelectedFieldsOrdered;

	/** @internal */
	params: unknown[];

	/** @internal */
	stmt: D1PreparedStatement;

	constructor(
		stmt: D1PreparedStatement,
		private queryString: string,
		params: unknown[],
		private logger: Logger,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		customResultMapper?: (rows: unknown[][]) => unknown,
	) {
		super('async', executeMethod);
		this.customResultMapper = customResultMapper;
		this.fields = fields;
		this.stmt = stmt;
		this.params = params;
	}

	run(placeholderValues?: Record<string, unknown>): Promise<D1Result> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).run();
	}

	async all(placeholderValues?: Record<string, unknown>): Promise<T['all']> {
		const { fields, joinsNotNullableMap, queryString, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
			return stmt.bind(...params).all().then(({ results }) => results!);
		}

		const rows = await this.values(placeholderValues);

		if (customResultMapper) {
			return customResultMapper(rows) as T['all'];
		}

		return rows.map((row) => mapResultRow(fields!, row, joinsNotNullableMap));
	}

	async get(placeholderValues?: Record<string, unknown>): Promise<T['get']> {
		const { fields, joinsNotNullableMap, queryString, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(this.params, placeholderValues ?? {});
			logger.logQuery(queryString, params);
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

	values<T extends any[] = unknown[]>(placeholderValues?: Record<string, unknown>): Promise<T[]> {
		const params = fillPlaceholders(this.params, placeholderValues ?? {});
		this.logger.logQuery(this.queryString, params);
		return this.stmt.bind(...params).raw();
	}
}
