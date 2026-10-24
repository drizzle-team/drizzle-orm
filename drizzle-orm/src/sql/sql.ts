import type { CodecsCollection, ResolvedCodecs } from '~/codecs.ts';
import { entityKind, entityKindsOf, is } from '~/entity.ts';
import { Subquery } from '~/subquery.ts';
import { hasTelemetry, tracer } from '~/tracing.ts';
import type { Equal } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import { View } from '~/view.ts';
import type { AnyColumn } from '../column.ts';
import { Column } from '../column.ts';
import { IsAlias, Table } from '../table.ts';
import { CacheKey, Qualifier, TableName, TableSchema } from '../table.utils.ts';
import { commonStringChunks, StringChunk } from './common-chunks.ts';

/**
 * This class is used to indicate a primitive param value that is used in `sql` tag.
 * It is only used on type level and is never instantiated at runtime.
 * If you see a value of this type in the code, its runtime value is actually the primitive param value.
 */
export class FakePrimitiveParam {
	static readonly [entityKind]: string = 'FakePrimitiveParam';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}
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
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
	escapeString(str: string): string;
	codecs?: CodecsCollection;
	paramStartIndex?: { value: number };
	inlineParams?: boolean;
	invokeSource?: 'indexes' | 'mssql-check' | 'mssql-view-with-schemabinding' | undefined;
	tagged?: true;
}

export interface Query {
	sql: string;
	params: unknown[];
	_sql?: TemplateStringsArray;
	// ^ TODO: revisit
	// for Bun.SQL cache performance
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

export class SQL<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'SQL';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	declare _: {
		brand: 'SQL';
		type: T;
	};

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
	/** @internal */
	public shouldInlineParams = false;

	constructor(readonly queryChunks: SQLChunk[]) {}

	append(query: SQL): this {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): Query {
		if (!hasTelemetry) return this.buildQueryFromSourceParams(this.queryChunks, config);

		return tracer.startActiveSpan('drizzle.buildSQL', (span) => {
			const query = this.buildQueryFromSourceParams(this.queryChunks, config);
			span?.setAttributes({
				'drizzle.query.text': query.sql,
				'drizzle.query.params': JSON.stringify(query.params),
			});
			return query;
		});
	}

	buildQueryFromSourceParams(chunks: SQLChunk[], _config: BuildQueryConfig): Query {
		const out = { sql: '' };
		const params: unknown[] = [];
		const bounds: number[] | undefined = _config.tagged ? [] : undefined;

		this.collectSQL(
			chunks,
			_config,
			_config.paramStartIndex || { value: 0 },
			_config.inlineParams || this.shouldInlineParams,
			out,
			params,
			bounds,
		);

		const query = out.sql;
		if (bounds === undefined) {
			return {
				sql: query,
				params,
			} as Query;
		}

		const segments: string[] = new Array(bounds.length);
		for (let i = 0; i < bounds.length; ++i) {
			segments[i] = query.slice(bounds[i], i + 1 < bounds.length ? bounds[i + 1] : query.length);
		}

		return {
			sql: query,
			params,
			_sql: Object.assign(segments, { raw: segments }),
		} as Query;
	}

	private collectSQL(
		chunks: SQLChunk[],
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
		out: { sql: string },
		params: unknown[],
		bounds: number[] | undefined,
	): void {
		const {
			escapeName,
			escapeParam,
			codecs,
			invokeSource,
		} = config;

		for (let i = 0; i < chunks.length; ++i) {
			if (bounds !== undefined) bounds.push(out.sql.length);

			const chunk = chunks[i]!;
			const kind = chunkKindOf(chunk);

			if (isChunk(chunk, kind, chunkKinds.string)) {
				out.sql += chunk.value ?? '';
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.sql)) {
				this.collectSQL(
					chunk.queryChunks,
					config,
					paramStartIndex,
					inlineParams || chunk.shouldInlineParams,
					out,
					params,
					undefined,
				);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.name)) {
				out.sql += escapeName(chunk.value);
				continue;
			}

			if (chunk === undefined) {
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.column)) {
				const columnName = chunk.name;
				if (invokeSource === 'indexes') {
					out.sql += escapeName(columnName);
					continue;
				}

				const schemaName = invokeSource === 'mssql-check' ? undefined : chunk.table[Table.Symbol.Schema];
				out.sql += chunk.isAlias ? escapeName(chunk.name) : chunk.table[IsAlias] || schemaName === undefined
					? escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(columnName)
					: escapeName(schemaName) + '.' + escapeName(chunk.table[Table.Symbol.Name]) + '.'
						+ escapeName(columnName);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.param)) {
				const paramValue = chunk.value;
				const valueKind = chunkKindOf(paramValue);

				if (isChunk(paramValue, valueKind, chunkKinds.sql)) {
					const nested = paramValue;
					this.collectSQL(
						nested.queryChunks,
						config,
						paramStartIndex,
						inlineParams || nested.shouldInlineParams,
						out,
						params,
						undefined,
					);
					continue;
				}

				const encoder = chunk.encoder;
				const paramCodecs = codecs && chunkKindOf(encoder) === chunkKinds.column
					? codecs.codecsOf(encoder as Column)
					: undefined;

				if (valueKind === chunkKinds.placeholder) {
					const escaped = escapeParam(paramStartIndex.value++, chunk);
					const normalize = paramCodecs?.normalizeParam;
					const cast = paramCodecs?.castParam;
					chunk.codec = normalize
						? (value) => normalize(value, (<any> encoder).dimensions)
						: undefined;
					out.sql += cast
						? cast(escaped, encoder as Column, (<any> encoder).dimensions)
						: escaped;
					params.push(chunk);
					continue;
				}

				this.collectBoundValue(paramValue, encoder, paramCodecs, config, paramStartIndex, inlineParams, out, params);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.placeholder)) {
				out.sql += escapeParam(paramStartIndex.value++, chunk);
				params.push(chunk);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.table)) {
				const schemaName = chunk[Table.Symbol.Schema];
				const tableName = chunk[Table.Symbol.Name];

				if (invokeSource === 'mssql-view-with-schemabinding') {
					out.sql += (schemaName === undefined ? escapeName('dbo') : escapeName(schemaName)) + '.'
						+ escapeName(tableName);
					continue;
				}

				out.sql += schemaName === undefined || chunk[IsAlias]
					? escapeName(tableName)
					: escapeName(schemaName) + '.' + escapeName(tableName);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.view)) {
				const schemaName = chunk[ViewBaseConfig].schema;
				const viewName = chunk[ViewBaseConfig].name;
				out.sql += schemaName === undefined || chunk[ViewBaseConfig].isAlias
					? escapeName(viewName)
					: escapeName(schemaName) + '.' + escapeName(viewName);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.aliased) && chunk.fieldAlias !== undefined) {
				out.sql += (chunk.origin !== undefined ? escapeName(chunk.origin) + '.' : '') + escapeName(chunk.fieldAlias);
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.valueRows)) {
				const { cells, encoders } = chunk;
				const width = encoders.length;
				const paramCodecs: (ResolvedCodecs | undefined)[] = new Array(width);
				for (let j = 0; j < width; ++j) {
					const encoder = encoders[j]!;
					paramCodecs[j] = codecs && chunkKindOf(encoder) === chunkKinds.column
						? codecs.codecsOf(encoder as Column)
						: undefined;
				}

				out.sql += '(';
				for (let j = 0, column = 0; j < cells.length; ++j, ++column) {
					if (column === width) {
						column = 0;
						out.sql += '), (';
					} else if (column > 0) out.sql += ', ';

					const cell = cells[j];
					const cellKind = chunkKindOf(cell);
					if (cellKind === chunkKinds.other) {
						this.collectBoundValue(
							cell,
							encoders[column]!,
							paramCodecs[column],
							config,
							paramStartIndex,
							inlineParams,
							out,
							params,
						);
						continue;
					}

					if (isChunk(cell, cellKind, chunkKinds.string)) {
						out.sql += cell.value ?? '';
						continue;
					}

					this.collectSQL(
						[cellKind === chunkKinds.sql ? cell as SQL : new Param(cell, encoders[column])],
						config,
						paramStartIndex,
						inlineParams,
						out,
						params,
						undefined,
					);
				}
				out.sql += ')';
				continue;
			}

			if (isChunk(chunk, kind, chunkKinds.subquery)) {
				if (chunk._.isWith) {
					out.sql += escapeName(chunk._.alias);
					continue;
				}

				const nested = chunk._.sql;
				out.sql += '(';
				this.collectSQL(
					nested.queryChunks,
					config,
					paramStartIndex,
					inlineParams || nested.shouldInlineParams,
					out,
					params,
					undefined,
				);
				out.sql += ') ' + escapeName(chunk._.alias);
				continue;
			}

			if (typeof chunk === 'function' && 'enumName' in chunk) {
				if ('schema' in chunk && chunk.schema) {
					out.sql += escapeName(chunk.schema as string) + '.' + escapeName(chunk.enumName as string);
					continue;
				}
				out.sql += escapeName(chunk.enumName as string);
				continue;
			}

			if (isSQLWrapper(chunk)) {
				const nested = chunk.getSQL();
				const nestedInlineParams = inlineParams || nested.shouldInlineParams;

				if (chunk.shouldOmitSQLParens?.()) {
					this.collectSQL(
						nested.queryChunks,
						config,
						paramStartIndex,
						nestedInlineParams,
						out,
						params,
						undefined,
					);
					continue;
				}

				out.sql += '(';
				this.collectSQL(
					nested.queryChunks,
					config,
					paramStartIndex,
					nestedInlineParams,
					out,
					params,
					undefined,
				);
				out.sql += ')';
				continue;
			}

			if (Array.isArray(chunk)) {
				out.sql += '(';
				const element: SQLChunk[] = [undefined];
				for (let j = 0; j < chunk.length; ++j) {
					if (j > 0) out.sql += ', ';
					element[0] = chunk[j];
					this.collectSQL(element, config, paramStartIndex, inlineParams, out, params, undefined);
				}
				out.sql += ')';
				continue;
			}

			if (inlineParams) {
				out.sql += this.mapInlineParam(chunk, config);
				continue;
			}

			out.sql += escapeParam(paramStartIndex.value++, chunk);
			params.push(chunk);
		}
	}

	private collectBoundValue(
		value: unknown,
		encoder: DriverValueEncoder<unknown, unknown>,
		paramCodecs: ResolvedCodecs | undefined,
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
		out: { sql: string },
		params: unknown[],
	): void {
		let mappedValue: any = value;
		if (value !== null) {
			if (!encoder.mapToDriverValue.isNoop) mappedValue = encoder.mapToDriverValue(value);

			if (chunkKindOf(mappedValue) === chunkKinds.sql) {
				const nested: SQL = mappedValue;
				this.collectSQL(
					nested.queryChunks,
					config,
					paramStartIndex,
					inlineParams || nested.shouldInlineParams,
					out,
					params,
					undefined,
				);
				return;
			}

			const normalize = paramCodecs?.normalizeParam;
			if (!inlineParams && normalize) mappedValue = normalize(mappedValue, (<any> encoder).dimensions);
		}

		if (inlineParams) {
			out.sql += this.mapInlineParam(mappedValue, config);
			return;
		}

		const { escapeParam } = config;
		const escaped = escapeParam(paramStartIndex.value++, mappedValue);
		const cast = paramCodecs?.castParam;
		out.sql += cast ? cast(escaped, encoder as Column, (<any> encoder).dimensions) : escaped;
		params.push(mappedValue);
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
			| DriverValueDecoder<any, Exclude<T, null>>
			| DriverValueDecoder<any, Exclude<T, null>>['mapFromDriverValue'],
	>(
		decoder: TDecoder,
	): Equal<T, unknown> extends true ? SQL<GetDecoderResult<TDecoder>>
		: Equal<T, any> extends true ? SQL<GetDecoderResult<TDecoder>>
		: SQL<GetDecoderResult<TDecoder> | (null extends T ? null : never)>
	{
		this.decoder = typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder;
		return this as SQL<any>;
	}

	nullable(): SQL<T | null> {
		return this;
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

/**
 * Ids of the chunk classes `chunkKindOf` tells apart
 */
export const chunkKinds = {
	other: 0,
	string: 1,
	sql: 2,
	name: 3,
	column: 4,
	param: 5,
	placeholder: 6,
	table: 7,
	view: 8,
	aliased: 9,
	subquery: 10,
	valueRows: 11,
} as const;

const chunkKindByConstructor = new WeakMap<object, number>();
const chunkKindKey = Symbol('drizzle:chunkKind');
function resolveChunkKind(ctor: object, kinds: Set<string>): number {
	const kind = kinds.has(StringChunk[entityKind])
		? chunkKinds.string
		: kinds.has(SQL[entityKind])
		? chunkKinds.sql
		: kinds.has(Name[entityKind])
		? chunkKinds.name
		: kinds.has(Column[entityKind])
		? chunkKinds.column
		: kinds.has(Param[entityKind])
		? chunkKinds.param
		: kinds.has(Placeholder[entityKind])
		? chunkKinds.placeholder
		: kinds.has(Table[entityKind])
		? chunkKinds.table
		: kinds.has(View[entityKind])
		? chunkKinds.view
		: kinds.has(SQL.Aliased[entityKind])
		? chunkKinds.aliased
		: kinds.has(Subquery[entityKind])
		? chunkKinds.subquery
		: kinds.has(ValueRows[entityKind])
		? chunkKinds.valueRows
		: chunkKinds.other;
	chunkKindByConstructor.set(ctor, kind);
	// Set cache directly on entity
	// TODO: predefine statically
	if (kind !== chunkKinds.other) {
		Object.defineProperty((ctor as { prototype: object }).prototype, chunkKindKey, { value: kind });
	}
	return kind;
}

export function chunkKindOf(chunk: unknown): number {
	if (chunk === null || typeof chunk !== 'object') return chunkKinds.other;

	const cached = (chunk as { [chunkKindKey]?: number })[chunkKindKey];
	if (cached !== undefined) return cached;

	const ctor = Object.getPrototypeOf(chunk)?.constructor;
	if (typeof ctor !== 'function') return chunkKinds.other;

	return chunkKindByConstructor.get(ctor) ?? resolveChunkKind(ctor, entityKindsOf(chunk)!);
}

export interface ChunkTypes {
	[chunkKinds.string]: StringChunk;
	[chunkKinds.sql]: SQL;
	[chunkKinds.name]: Name;
	[chunkKinds.column]: Column;
	[chunkKinds.param]: Param;
	[chunkKinds.placeholder]: Placeholder;
	[chunkKinds.table]: Table;
	[chunkKinds.view]: View;
	[chunkKinds.aliased]: SQL.Aliased;
	[chunkKinds.subquery]: Subquery;
	[chunkKinds.valueRows]: ValueRows;
}

export function isChunk<TKind extends keyof ChunkTypes>(
	_chunk: unknown,
	kind: number,
	expected: TKind,
): _chunk is ChunkTypes[TKind] {
	return kind === expected;
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
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

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

export interface DriverValueDecoderFn<TData, TDriverParam> {
	(value: TDriverParam): TData;
	/** @internal */
	isNoop?: true | undefined;
}

export interface DriverValueDecoder<TData, TDriverParam> {
	mapFromDriverValue: DriverValueDecoderFn<TData, TDriverParam>;
}

export interface DriverValueEncoderFn<TData, TDriverParam> {
	(value: TData): TDriverParam;
	/** @internal */
	isNoop?: true | undefined;
}

export interface DriverValueEncoder<TData, TDriverParam> {
	mapToDriverValue: DriverValueEncoderFn<TData, TDriverParam>;
}

export function isDriverValueEncoder(value: unknown): value is DriverValueEncoder<any, any> {
	return typeof value === 'object' && value !== null && 'mapToDriverValue' in value
		&& typeof (value as any).mapToDriverValue === 'function';
}

export const noopDecoder: DriverValueDecoder<any, any> = {
	mapFromDriverValue: (value) => value,
};

noopDecoder.mapFromDriverValue.isNoop = true;

export const noopEncoder: DriverValueEncoder<any, any> = {
	mapToDriverValue: (value) => value,
};

noopEncoder.mapToDriverValue.isNoop = true;

export interface DriverValueMapper<TData, TDriverParam>
	extends DriverValueDecoder<TData, TDriverParam>, DriverValueEncoder<TData, TDriverParam>
{}

export function isNoop(mapper: DriverValueEncoderFn<any, any> | DriverValueDecoderFn<any, any>) {
	return mapper.isNoop;
}

export const noopMapper: DriverValueMapper<any, any> = {
	...noopDecoder,
	...noopEncoder,
};

/** Parameter value that is optionally bound to an encoder (for example, a column). */
export class Param<TDataType = any, TDriverParamType = TDataType> implements SQLWrapper {
	static readonly [entityKind]: string = 'Param';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	protected brand!: 'BoundParamValue';

	/**
	 * @param value - Parameter value
	 * @param encoder - Encoder to convert the value to a driver parameter
	 */
	constructor(
		readonly value: TDataType | Placeholder<string, TDataType>,
		readonly encoder: DriverValueEncoder<TDataType, TDriverParamType> = noopEncoder,
		public codec?: (value: any) => any,
	) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class ValueRows implements SQLWrapper {
	static readonly [entityKind]: string = 'ValueRows';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	constructor(
		readonly cells: unknown[],
		readonly encoders: DriverValueEncoder<unknown, unknown>[],
	) {}

	// Backwards compatibility for builders unaware of this chunk type
	getSQL(): SQL {
		const { cells, encoders } = this;
		const width = encoders.length;
		const chunks: SQLChunk[] = [];
		for (let i = 0; i < cells.length; ++i) {
			const column = i % width;
			chunks.push(
				column === 0 ? (i === 0 ? commonStringChunks['('] : commonStringChunks['), (']) : commonStringChunks[', '],
			);
			const cell = cells[i];
			const kind = chunkKindOf(cell);
			chunks.push(
				kind === chunkKinds.sql || kind === chunkKinds.string ? cell as SQLChunk : new Param(cell, encoders[column]),
			);
		}
		chunks.push(commonStringChunks[')']);

		return new SQL(chunks);
	}

	shouldOmitSQLParens(): boolean {
		return true;
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
	| Placeholder;

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
	if (strings[0]) queryChunks.push(new StringChunk(strings[0]));
	for (let paramIdx = 0; paramIdx < params.length; ++paramIdx) {
		const param = params[paramIdx];
		if (param !== undefined) queryChunks.push(param);
		const string = strings[paramIdx + 1];
		if (string) queryChunks.push(new StringChunk(string));
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
		const { length } = chunks;
		if (separator === undefined || length === 0) return new SQL(chunks.slice());

		const result: SQLChunk[] = new Array(length * 2 - 1);
		for (let i = 0, writeIdx = 0; i < length; ++i) {
			result[writeIdx++] = chunks[i];

			if (i < length - 1) {
				result[writeIdx++] = separator;
			}
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
		value: TData | Placeholder<string, TData>,
		encoder?: DriverValueEncoder<TData, TDriver>,
	): Param<TData, TDriver> {
		return new Param(value, encoder);
	}

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	export function comment(input: CommentInput): SQL | undefined {
		const encoded = sqlCommenter(input);
		if (!encoded.length) return undefined;

		return sql.raw(encoded);
	}
}

export function sqlCommenter(input: CommentInput): string {
	const encoded = sqlCommenter.encodeInput(input);
	if (!encoded.length) return '';

	return `/*${encoded}*/`;
}

export namespace sqlCommenter {
	export function merge(input1: CommentInput | undefined, input2: CommentInput | undefined) {
		let encoded: CommentInput;
		if (typeof input1 === 'object' && typeof input2 === 'object') {
			encoded = encodeInput({ ...input1, ...input2 });
		} else if (input1 && input2) {
			encoded = [encodeInput(input1), encodeInput(input2)].filter((i) => i.length).join(',');
		} else if (input2) {
			encoded = encodeInput(input2);
		} else if (input1) {
			encoded = encodeInput(input1);
		} else {
			return '';
		}

		if (!encoded.length) return '';

		return `/*${encoded}*/`;
	}

	export function encodeInput(input: CommentInput): string {
		if (typeof input === 'string') {
			if (!input.length) return input;

			return sanitizeStringInput(input);
		}

		const parts: string[] = [];

		for (const [key, value] of Object.entries(input)) {
			if (value === null || value === undefined || value === '') continue;

			const encodedKey = sanitizeObjectElement(key);
			const encodedValue = sanitizeObjectElement(String(value));

			parts.push(`${encodedKey}='${encodedValue}'`);
		}

		if (!parts.length) return '';

		return parts.sort().join(',');
	}

	export function sanitizeObjectElement(key: string): string {
		const urlEncoded = encodeURIComponent(key);
		return urlEncoded.replace(/'/g, `\\'`);
	}

	export function sanitizeStringInput(input: string): string {
		return input.replace(/\/\*/g, '/ *').replace(/\*\//g, '* /');
	}
}

export type CommentInput = string | SqlCommenterInput;

export type SqlCommenterInput = Record<
	string,
	string | number | bigint | boolean | null | undefined
>;

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper<T> {
		static readonly [entityKind]: string = 'SQL.Aliased';

		static [Symbol.hasInstance](value: unknown): boolean {
			return is(value, this);
		}

		declare _: {
			brand: 'SQL.Aliased';
			type: T;
		};

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

		as(alias: string): SQL.Aliased<T> {
			return new SQL.Aliased(new SQL([this]), alias);
		}

		/** @internal */
		clone() {
			return new Aliased<T>(this.sql, this.fieldAlias);
		}
	}
}

export class Placeholder<TName extends string = string, TValue = any> implements SQLWrapper {
	static readonly [entityKind]: string = 'Placeholder';
	static [Symbol.hasInstance](value: unknown): boolean {
		return is(value, this);
	}

	// Keep values as protected to avoid bleeding into autocomplete (ex.: relational queries' "where")
	declare protected value: TValue;

	constructor(protected readonly name: TName) {}

	/**
	 * @deprecated Field hidden to prevent bleeding into autocomplete
	 */
	getSQL(): SQL {
		return new SQL([this]);
	}
}

/** @deprecated Use `sql.placeholder` instead. */
export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
	return new Placeholder(name);
}

/**
 * @internal
 * Replaces top-level columns of `query` with their unqualified names (e.g. for `order by` of set operations) -
 * returns a copy if any are present, never modifying `query` itself
 */
export function unqualifyColumns(query: SQL): SQL {
	const source = query.queryChunks;
	let chunks: SQLChunk[] | undefined;
	for (let i = 0; i < source.length; ++i) {
		const chunk = source[i];
		if (is(chunk, Column)) (chunks ??= [...source])[i] = sql.identifier(chunk.name);
	}
	if (!chunks) return query;

	const copy = new SQL(chunks);
	copy.decoder = query.decoder;
	copy.shouldInlineParams = query.shouldInlineParams;
	return copy;
}

export function fillPlaceholders(params: unknown[], values: Record<string, unknown>): unknown[] {
	const filled: unknown[] = new Array(params.length);

	for (let i = 0; i < params.length; ++i) {
		const p = params[i]!;

		if (is(p, Placeholder)) {
			// Bypass Placeholder's field protection
			const { name } = p as any as { name: string };
			if (!(name in values)) {
				throw new Error(`No value for placeholder "${name}" was provided`);
			}

			filled[i] = values[name];
			continue;
		}

		if (is(p, Param) && is(p.value, Placeholder)) {
			// Bypass Placeholder's field protection
			const { name } = p.value as any as { name: string };

			if (!(name in values)) {
				throw new Error(`No value for placeholder "${name}" was provided`);
			}

			const value = values[name];
			if (value === null) {
				filled[i] = value;
				continue;
			}

			const mapped = p.encoder.mapToDriverValue.isNoop
				? value
				: p.encoder.mapToDriverValue(value);

			filled[i] = p.codec ? p.codec(mapped) : mapped;
			continue;
		}

		filled[i] = p;
	}

	return filled;
}

export type ColumnsSelection = Record<string, unknown>;

/**
 * @internal
 *
 * Adds cache key of every table referenced anywhere within `chunks` to `out`
 */
export function collectChunksUsedTables(chunks: readonly SQLChunk[], out: Set<string>): void {
	for (let i = 0; i < chunks.length; ++i) {
		const chunk = chunks[i];
		const kind = chunkKindOf(chunk);
		switch (kind) {
			case chunkKinds.table: {
				out.add((chunk as Table)[CacheKey]);
				break;
			}
			case chunkKinds.sql: {
				collectChunksUsedTables((chunk as SQL).queryChunks, out);
				break;
			}
			case chunkKinds.param: {
				const value = (chunk as { value: unknown }).value;
				if (chunkKindOf(value) === chunkKinds.sql) collectChunksUsedTables((value as SQL).queryChunks, out);
				break;
			}
			case chunkKinds.subquery: {
				collectChunksUsedTables((chunk as Subquery)._.sql.queryChunks, out);
				break;
			}
			case chunkKinds.valueRows: {
				collectChunksUsedTables((chunk as { cells: SQLChunk[] }).cells, out);
				break;
			}
			case chunkKinds.other:
			case chunkKinds.aliased: {
				if (Array.isArray(chunk)) collectChunksUsedTables(chunk, out);
				else if (isSQLWrapper(chunk)) collectChunksUsedTables(chunk.getSQL().queryChunks, out);
				break;
			}
		}
	}
}

// Defined separately from the Column class to resolve circular dependency
Column.prototype.getSQL = function() {
	return new SQL([this]);
};
// Defined separately from the StringChunk class to resolve circular dependency
StringChunk.prototype.getSQL = function() {
	return new SQL([this]);
};
// Defined separately from the Subquery class to resolve circular dependency
Subquery.prototype.getSQL = function() {
	return new SQL([this]);
};

// `[Qualifier]` defined separately to resolve circular dependency
function defineQualifier<T extends object>(prototype: T, build: (self: T) => SQLChunk): void {
	Object.defineProperty(prototype, Qualifier, {
		get(this: T) {
			const value = build(this);
			Object.defineProperty(this, Qualifier, { value, enumerable: false, configurable: true, writable: true });
			return value;
		},
		configurable: true,
	});
}

function qualifiedName(schema: string | undefined, name: string): SQL {
	return new SQL(schema === undefined ? [new Name(name)] : [new Name(schema), commonStringChunks['.'], new Name(name)]);
}

defineQualifier(Table.prototype, (table) => qualifiedName(table[TableSchema], table[TableName]));
defineQualifier(View.prototype, (view) => qualifiedName(view[ViewBaseConfig].schema, view[ViewBaseConfig].name));
defineQualifier(Subquery.prototype, (subquery) => new Name(subquery._.alias));

export type SQLEntity = SQL | SQLWrapper | SQL.Aliased | Table | View;
