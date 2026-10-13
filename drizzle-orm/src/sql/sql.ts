import type { CasingCache } from '~/casing.ts';
import { ChunkKind, chunkKind, entityKind, is } from '~/entity.ts';
import type { SelectResult } from '~/query-builders/select.types.ts';
import { Subquery } from '~/subquery.ts';
import { TableName } from '~/table.utils.ts';
import { tracer } from '~/tracing.ts';
import type { Assume, Equal } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { AnyColumn } from '../column.ts';
import { Column } from '../column.ts';
import { IsAlias, OriginalName, Table, TableColumns, TableSchema } from '../table.ts';

/**
 * This class is used to indicate a primitive param value that is used in `sql` tag.
 * It is only used on type level and is never instantiated at runtime.
 * If you see a value of this type in the code, its runtime value is actually the primitive param value.
 */
export class FakePrimitiveParam {
	static readonly [entityKind]: string = 'FakePrimitiveParam';
}

export type Chunk =
	| string
	| Table
	| View
	| AnyColumn
	| Name
	| Param
	| Placeholder
	| SQL;

export interface BuildQueryConfig {
	casing: CasingCache;
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
	escapeString(str: string): string;
	prepareTyping?: (encoder: DriverValueEncoder<unknown, unknown>) => QueryTypingsValue;
	paramStartIndex?: { value: number };
	inlineParams?: boolean;
	invokeSource?: 'indexes' | 'mssql-check' | 'mssql-view-with-schemabinding' | undefined;
}

export type QueryTypingsValue = 'json' | 'decimal' | 'time' | 'timestamp' | 'uuid' | 'date' | 'none';

export interface Query {
	sql: string;
	params: unknown[];
}

export interface QueryWithTypings extends Query {
	typings?: QueryTypingsValue[];
}

/**
 * Any value that implements the `getSQL` method. The implementations include:
 * - `Table`
 * - `Column`
 * - `View`
 * - `Subquery`
 * - `SQL`
 * - `SQL.Aliased`
 * - `Placeholder`
 * - `Param`
 */
export interface SQLWrapper<T = unknown> {
	getSQL(): SQL<T>;
	shouldOmitSQLParens?(): boolean;
}

export function isSQLWrapper(value: unknown): value is SQLWrapper {
	return value !== null && value !== undefined && typeof (value as any).getSQL === 'function';
}

/** @internal Mutable accumulator used during SQL serialization to avoid intermediate object allocations. */
interface QueryAccumulator {
	sqlParts: string[];
	params: unknown[];
	typings: QueryTypingsValue[] | undefined;
}

function accPushTyping(acc: QueryAccumulator, typing: QueryTypingsValue): void {
	if (!acc.typings) {
		acc.typings = [];
	}
	acc.typings.push(typing);
}

/**
 * @internal Reusable paramStartIndex wrapper, reset at the top of each toQuery() call.
 * Safe because toQuery/buildChunks is fully synchronous and non-reentrant for a given SQL tree.
 */
const defaultParamStartIndex: { value: number } = { value: 0 };

export class StringChunk implements SQLWrapper {
	static readonly [entityKind]: string = 'StringChunk';

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.StringChunk;
	readonly value: string;

	constructor(value: string) {
		this.value = value;
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class SQL<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'SQL';

	declare _: {
		brand: 'SQL';
		type: T;
	};

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.SQL;

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
	/** @internal */
	public shouldInlineParams = false;

	/** @internal */
	usedTables: string[] | undefined = undefined;

	constructor(readonly queryChunks: SQLChunk[]) {
		for (const chunk of queryChunks) {
			if ((chunk as any)?.[chunkKind] === ChunkKind.Table) {
				const tableChunk = chunk as Table;
				const schemaName = tableChunk[Table.Symbol.Schema];

				(this.usedTables ??= []).push(
					schemaName === undefined
						? tableChunk[Table.Symbol.Name]
						: schemaName + '.' + tableChunk[Table.Symbol.Name],
				);
			}
		}
	}

	append(query: SQL): this {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): QueryWithTypings {
		return tracer.startActiveSpan('drizzle.buildSQL', (span) => {
			let paramStartIndex: { value: number };
			if (config.paramStartIndex) {
				paramStartIndex = config.paramStartIndex;
			} else {
				defaultParamStartIndex.value = 0;
				paramStartIndex = defaultParamStartIndex;
			}
			const inlineParams = config.inlineParams || this.shouldInlineParams;
			const acc: QueryAccumulator = { sqlParts: [], params: [], typings: undefined };
			this.buildChunks(this.queryChunks, config, paramStartIndex, inlineParams, acc);
			const query: QueryWithTypings = { sql: acc.sqlParts.join(''), params: acc.params };
			if (acc.typings) {
				query.typings = acc.typings;
			}
			span?.setAttributes({
				'drizzle.query.text': query.sql,
				'drizzle.query.params': JSON.stringify(query.params),
			});
			return query;
		});
	}

	/** @deprecated Use `toQuery()` instead. Kept for backward compatibility. */
	buildQueryFromSourceParams(
		chunks: SQLChunk[],
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
	): Query {
		const acc: QueryAccumulator = { sqlParts: [], params: [], typings: undefined };
		this.buildChunks(chunks, config, paramStartIndex, inlineParams, acc);
		const result: QueryWithTypings = { sql: acc.sqlParts.join(''), params: acc.params };
		if (acc.typings) {
			result.typings = acc.typings;
		}
		return result;
	}

	/** @internal Accumulator-based SQL serializer. Pushes directly to `acc` instead of allocating intermediate objects. */
	private buildChunks(
		chunks: SQLChunk[],
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
		acc: QueryAccumulator,
	): void {
		const {
			casing,
			escapeName,
			escapeParam,
			prepareTyping,
			invokeSource,
		} = config;

		for (const chunk of chunks) {
			// Fast-path: use numeric [chunkKind] discriminant to avoid sequential is() prototype-chain walks.
			// Chunks that have [chunkKind] (all Drizzle entity classes) are dispatched via switch.
			// Chunks without [chunkKind] (arrays, undefined, functions, raw primitives) fall to the default case.
			const kind = (chunk as any)?.[chunkKind];
			switch (kind) {
				case ChunkKind.StringChunk:
					acc.sqlParts.push((chunk as StringChunk).value);
					continue;

				case ChunkKind.Name:
					acc.sqlParts.push(escapeName((chunk as Name).value));
					continue;

				case ChunkKind.SQL: {
					const sqlChunk = chunk as SQL;
					this.buildChunks(
						sqlChunk.queryChunks,
						config,
						paramStartIndex,
						inlineParams || sqlChunk.shouldInlineParams,
						acc,
					);
					continue;
				}

				case ChunkKind.Table: {
					const tableChunk = chunk as Table;
					const schemaName = tableChunk[Table.Symbol.Schema];
					const tableName = tableChunk[Table.Symbol.Name];

					if (invokeSource === 'mssql-view-with-schemabinding') {
						acc.sqlParts.push(
							(schemaName === undefined ? escapeName('dbo') : escapeName(schemaName)) + '.'
								+ escapeName(tableName),
						);
					} else {
						acc.sqlParts.push(
							schemaName === undefined || tableChunk[IsAlias]
								? escapeName(tableName)
								: escapeName(schemaName) + '.' + escapeName(tableName),
						);
					}
					continue;
				}

				case ChunkKind.Column: {
					const colChunk = chunk as Column;
					const columnName = casing.getColumnCasing(colChunk);
					if (invokeSource === 'indexes') {
						acc.sqlParts.push(escapeName(columnName));
						continue;
					}

					const schemaName = invokeSource === 'mssql-check' ? undefined : colChunk.table[Table.Symbol.Schema];
					acc.sqlParts.push(
						colChunk.isAlias ? escapeName(colChunk.name) : colChunk.table[IsAlias] || schemaName === undefined
							? escapeName(colChunk.table[Table.Symbol.Name]) + '.' + escapeName(columnName)
							: escapeName(schemaName) + '.' + escapeName(colChunk.table[Table.Symbol.Name]) + '.'
								+ escapeName(columnName),
					);
					continue;
				}

				case ChunkKind.View: {
					const viewChunk = chunk as View;
					const schemaName = viewChunk[ViewBaseConfig].schema;
					const viewName = viewChunk[ViewBaseConfig].name;
					acc.sqlParts.push(
						schemaName === undefined || viewChunk[ViewBaseConfig].isAlias
							? escapeName(viewName)
							: escapeName(schemaName) + '.' + escapeName(viewName),
					);
					continue;
				}

				case ChunkKind.Param: {
					const paramChunk = chunk as Param;
					if ((paramChunk.value as any)?.[chunkKind] === ChunkKind.Placeholder) {
						acc.sqlParts.push(escapeParam(paramStartIndex.value++, paramChunk));
						acc.params.push(paramChunk);
						accPushTyping(acc, 'none');
						continue;
					}

					const mappedValue = paramChunk.value === null ? null : paramChunk.encoder.mapToDriverValue(paramChunk.value);

					if ((mappedValue as any)?.[chunkKind] === ChunkKind.SQL) {
						this.buildChunks(
							(mappedValue as SQL).queryChunks,
							config,
							paramStartIndex,
							inlineParams,
							acc,
						);
						continue;
					}

					if (inlineParams) {
						acc.sqlParts.push(this.mapInlineParam(mappedValue, config));
						continue;
					}

					acc.sqlParts.push(escapeParam(paramStartIndex.value++, mappedValue));
					acc.params.push(mappedValue);
					accPushTyping(acc, prepareTyping ? prepareTyping(paramChunk.encoder) : 'none');
					continue;
				}

				case ChunkKind.Placeholder:
					acc.sqlParts.push(escapeParam(paramStartIndex.value++, chunk as Placeholder));
					acc.params.push(chunk as Placeholder);
					accPushTyping(acc, 'none');
					continue;

				case ChunkKind.SQLAliased: {
					const aliasedChunk = chunk as SQL.Aliased;
					if (aliasedChunk.fieldAlias !== undefined) {
						acc.sqlParts.push(
							(aliasedChunk.origin !== undefined ? escapeName(aliasedChunk.origin) + '.' : '')
								+ escapeName(aliasedChunk.fieldAlias),
						);
						continue;
					}
					// fieldAlias is undefined - fall through to SQLWrapper handling below
					break;
				}

				case ChunkKind.Subquery: {
					const subqueryChunk = chunk as Subquery;
					if (subqueryChunk._.isWith) {
						acc.sqlParts.push(escapeName(subqueryChunk._.alias));
						continue;
					}
					// Directly push parens and recurse -- no intermediate StringChunk/Name/array allocations
					acc.sqlParts.push('(');
					this.buildChunks(
						subqueryChunk._.sql.queryChunks,
						config,
						paramStartIndex,
						inlineParams,
						acc,
					);
					acc.sqlParts.push(') ');
					acc.sqlParts.push(escapeName(subqueryChunk._.alias));
					continue;
				}

				case ChunkKind.InsertValues: {
					const iv = chunk as unknown as InsertValuesChunk;
					const { rows, typings, sqlCells, numCols } = iv;
					const hasTypings = prepareTyping !== undefined;

					for (let r = 0; r < rows.length; r++) {
						if (r > 0) {
							acc.sqlParts.push(', ');
						}
						acc.sqlParts.push('(');
						const row = rows[r]!;
						for (let c = 0; c < numCols; c++) {
							if (c > 0) {
								acc.sqlParts.push(', ');
							}
							const cellValue = row[c];
							if (cellValue === INSERT_SQL_SENTINEL) {
								// Deferred SQL cell — process via full chunk path
								const sqlKey = r * numCols + c;
								const sqlChunk = sqlCells!.get(sqlKey)!;
								this.buildChunks(
									sqlChunk.queryChunks,
									config,
									paramStartIndex,
									inlineParams || sqlChunk.shouldInlineParams,
									acc,
								);
							} else if (inlineParams) {
								acc.sqlParts.push(this.mapInlineParam(cellValue, config));
							} else {
								acc.sqlParts.push(escapeParam(paramStartIndex.value++, cellValue));
								acc.params.push(cellValue);
								if (hasTypings) {
									accPushTyping(acc, typings[c]!);
								} else {
									accPushTyping(acc, 'none');
								}
							}
						}
						acc.sqlParts.push(')');
					}
					continue;
				}

				default:
					break;
			}

			// Fallback for chunks without [chunkKind]: undefined, arrays, functions (PgEnum), raw primitives, generic SQLWrapper
			if (chunk === undefined) {
				continue;
			}

			if (Array.isArray(chunk)) {
				// Directly push parens and separators -- no intermediate StringChunk allocations
				acc.sqlParts.push('(');
				for (let i = 0; i < chunk.length; i++) {
					if (i > 0) {
						acc.sqlParts.push(', ');
					}
					// Each element is a SQLChunk -- recurse with a single-element view
					this.buildChunk(chunk[i]!, config, paramStartIndex, inlineParams, acc);
				}
				acc.sqlParts.push(')');
				continue;
			}

			if (typeof chunk === 'function' && 'enumName' in chunk) {
				if ('schema' in chunk && chunk.schema) {
					acc.sqlParts.push(escapeName(chunk.schema as string) + '.' + escapeName(chunk.enumName as string));
				} else {
					acc.sqlParts.push(escapeName(chunk.enumName as string));
				}
				continue;
			}

			if (isSQLWrapper(chunk)) {
				if (chunk.shouldOmitSQLParens?.()) {
					this.buildChunks(chunk.getSQL().queryChunks, config, paramStartIndex, inlineParams, acc);
				} else {
					acc.sqlParts.push('(');
					this.buildChunks(chunk.getSQL().queryChunks, config, paramStartIndex, inlineParams, acc);
					acc.sqlParts.push(')');
				}
				continue;
			}

			if (inlineParams) {
				acc.sqlParts.push(this.mapInlineParam(chunk, config));
				continue;
			}

			acc.sqlParts.push(escapeParam(paramStartIndex.value++, chunk));
			acc.params.push(chunk);
			accPushTyping(acc, 'none');
		}
	}

	/** @internal Process a single chunk into the accumulator. Used for array element handling. */
	private buildChunk(
		chunk: SQLChunk,
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
		acc: QueryAccumulator,
	): void {
		// For a single chunk, check if it's a nested SQL with its own queryChunks
		const kind = (chunk as any)?.[chunkKind];
		if (kind === ChunkKind.SQL) {
			const sqlChunk = chunk as SQL;
			this.buildChunks(sqlChunk.queryChunks, config, paramStartIndex, inlineParams || sqlChunk.shouldInlineParams, acc);
		} else {
			// Wrap in a single-element array to reuse the full dispatch logic
			this.buildChunks([chunk], config, paramStartIndex, inlineParams, acc);
		}
	}

	private mapInlineParam(
		chunk: unknown,
		{ escapeString }: BuildQueryConfig,
	): string {
		if (chunk === null) {
			return 'null';
		}
		if (typeof chunk === 'number' || typeof chunk === 'boolean' || typeof chunk === 'bigint') {
			return chunk.toString();
		}
		if (typeof chunk === 'string') {
			return escapeString(chunk);
		}
		if (typeof chunk === 'object') {
			const mappedValueAsString = chunk.toString();
			if (mappedValueAsString === '[object Object]') {
				return escapeString(JSON.stringify(chunk));
			}
			return escapeString(mappedValueAsString);
		}
		throw new Error('Unexpected param value: ' + chunk);
	}

	getSQL(): SQL<T> {
		return this;
	}

	as(alias: string): SQL.Aliased<T>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(): SQL<TData>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(alias: string): SQL.Aliased<TData>;
	as(alias?: string): SQL<T> | SQL.Aliased<T> {
		// TODO: remove with deprecated overloads
		if (alias === undefined) {
			return this;
		}

		return new SQL.Aliased(this, alias);
	}

	mapWith<
		TDecoder extends
			| DriverValueDecoder<any, any>
			| DriverValueDecoder<any, any>['mapFromDriverValue'],
	>(decoder: TDecoder): SQL<GetDecoderResult<TDecoder>> {
		this.decoder = typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder;
		return this as SQL<GetDecoderResult<TDecoder>>;
	}

	inlineParams(): this {
		this.shouldInlineParams = true;
		return this;
	}

	/**
	 * This method is used to conditionally include a part of the query.
	 *
	 * @param condition - Condition to check
	 * @returns itself if the condition is `true`, otherwise `undefined`
	 */
	if(condition: any | undefined): this | undefined {
		return condition ? this : undefined;
	}
}

export type GetDecoderResult<T> = T extends Column ? T['_']['data'] : T extends
	| DriverValueDecoder<infer TData, any>
	| DriverValueDecoder<infer TData, any>['mapFromDriverValue'] ? TData
: never;

/**
 * Any DB name (table, column, index etc.)
 */
export class Name implements SQLWrapper {
	static readonly [entityKind]: string = 'Name';

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.Name;
	protected brand!: 'Name';

	constructor(readonly value: string) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

/**
 * Any DB name (table, column, index etc.)
 * @deprecated Use `sql.identifier` instead.
 */
export function name(value: string): Name {
	return new Name(value);
}

export interface DriverValueDecoder<TData, TDriverParam> {
	mapFromDriverValue(value: TDriverParam): TData;
}

export interface DriverValueEncoder<TData, TDriverParam> {
	mapToDriverValue(value: TData): TDriverParam | SQL;
}

export function isDriverValueEncoder(value: unknown): value is DriverValueEncoder<any, any> {
	return typeof value === 'object' && value !== null && 'mapToDriverValue' in value
		&& typeof (value as any).mapToDriverValue === 'function';
}

export const noopDecoder: DriverValueDecoder<any, any> = {
	mapFromDriverValue: (value) => value,
};

export const noopEncoder: DriverValueEncoder<any, any> = {
	mapToDriverValue: (value) => value,
};

export interface DriverValueMapper<TData, TDriverParam>
	extends DriverValueDecoder<TData, TDriverParam>, DriverValueEncoder<TData, TDriverParam>
{}

export const noopMapper: DriverValueMapper<any, any> = {
	...noopDecoder,
	...noopEncoder,
};

/** Parameter value that is optionally bound to an encoder (for example, a column). */
export class Param<TDataType = unknown, TDriverParamType = TDataType> implements SQLWrapper {
	static readonly [entityKind]: string = 'Param';

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.Param;
	protected brand!: 'BoundParamValue';

	/**
	 * @param value - Parameter value
	 * @param encoder - Encoder to convert the value to a driver parameter
	 */
	constructor(
		readonly value: TDataType,
		readonly encoder: DriverValueEncoder<TDataType, TDriverParamType> = noopEncoder,
	) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

/** @deprecated Use `sql.param` instead. */
export function param<TData, TDriver>(
	value: TData,
	encoder?: DriverValueEncoder<TData, TDriver>,
): Param<TData, TDriver> {
	return new Param(value, encoder);
}

/**
 * @internal Pre-serialized INSERT VALUES rows.
 *
 * Created by PgDialect.buildInsertQuery() to bypass per-cell Param allocation.
 * Values are pre-mapped via mapToDriverValue() and typings are pre-computed per column.
 * buildChunks() handles this chunk type with a tight loop that directly emits
 * `($1, $2, ...), ($3, $4, ...)` without touching the Param dispatch path.
 *
 * For cells that produce SQL (e.g. DEFAULT, defaultFn returning SQL, raw SQL values),
 * a sentinel is placed in the row data and the SQL chunk is stored in `sqlCells` for
 * deferred processing via the full buildChunks path.
 */
export interface InsertValuesChunk {
	readonly [chunkKind]: typeof ChunkKind.InsertValues;
	/**
	 * Per-row arrays of pre-mapped values (result of mapToDriverValue, or null).
	 * Cells containing SQL are set to INSERT_SQL_SENTINEL and their SQL is stored in `sqlCells`.
	 */
	readonly rows: unknown[][];
	/** Pre-computed query typing per column (length = numCols). */
	readonly typings: QueryTypingsValue[];
	/**
	 * Sparse map: `${rowIndex},${colIndex}` → SQL chunk for cells that require
	 * deferred SQL processing (DEFAULT, defaultFn SQL results, raw SQL column values).
	 * null when no cells contain SQL (the common case).
	 */
	readonly sqlCells: Map<number, SQL> | null;
	/** Number of columns per row. */
	readonly numCols: number;
}

/** @internal Sentinel value placed in InsertValuesChunk.rows for cells that contain SQL. */
export const INSERT_SQL_SENTINEL: unique symbol = Symbol.for('drizzle:insertSqlSentinel');

/**
 * Anything that can be passed to the `` sql`...` `` tagged function.
 */
export type SQLChunk =
	| StringChunk
	| SQLChunk[]
	| SQLWrapper
	| SQL
	| Table
	| View
	| Subquery
	| AnyColumn
	| Param
	| Name
	| undefined
	| FakePrimitiveParam
	| Placeholder
	| InsertValuesChunk;

export type SQLGenerator<T = unknown> = typeof sql<T>;

export function sql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T>;
/*
	The type of `params` is specified as `SQLChunk[]`, but that's slightly incorrect -
	in runtime, users won't pass `FakePrimitiveParam` instances as `params` - they will pass primitive values
	which will be wrapped in `Param`. That's why the overload specifies `params` as `any[]` and not as `SQLSourceParam[]`.
	This type is used to make our lives easier and the type checker happy.
*/
export function sql(strings: TemplateStringsArray, ...params: SQLChunk[]): SQL {
	const queryChunks: SQLChunk[] = [];
	if (params.length > 0 || (strings.length > 0 && strings[0] !== '')) {
		queryChunks.push(new StringChunk(strings[0]!));
	}
	for (const [paramIndex, param] of params.entries()) {
		const str = strings[paramIndex + 1]!;
		if (str !== '') {
			queryChunks.push(param, new StringChunk(str));
		} else {
			queryChunks.push(param);
		}
	}

	return new SQL(queryChunks);
}

export namespace sql {
	export function empty(): SQL {
		return new SQL([]);
	}

	/** @deprecated - use `sql.join()` */
	export function fromList(list: SQLChunk[]): SQL {
		return new SQL(list);
	}

	/**
	 * Convenience function to create an SQL query from a raw string.
	 * @param str The raw SQL query string.
	 */
	export function raw(str: string): SQL {
		return new SQL([new StringChunk(str)]);
	}

	/**
	 * Join a list of SQL chunks with a separator.
	 * @example
	 * ```ts
	 * const query = sql.join([sql`a`, sql`b`, sql`c`]);
	 * // sql`abc`
	 * ```
	 * @example
	 * ```ts
	 * const query = sql.join([sql`a`, sql`b`, sql`c`], sql`, `);
	 * // sql`a, b, c`
	 * ```
	 */
	export function join(chunks: SQLChunk[], separator?: SQLChunk): SQL {
		const result: SQLChunk[] = [];
		for (const [i, chunk] of chunks.entries()) {
			if (i > 0 && separator !== undefined) {
				result.push(separator);
			}
			result.push(chunk);
		}
		return new SQL(result);
	}

	/**
	 * Create a SQL chunk that represents a DB identifier (table, column, index etc.).
	 * When used in a query, the identifier will be escaped based on the DB engine.
	 * For example, in PostgreSQL, identifiers are escaped with double quotes.
	 *
	 * **WARNING: This function does not offer any protection against SQL injections, so you must validate any user input beforehand.**
	 *
	 * @example ```ts
	 * const query = sql`SELECT * FROM ${sql.identifier('my-table')}`;
	 * // 'SELECT * FROM "my-table"'
	 * ```
	 */
	export function identifier(value: string): Name {
		return new Name(value);
	}

	export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
		return new Placeholder(name);
	}

	export function param<TData, TDriver>(
		value: TData,
		encoder?: DriverValueEncoder<TData, TDriver>,
	): Param<TData, TDriver> {
		return new Param(value, encoder);
	}

	/**
	 * @internal Pre-allocated constant SQL fragments to avoid repeated allocations in hot paths.
	 * These are used as separators in `sql.join()` and as inline fragments in dialect query builders.
	 * Hoisted to module level so they are allocated once, not per query.
	 * WARNING: Do not mutate these (no `.append()`, no `.shouldInlineParams = ...`).
	 */
	export const COMMA: SQL = sql`, `;
	export const SPACE: SQL = sql` `;
	export const WITH: SQL = sql`with `;
	export const DISTINCT: SQL = sql` distinct`;
	export const NOWAIT: SQL = sql` nowait`;
	export const SKIP_LOCKED: SQL = sql` skip locked`;
	export const DEFAULT: SQL = sql`default`;
	export const TRUE: SQL = sql`true`;
	export const FALSE: SQL = sql`false`;
	export const NULL: SQL = sql`null`;
	export const RAW_COMMA: SQL = raw(', ');
	export const RAW_VALUES: SQL = raw('values ');
	export const RAW_FROM: SQL = raw(' from ');
	export const RAW_STAR: SQL = raw('*');
	export const RAW_DOT: SQL = raw('.');
	export const RAW_AS: SQL = raw(' as ');
	export const RAW_WHERE: SQL = raw(' where ');
	export const RAW_RETURNING: SQL = raw(' returning ');
	export const RAW_DELETE_FROM: SQL = raw('delete from ');
	export const RAW_INSERT_INTO: SQL = raw('insert into ');
	export const RAW_ON_CONFLICT: SQL = raw(' on conflict ');
	export const RAW_OVERRIDING_SYSTEM_VALUE: SQL = raw('overriding system value ');
}

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper<T> {
		static readonly [entityKind]: string = 'SQL.Aliased';

		declare _: {
			brand: 'SQL.Aliased';
			type: T;
		};

		/** @internal */
		readonly [chunkKind]: number = ChunkKind.SQLAliased;

		/** @internal */
		isSelectionField = false;
		/** @internal */
		origin?: string;

		constructor(
			readonly sql: SQL<T>,
			readonly fieldAlias: string,
		) {}

		getSQL(): SQL<T> {
			return this.sql as SQL<T>;
		}

		/** @internal */
		clone() {
			return new Aliased<T>(this.sql, this.fieldAlias);
		}
	}
}

export class Placeholder<TName extends string = string, TValue = any> implements SQLWrapper {
	static readonly [entityKind]: string = 'Placeholder';

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.Placeholder;
	declare protected: TValue;

	constructor(readonly name: TName) {}

	getSQL(): SQL {
		return new SQL([this]);
	}
}

/** @deprecated Use `sql.placeholder` instead. */
export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
	return new Placeholder(name);
}

export function fillPlaceholders(params: unknown[], values: Record<string, unknown>): unknown[] {
	return params.map((p) => {
		if (is(p, Placeholder)) {
			if (!(p.name in values)) {
				throw new Error(`No value for placeholder "${p.name}" was provided`);
			}

			return values[p.name];
		}

		if (is(p, Param) && is(p.value, Placeholder)) {
			if (!(p.value.name in values)) {
				throw new Error(`No value for placeholder "${p.value.name}" was provided`);
			}

			return p.encoder.mapToDriverValue(values[p.value.name]);
		}

		return p;
	});
}

export type ColumnsSelection = Record<string, unknown>;

const IsDrizzleView = Symbol.for('drizzle:IsDrizzleView');

export abstract class View<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> {
	static readonly [entityKind]: string = 'View';

	declare _: {
		brand: 'View';
		viewBrand: string;
		name: TName;
		existing: TExisting;
		selectedFields: TSelection;
	};

	/** @internal */
	readonly [chunkKind]: number = ChunkKind.View;

	/** @internal */
	[ViewBaseConfig]: {
		name: TName;
		originalName: TName;
		schema: string | undefined;
		selectedFields: ColumnsSelection;
		isExisting: TExisting;
		query: TExisting extends true ? undefined : SQL;
		isAlias: boolean;
	};

	/** @internal */
	[IsDrizzleView] = true;

	/** @internal */
	public get [TableName]() {
		return this[ViewBaseConfig].name;
	}

	/** @internal */
	public get [TableSchema]() {
		return this[ViewBaseConfig].schema;
	}

	/** @internal */
	public get [IsAlias]() {
		return this[ViewBaseConfig].isAlias;
	}

	/** @internal */
	public get [OriginalName]() {
		return this[ViewBaseConfig].originalName;
	}

	/** @internal */
	public get [TableColumns]() {
		return (this[ViewBaseConfig].selectedFields) as any as Record<string, unknown>;
	}

	declare readonly $inferSelect: InferSelectViewModel<View<Assume<TName, string>, TExisting, TSelection>>;

	constructor(
		{ name, schema, selectedFields, query }: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			originalName: name,
			schema,
			selectedFields,
			query: query as (TExisting extends true ? undefined : SQL),
			isExisting: !query as TExisting,
			isAlias: false,
		};
	}
}

export function isView(view: unknown): view is View {
	return typeof view === 'object' && view !== null && IsDrizzleView in view;
}

export function getViewName<T extends View>(view: T): T['_']['name'] {
	return view[ViewBaseConfig].name;
}

export type InferSelectViewModel<TView extends View> =
	Equal<TView['_']['selectedFields'], { [x: string]: unknown }> extends true ? { [x: string]: unknown }
		: SelectResult<
			TView['_']['selectedFields'],
			'single',
			Record<TView['_']['name'], 'not-null'>
		>;

// Defined separately from the Column class to resolve circular dependency
Column.prototype.getSQL = function() {
	return new SQL([this]);
};
// Defined separately from the Column class to resolve circular dependency
Subquery.prototype.getSQL = function() {
	return new SQL([this]);
};

export type SQLEntity = SQL | SQLWrapper | SQL.Aliased | Table | View;
