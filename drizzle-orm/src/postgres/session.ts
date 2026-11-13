import type { BatchMetrics, Connection, PgType, Pool, PoolQuery, QueryResult, ShapeSpec } from '#postgres';
import { isBrand } from '#postgres/brand';
import type { BatchItem, SettledQueryResult } from '~/batch.ts';
import { type Cache, NoopCache } from '~/cache/core/cache.ts';
import type { QueryMetadata, WithCacheConfig } from '~/cache/core/types.ts';
import type { GetColumnData } from '~/column.ts';
import { entityKind, is } from '~/entity.ts';
import { DrizzleQueryError } from '~/errors.ts';
import { type Logger, NoopLogger } from '~/logger.ts';
import {
	PgAsyncBoundQuery,
	PgAsyncPreparedQuery,
	PgAsyncSession,
	PgAsyncTransaction,
} from '~/pg-core/async/session.ts';
import type { PgColumn } from '~/pg-core/columns/common.ts';
import type { PgDialect } from '~/pg-core/dialect.ts';
import type { PgQueryResultHKT, PgRawRow, PgTransactionConfig, PreparedQueryConfig } from '~/pg-core/session.ts';
import { PgTable } from '~/pg-core/table.ts';
import { preparedStatementName } from '~/query-name-generator.ts';
import type { AnyRelations } from '~/relations.ts';
import { chunkKindOf, chunkKinds, fillPlaceholders, Param, Placeholder, type Query } from '~/sql/sql.ts';
import { type InferInsertModel, Table } from '~/table.ts';
import { usedTablesOf } from '~/used-tables.ts';
import type { Simplify } from '~/utils.ts';
export type PostgresClient = Pool | Connection;

export type PostgresBulkInsertOptions = Pick<
	NonNullable<Parameters<Pool['bulkInsert']>[3]>,
	'chunk' | 'atomic' | 'onProgress' | 'timeout' | 'signal'
>;

export type PostgresBulkUpdateOptions<TBy = PgColumn | readonly [PgColumn, ...PgColumn[]]> =
	& Pick<
		Parameters<Pool['bulkUpdate']>[3],
		'chunk' | 'atomic' | 'onProgress' | 'timeout' | 'signal'
	>
	& {
		by: TBy;
	};

export type PostgresBulkInsertValue<TTable extends PgTable> = InferInsertModel<TTable>;

export type PostgresBulkKeys<TTable extends PgTable, TBy> = {
	[K in keyof TTable['_']['columns'] & string]: TTable['_']['columns'][K] extends
		(TBy extends readonly unknown[] ? TBy[number] : TBy) ? K
		: never;
}[keyof TTable['_']['columns'] & string];

export type PostgresBulkUpdateValue<TTable extends PgTable, TBy> = Simplify<
	& {
		[K in PostgresBulkKeys<TTable, TBy>]: GetColumnData<TTable['_']['columns'][K], 'raw'>;
	}
	& {
		[K in Exclude<keyof InferInsertModel<TTable> & string, PostgresBulkKeys<TTable, TBy>>]?:
			| GetColumnData<TTable['_']['columns'][K]>
			| undefined;
	}
>;

export type PostgresBulkResult = Omit<QueryResult<never>, 'metrics' | 'debug'>;

const bulkTypes: Record<string, PgType> = {
	smallint: 'int2',
	smallserial: 'int2',
	int: 'int4',
	serial: 'int4',
	bigint: 'int8',
	bigserial: 'int8',
	numeric: 'numeric',
	float4: 'float4',
	float8: 'float8',
	bool: 'bool',
	text: 'text',
	varchar: 'varchar',
	char: 'bpchar',
	bytea: 'bytea',
	uuid: 'uuid',
	date: 'date',
	time: 'time',
	timestamp: 'timestamp',
	timestamptz: 'timestamptz',
	interval: 'interval',
	json: 'json',
	jsonb: 'jsonb',
};

export type PostgresBatchOptions = PostgresBatchTransactionOptions & {
	/**
	 * Return the batch's telemetry from the driver as `response.metrics`: each query's metrics plus what the batch
	 * did as a whole, such as its network round trips and how many statements the server parsed or reused.
	 * `true` gives milliseconds as floats, `'ms'` whole milliseconds, `'us'` whole microseconds.
	 */
	metrics?: boolean | 'ms' | 'us';
};

type PostgresBatchTransactionOptions =
	| {
		/** `snapshot` cannot be used with `isolation: 'read uncommitted' | 'read committed'` */
		isolation?: 'serializable' | 'repeatable read' | 'read committed' | 'read uncommitted';
		readOnly?: boolean;
		deferrable?: boolean;
		snapshot?: undefined;
	}
	| {
		/** `snapshot` needs `isolation: 'repeatable read' | 'serializable'` */
		isolation: 'serializable' | 'repeatable read';
		readOnly?: boolean;
		deferrable?: boolean;
		/** Run the transaction on a snapshot exported by another transaction (`pg_export_snapshot()`) */
		snapshot: string;
	};

/**
 * One item of `batch`, `pipeline` or `parallel`: a query builder, a prepared query (`.prepare()`), or a prepared
 * query with bound placeholder values (`.prepare().bind({ … })`). Prepared items run under their statement name,
 * so the server parses them once per connection and reuses the plan.
 */
export type PostgresBatchItem = BatchItem<'pg'> | PgAsyncPreparedQuery<any> | PgAsyncBoundQuery<any>;

/** What one {@link PostgresBatchItem} resolves to, the same value awaiting it on its own would give. */
export type PostgresBatchItemResult<TItem> = TItem extends { readonly _: { readonly result: infer TResult } } ? TResult
	: TItem extends { readonly prepared: { execute(...args: any[]): Promise<infer TResult> } } ? TResult
	: TItem extends { execute(...args: any[]): Promise<infer TResult> } ? TResult
	: never;

export type PostgresBatchResponse<T extends readonly PostgresBatchItem[]> = {
	[K in keyof T]: PostgresBatchItemResult<T[K]>;
};

/** A batch's results together with the driver's telemetry for it, when `metrics` is on. */
export type PostgresBatchResponseWithMetrics<T extends readonly PostgresBatchItem[]> = PostgresBatchResponse<T> & {
	metrics: BatchMetrics;
};

export type PostgresSettledBatchResponse<T extends readonly PostgresBatchItem[]> = {
	[K in keyof T]: SettledQueryResult<PostgresBatchItemResult<T[K]>>;
};

export interface PostgresSessionOptions {
	logger?: Logger;
	cache?: Cache;
	paramsInErrors?: boolean;
}

/** The placeholder values a batch item carries: only a bound prepared query has any. */
function boundValues(item: PostgresBatchItem): Record<string, unknown> | undefined {
	return is(item, PgAsyncBoundQuery) ? item.placeholderValues : undefined;
}

/**
 * A batch item's params as the driver gets them. Placeholders are filled from the item's bound values, and an
 * item that has placeholders but no values throws, the same as `.execute()` without them. Params without any
 * placeholder are passed through as they are, with no copy.
 */
function batchParams(params: unknown[], values: Record<string, unknown> | undefined): unknown[] {
	for (let i = 0; i < params.length; ++i) {
		const p = params[i];
		if (is(p, Placeholder) || (is(p, Param) && is(p.value, Placeholder))) return fillPlaceholders(params, values ?? {});
	}
	return params;
}

export class PostgresSession<
	TRelations extends AnyRelations,
> extends PgAsyncSession<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresSession';

	private logger: Logger;
	private cache: Cache;

	constructor(
		private client: PostgresClient,
		dialect: PgDialect,
		private relations: TRelations,
		private options: PostgresSessionOptions = {},
	) {
		super(dialect);
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}

	prepareQuery<T extends PreparedQueryConfig = PreparedQueryConfig>(
		query: Query,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		name: string | boolean,
		mapper: ((rows: any[]) => any) | undefined,
		queryMetadata?: QueryMetadata,
		cacheConfig?: WithCacheConfig,
		shape?: ShapeSpec,
	) {
		const queryName = typeof name === 'string'
			? name
			: name === true
			? preparedStatementName(query.sql, query.params)
			: undefined;

		const executor = async (params?: unknown[]) => {
			const q = mode === 'arrays'
				? this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'array', shape },
				)
				: this.client.query(
					query.sql,
					params ?? [],
					{ name: queryName, mode: 'object', shape },
				);

			if (mode === 'raw') return q;
			return q.then((r) => r.rows);
		};

		return new PostgresPreparedQuery<T>(
			executor,
			query,
			mapper,
			mode,
			this.logger,
			this.cache,
			queryMetadata,
			cacheConfig,
			shape,
			this.options.paramsInErrors,
			queryName,
		);
	}

	/** Atomic: runs all queries in one transaction on a single pooled connection */
	async batch<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
		options?: PostgresBatchOptions,
	): Promise<any[]> {
		const { pool, prepared, built } = this.buildMulti('batch', queries);
		return pool.batch(built, options).catch((e) => {
			const index = (e as { failedQueryIndex?: unknown } | null)?.failedQueryIndex;
			const query = typeof index === 'number' ? prepared[index] : undefined;
			if (!query) throw e;
			throw this.queryError(query, e, queries[index as number]!);
		}).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;

				response[i] = mapper
					? mapper(result.rows)
					: mode === 'raw'
					? result
					: result.rows;
			}
			if (results.metrics) (response as { metrics?: BatchMetrics }).metrics = results.metrics;

			return response;
		});
	}

	/**
	 * Non-atomic: pipelines all queries on a single pooled connection, each in it's own autocommit
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async pipeline<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('pipeline', queries);
		return pool.pipeline(built).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;
				if (result.status === 'rejected') {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, result.reason, queries[i]!) };
					continue;
				}

				try {
					response[i] = {
						status: 'fulfilled',
						value: mapper
							? mapper(result.value.rows)
							: mode === 'raw'
							? result.value
							: result.value.rows,
					};
				} catch (e) {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, e, queries[i]!) };
				}
			}

			return response;
		});
	}

	/**
	 * Non-atomic: fans queries out across pooled connections concurrently
	 *
	 * Never throws on a query failure: resolves with one `PromiseSettledResult` per query, in input order
	 */
	async parallel<U extends PostgresBatchItem, T extends Readonly<[U, ...U[]]>>(
		queries: T,
	): Promise<SettledQueryResult<any>[]> {
		const { pool, prepared, built } = this.buildMulti('parallel', queries);
		return pool.parallel(built).then((results) => {
			const response = new Array(results.length);
			for (let i = 0; i < results.length; ++i) {
				const { mapper, mode } = prepared[i]!;
				const result = results[i]!;
				if (result.status === 'rejected') {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, result.reason, queries[i]!) };
					continue;
				}

				try {
					response[i] = {
						status: 'fulfilled',
						value: mapper
							? mapper(result.value.rows)
							: mode === 'raw'
							? result.value
							: result.value.rows,
					};
				} catch (e) {
					response[i] = { status: 'rejected', reason: this.queryError(prepared[i]!, e, queries[i]!) };
				}
			}

			return response;
		});
	}

	async bulkInsert(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: PostgresBulkInsertOptions = {},
	): Promise<PostgresBulkResult> {
		if (rows.length === 0) return { rows: [], columns: [], rowCount: 0, command: 'INSERT' };

		const codecs = this.dialect.codecs;
		const tableColumns = table[Table.Symbol.Columns] as Record<string, PgColumn>;
		const entries = Object.entries(tableColumns).filter(([, col]) => !col.shouldDisableInsert());
		const width = entries.length;
		const rowCount = rows.length;

		for (let c = 0; c < width; ++c) {
			const col = entries[c]![1];
			if (codecs.codecsOf(col).castParam) {
				throw new Error(
					`\`bulkInsert\`: column "${col.name}" requires a parameter cast, which bulk operations can't apply`,
				);
			}
		}

		const cells: unknown[][] = new Array(rowCount);
		const definedCount: number[] = new Array(width).fill(0);
		for (let r = 0; r < rowCount; ++r) {
			const source = rows[r]!;
			const row: unknown[] = new Array(width);
			for (let c = 0; c < width; ++c) {
				const [key, col] = entries[c]!;
				let value = source[key];
				if (value === undefined) {
					if (col.defaultFn !== undefined) value = col.defaultFn();
					else if (!col.default && col.onUpdateFn !== undefined) value = col.onUpdateFn();
				}
				if (value === undefined) continue;

				++definedCount[c]!;
				row[c] = bulkParam('bulkInsert', value, col, codecs);
			}
			cells[r] = row;
		}

		// Columns left to the database default in every row are dropped
		const included: number[] = [];
		let uniform = true;
		for (let c = 0; c < width; ++c) {
			const count = definedCount[c]!;
			if (count === 0) continue;
			included.push(c);
			if (count !== rowCount) uniform = false;
		}
		// Every cell is left to the database default - `values (default, ...)` on every column
		if (included.length === 0) {
			uniform = false;
			for (let c = 0; c < width; ++c) included.push(c);
		}

		const columns: Record<string, PgType> = {};
		let unnest = uniform;
		for (const c of included) {
			const col = entries[c]![1];
			const type = bulkType(col);
			if (type === undefined) unnest = false;
			// Only used by the `unnest` path - the `values` one infers parameter types from the target columns
			columns[col.name] = type ?? 'text';
		}

		const driverRows: unknown[][] = new Array(rowCount);
		for (let r = 0; r < rowCount; ++r) {
			const row: unknown[] = new Array(included.length);
			const source = cells[r]!;
			for (let i = 0; i < included.length; ++i) row[i] = source[included[i]!];
			driverRows[r] = row;
		}

		const result = await this.client.bulkInsert(bulkTableName('bulkInsert', table), columns, driverRows, {
			...options,
			defaults: !unnest,
		});
		if (!is(this.cache, NoopCache)) await this.cache.onMutate({ tables: usedTablesOf(table) });

		return result;
	}

	async bulkUpdate(
		table: PgTable,
		rows: readonly Record<string, unknown>[],
		options: PostgresBulkUpdateOptions,
	): Promise<PostgresBulkResult> {
		if (rows.length === 0) return { rows: [], columns: [], rowCount: 0, command: 'UPDATE' };

		const codecs = this.dialect.codecs;
		const tableColumns = table[Table.Symbol.Columns] as Record<string, PgColumn>;
		const tableEntries = Object.entries(tableColumns);
		const rowCount = rows.length;

		const byColumns: readonly PgColumn[] = Array.isArray(options.by) ? options.by : [options.by as PgColumn];
		if (byColumns.length === 0) throw new Error('`bulkUpdate`: `by` must contain at least one column');
		const keyEntries: [string, PgColumn][] = new Array(byColumns.length);
		for (let i = 0; i < byColumns.length; ++i) {
			const byColumn = byColumns[i]!;
			const entry = tableEntries.find(([, col]) => col === byColumn)
				?? tableEntries.find(([, col]) => col.name === byColumn.name);
			if (!entry) throw new Error(`\`bulkUpdate\`: \`by\` column "${byColumn.name}" doesn't belong to the table`);
			keyEntries[i] = entry;
		}
		const keyNames = keyEntries.map(([, col]) => col.name);

		const setEntries = tableEntries.filter(([key, col]) => {
			if (keyNames.includes(col.name)) return false;
			if (col.onUpdateFn !== undefined) return true;
			for (let r = 0; r < rowCount; ++r) if (rows[r]![key] !== undefined) return true;
			return false;
		});
		if (setEntries.length === 0) throw new Error('No values to set');

		const entries = [...keyEntries, ...setEntries];
		const width = entries.length;
		const columns: Record<string, PgType> = {};
		for (let c = 0; c < width; ++c) {
			const col = entries[c]![1];
			const type = bulkType(col);
			if (type === undefined) {
				throw new Error(
					`\`bulkUpdate\`: column "${col.name}" of type "${col.getSQLType()}${
						'[]'.repeat((<any> col).dimensions ?? 0)
					}" can't be sent as an \`unnest\` array`,
				);
			}
			if (codecs.codecsOf(col).castParam) {
				throw new Error(
					`\`bulkUpdate\`: column "${col.name}" requires a parameter cast, which bulk operations can't apply`,
				);
			}
			columns[col.name] = type;
		}

		const driverRows: unknown[][] = new Array(rowCount);
		for (let r = 0; r < rowCount; ++r) {
			const source = rows[r]!;
			const row: unknown[] = new Array(width);
			for (let c = 0; c < width; ++c) {
				const [key, col] = entries[c]!;
				let value = source[key];
				if (value === undefined) {
					if (c < keyEntries.length) {
						throw new Error(`\`bulkUpdate\`: row ${r} is missing key column "${col.name}"`);
					}
					if (col.onUpdateFn === undefined) {
						throw new Error(
							`\`bulkUpdate\`: row ${r} doesn't set column "${col.name}", which other rows set - every row must set the same columns`,
						);
					}
					value = col.onUpdateFn();
				}

				row[c] = bulkParam('bulkUpdate', value, col, codecs);
			}
			driverRows[r] = row;
		}

		const result = await this.client.bulkUpdate(bulkTableName('bulkUpdate', table), columns, driverRows, {
			...options,
			by: keyNames,
		});
		if (!is(this.cache, NoopCache)) await this.cache.onMutate({ tables: usedTablesOf(table) });

		return result;
	}

	private queryError(prepared: PostgresPreparedQuery<any>, cause: unknown, item: PostgresBatchItem): DrizzleQueryError {
		const { sql, params } = prepared.getQuery();
		return new DrizzleQueryError(
			sql,
			this.options.paramsInErrors ? batchParams(params, boundValues(item)) : undefined,
			cause as Error,
		);
	}

	private buildMulti(method: 'batch' | 'pipeline' | 'parallel', queries: Readonly<PostgresBatchItem[]>) {
		const pool = this.client;
		// `instanceof Pool` would load the bundled client for a pool from the standalone package.
		if (!isBrand<Pool>(pool, 'Pool')) throw new Error(`\`${method}\` method is only supported on connection pools!`);

		const prepared: PostgresPreparedQuery<any>[] = new Array(queries.length);
		const built: PoolQuery[] = new Array(queries.length);
		for (let i = 0; i < queries.length; ++i) {
			const item = queries[i]!;
			// A prepared query is used as is, so its statement name reaches the driver; a builder is prepared unnamed.
			const preparedQuery = (is(item, PgAsyncBoundQuery)
				? item.prepared
				: is(item, PgAsyncPreparedQuery)
				? item
				: (item as BatchItem<'pg'>)._prepare()) as PostgresPreparedQuery<any>;
			const builtQuery = preparedQuery.getQuery();
			const params = batchParams(builtQuery.params, boundValues(item));
			prepared[i] = preparedQuery;
			built[i] = preparedQuery.mode === 'arrays'
				? pool.query(builtQuery.sql, params, {
					name: preparedQuery.name,
					mode: 'array',
					shape: preparedQuery.shape,
				})
				: pool.query(builtQuery.sql, params, {
					name: preparedQuery.name,
					mode: 'object',
					shape: preparedQuery.shape,
				});
		}

		return { pool, prepared, built };
	}

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
		config?: PgTransactionConfig | undefined,
	): Promise<T> {
		return this.client.transaction({
			deferrable: config?.deferrable,
			isolation: config?.isolationLevel,
			readOnly: config?.accessMode === 'read only',
		}, async (clTx) => {
			const session = new PostgresSession(clTx, this.dialect, this.relations, this.options);
			const tx = new PostgresTransaction<TRelations>(
				this.dialect,
				session,
				this.relations,
				undefined,
				false,
			);

			if (typeof config?.snapshot === 'string') {
				await tx.execute(tx.setTransactionSnapshotSQL(config.snapshot));
			}

			return transaction(tx);
		});
	}
}

function bulkType(col: PgColumn): PgType | undefined {
	if ((<any> col).dimensions) return;
	const codec = col.codec;
	if (codec === undefined) return;
	const sep = codec.indexOf(':');
	return bulkTypes[sep === -1 ? codec : codec.slice(0, sep)];
}

function bulkTableName(method: string, table: PgTable): string {
	const name = table[PgTable.Symbol.OriginalName];
	const schema = table[PgTable.Symbol.Schema];
	if (name.includes('.') || schema?.includes('.')) {
		throw new Error(`\`${method}\`: table and schema names containing "." are not supported`);
	}

	return schema ? `${schema}.${name}` : name;
}

function bulkParam(method: string, value: unknown, col: PgColumn, codecs: PgDialect['codecs']): unknown {
	if (value === null) return null;
	if (chunkKindOf(value) !== chunkKinds.other) {
		throw new Error(
			`\`${method}\`: column "${col.name}" received an SQL expression, bulk operations only accept values`,
		);
	}

	let mapped: unknown = col.mapToDriverValue.isNoop ? value : col.mapToDriverValue(value);
	if (chunkKindOf(mapped) !== chunkKinds.other) {
		throw new Error(
			`\`${method}\`: column "${col.name}" maps its value to an SQL expression, bulk operations only accept values`,
		);
	}

	const normalize = codecs.codecsOf(col).normalizeParam;
	if (normalize) mapped = normalize(mapped, (<any> col).dimensions);

	return mapped;
}

export class PostgresTransaction<
	TRelations extends AnyRelations,
> extends PgAsyncTransaction<PostgresQueryResultHKT, TRelations> {
	static override readonly [entityKind]: string = 'PostgresTransaction';

	/** @internal */
	declare session: PostgresSession<TRelations>;

	/**
	 * Inserts rows in bulk via driver-side `unnest`, filling `$defaultFn` / `$onUpdateFn` like `tx.insert(...)`
	 *
	 * Falls back to a multi-row `values` insert when cells are left to the database default in some rows only,
	 * or when a column's type can't be sent as an `unnest` array (arrays, enums, custom types, etc.)
	 */
	async bulkInsert<TTable extends PgTable>(
		table: TTable,
		rows: readonly PostgresBulkInsertValue<TTable>[],
		options?: PostgresBulkInsertOptions,
	): Promise<PostgresBulkResult> {
		return this.session.bulkInsert(table, rows, options);
	}

	/**
	 * Updates rows in bulk via driver-side `unnest`, matched by `by` key column(s), filling `$onUpdateFn` like `tx.update(...)`
	 *
	 * Every row must set the same columns, except for the ones filled by `$onUpdateFn`
	 */
	async bulkUpdate<
		TTable extends PgTable,
		TBy extends
			| TTable['_']['columns'][keyof TTable['_']['columns']]
			| readonly [
				TTable['_']['columns'][keyof TTable['_']['columns']],
				...TTable['_']['columns'][keyof TTable['_']['columns']][],
			],
	>(
		table: TTable,
		rows: readonly PostgresBulkUpdateValue<TTable, TBy>[],
		options: PostgresBulkUpdateOptions<TBy>,
	): Promise<PostgresBulkResult> {
		return this.session.bulkUpdate(table, rows, options as PostgresBulkUpdateOptions<any>);
	}

	override async transaction<T>(
		transaction: (tx: PostgresTransaction<TRelations>) => Promise<T>,
	): Promise<T> {
		return this.session.transaction(transaction as any);
	}
}

export type PostgresQueryResult<T> = Omit<QueryResult<T>, 'metrics' | 'debug'>;

export interface PostgresQueryResultHKT extends PgQueryResultHKT {
	type: Simplify<Omit<QueryResult<PgRawRow<this['row']>>, 'metrics' | 'debug'>>;
}

export class PostgresPreparedQuery<T extends PreparedQueryConfig> extends PgAsyncPreparedQuery<T> {
	static override readonly [entityKind]: string = 'PostgresPreparedQuery';

	constructor(
		executor: (params?: unknown[]) => Promise<any>,
		query: Query,
		mapper: ((rows: any[]) => any) | undefined,
		mode: 'arrays' | 'objects' | 'raw' | 'call',
		logger: Logger,
		// cache instance
		cache: Cache | undefined,
		// per query related metadata
		queryMetadata: QueryMetadata | undefined,
		// config that was passed through $withCache
		cacheConfig: WithCacheConfig | undefined,
		readonly shape?: ShapeSpec,
		paramsInErrors?: boolean,
		/** The server-side prepared statement name, when the query was created with `.prepare()` */
		readonly name?: string,
	) {
		super(executor, query, mapper, mode, logger, cache, queryMetadata, cacheConfig, paramsInErrors);
	}
}
