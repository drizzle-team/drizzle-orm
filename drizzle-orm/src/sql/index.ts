import { entityKind, is } from '~/entity.ts';
import { Relation } from '~/relations.ts';
import { Subquery, SubqueryConfig } from '~/subquery.ts';
import { tracer } from '~/tracing.ts';
import { View, ViewBaseConfig } from '~/view.ts';
import type { AnyColumn } from '../column.ts';
import { Column } from '../column.ts';
import { Table } from '../table.ts';

export * from './expressions/index.ts';

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
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
	escapeString(str: string): string;
	prepareTyping?: (encoder: DriverValueEncoder<unknown, unknown>) => QueryTypingsValue;
	paramStartIndex?: { value: number };
	inlineParams?: boolean;
}

export type QueryTypingsValue = 'json' | 'decimal' | 'time' | 'timestamp' | 'uuid' | 'date' | 'none';

export interface Query {
	sql: string;
	params: unknown[];
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
export interface SQLWrapper {
	getSQL(): SQL;
}

export function isSQLWrapper(value: unknown): value is SQLWrapper {
	return typeof value === 'object' && value !== null && 'getSQL' in value
		&& typeof (value as any).getSQL === 'function';
}

function mergeQueries(queries: Query[]): Query {
	const result: Query = { sql: '', params: [] };
	for (const query of queries) {
		result.sql += query.sql;
		result.params.push(...query.params);
		if (query.typings?.length) {
			result.typings = result.typings || [];
			result.typings.push(...query.typings);
		}
	}
	return result;
}

export class StringChunk implements SQLWrapper {
	static readonly [entityKind]: string = 'StringChunk';

	readonly value: string[];

	constructor(value: string | string[]) {
		this.value = Array.isArray(value) ? value : [value];
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class SQL<T = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQL';

	declare _: {
		brand: 'SQL';
		type: T;
	};

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
	private shouldInlineParams = false;

	constructor(readonly queryChunks: SQLChunk[]) {}

	append(query: SQL): this {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): Query {
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
		const config = Object.assign({}, _config, {
			inlineParams: _config.inlineParams || this.shouldInlineParams,
			paramStartIndex: _config.paramStartIndex || { value: 0 },
		});

		const {
			escapeName,
			escapeParam,
			prepareTyping,
			inlineParams,
			paramStartIndex,
		} = config;

		return mergeQueries(chunks.map((chunk): Query => {
			if (is(chunk, StringChunk)) {
				return { sql: chunk.value.join(''), params: [] };
			}

			if (is(chunk, Name)) {
				return { sql: escapeName(chunk.value), params: [] };
			}

			if (chunk === undefined) {
				return { sql: '', params: [] };
			}

			if (Array.isArray(chunk)) {
				const result: SQLChunk[] = [new StringChunk('(')];
				for (const [i, p] of chunk.entries()) {
					result.push(p);
					if (i < chunk.length - 1) {
						result.push(new StringChunk(', '));
					}
				}
				result.push(new StringChunk(')'));
				return this.buildQueryFromSourceParams(result, config);
			}

			if (is(chunk, SQL)) {
				return this.buildQueryFromSourceParams(chunk.queryChunks, {
					...config,
					inlineParams: inlineParams || chunk.shouldInlineParams,
				});
			}

			if (is(chunk, Table)) {
				const schemaName = chunk[Table.Symbol.Schema];
				const tableName = chunk[Table.Symbol.Name];
				return {
					sql: schemaName === undefined
						? escapeName(tableName)
						: escapeName(schemaName) + '.' + escapeName(tableName),
					params: [],
				};
			}

			if (is(chunk, Column)) {
				return { sql: escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(chunk.name), params: [] };
			}

			if (is(chunk, View)) {
				const schemaName = chunk[ViewBaseConfig].schema;
				const viewName = chunk[ViewBaseConfig].name;
				return {
					sql: schemaName === undefined
						? escapeName(viewName)
						: escapeName(schemaName) + '.' + escapeName(viewName),
					params: [],
				};
			}

			if (is(chunk, Param)) {
				const mappedValue = (chunk.value === null) ? null : chunk.encoder.mapToDriverValue(chunk.value);

				if (is(mappedValue, SQL)) {
					return this.buildQueryFromSourceParams([mappedValue], config);
				}

				if (inlineParams) {
					return { sql: this.mapInlineParam(mappedValue, config), params: [] };
				}

				let typings: QueryTypingsValue[] | undefined;
				if (prepareTyping !== undefined) {
					typings = [prepareTyping(chunk.encoder)];
				}

				return { sql: escapeParam(paramStartIndex.value++, mappedValue), params: [mappedValue], typings };
			}

			if (is(chunk, Placeholder)) {
				return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk] };
			}

			if (is(chunk, SQL.Aliased) && chunk.fieldAlias !== undefined) {
				return { sql: escapeName(chunk.fieldAlias), params: [] };
			}

			if (is(chunk, Subquery)) {
				if (chunk[SubqueryConfig].isWith) {
					return { sql: escapeName(chunk[SubqueryConfig].alias), params: [] };
				}
				return this.buildQueryFromSourceParams([
					new StringChunk('('),
					chunk[SubqueryConfig].sql,
					new StringChunk(') '),
					new Name(chunk[SubqueryConfig].alias),
				], config);
			}

			// if (is(chunk, Placeholder)) {
			// 	return {sql: escapeParam}

			if (isSQLWrapper(chunk)) {
				return this.buildQueryFromSourceParams([
					new StringChunk('('),
					chunk.getSQL(),
					new StringChunk(')'),
				], config);
			}

			if (is(chunk, Relation)) {
				return this.buildQueryFromSourceParams([
					chunk.sourceTable,
					new StringChunk('.'),
					sql.identifier(chunk.fieldName),
				], config);
			}

			if (inlineParams) {
				return { sql: this.mapInlineParam(chunk, config), params: [] };
			}

			return { sql: escapeParam(paramStartIndex.value++, chunk), params: [chunk] };
		}));
	}

	private mapInlineParam(
		chunk: unknown,
		{ escapeString }: BuildQueryConfig,
	): string {
		if (chunk === null) {
			return 'null';
		}
		if (typeof chunk === 'number' || typeof chunk === 'boolean') {
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

	getSQL(): SQL {
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

export function sql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T>;
/*
	The type of `params` is specified as `SQLSourceParam[]`, but that's slightly incorrect -
	in runtime, users won't pass `FakePrimitiveParam` instances as `params` - they will pass primitive values
	which will be wrapped in `Param` using `buildChunksFromParam(...)`. That's why the overload
	specify `params` as `any[]` and not as `SQLSourceParam[]`. This type is used to make our lives easier and
	the type checker happy.
*/
export function sql(strings: TemplateStringsArray, ...params: SQLChunk[]): SQL {
	const queryChunks: SQLChunk[] = [];
	if (params.length > 0 || (strings.length > 0 && strings[0] !== '')) {
		queryChunks.push(new StringChunk(strings[0]!));
	}
	for (const [paramIndex, param] of params.entries()) {
		queryChunks.push(param, new StringChunk(strings[paramIndex + 1]!));
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
}

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper {
		static readonly [entityKind]: string = 'SQL.Aliased';

		declare _: {
			brand: 'SQL.Aliased';
			type: T;
		};

		/** @internal */
		isSelectionField = false;

		constructor(
			readonly sql: SQL,
			readonly fieldAlias: string,
		) {}

		getSQL(): SQL {
			return this.sql;
		}

		/** @internal */
		clone() {
			return new Aliased(this.sql, this.fieldAlias);
		}
	}
}

export class Placeholder<TName extends string = string, TValue = any> implements SQLWrapper {
	static readonly [entityKind]: string = 'Placeholder';

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

		return p;
	});
}

// Defined separately from the Column class to resolve circular dependency
Column.prototype.getSQL = function() {
	return new SQL([this]);
};
