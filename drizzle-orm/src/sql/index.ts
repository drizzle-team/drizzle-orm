import { Subquery, SubqueryConfig } from '~/subquery';
import { View, ViewBaseConfig } from '~/view';
import type { AnyColumn } from '../column';
import { Column } from '../column';
import { Table } from '../table';

/**
 * This class is used to indicate a primitive param value that is used in `sql` tag.
 * It is only used on type level and is never instantiated at runtime.
 * If you see a value of this type in the code, its runtime value is actually the primitive param value.
 */
export class FakePrimitiveParam {}

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
	paramStartIndex?: number;
	inlineParams?: boolean;
}

export type QueryTypingsValue = 'json' | 'decimal' | 'time' | 'timestamp' | 'uuid' | 'date' | 'none';

export interface Query {
	sql: string;
	params: unknown[];
	typings?: QueryTypingsValue[];
}

export interface SQLWrapper {
	getSQL(): SQL;
}

export function isSQLWrapper(value: unknown): value is SQLWrapper {
	return typeof value === 'object' && value !== null && 'getSQL' in value
		&& typeof (value as any).getSQL === 'function';
}

export class SQL<T = unknown> implements SQLWrapper {
	declare protected $brand: 'SQL';

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
	private shouldInlineParams = false;

	constructor(readonly queryChunks: Chunk[]) {}

	append(chunk: SQL): this {
		this.queryChunks.push(...chunk.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): Query {
		const {
			escapeName,
			escapeParam,
			escapeString,
			prepareTyping,
			paramStartIndex = 0,
			inlineParams = false,
		} = config;
		const params: unknown[] = [];
		const typings: QueryTypingsValue[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (chunk instanceof SQL) {
				const sqlChunkParts = chunk.toQuery({
					...config,
					paramStartIndex: paramStartIndex + params.length,
					inlineParams: this.shouldInlineParams || config.inlineParams,
				});
				params.push(...sqlChunkParts.params);
				if (prepareTyping && sqlChunkParts.typings) typings.push(...sqlChunkParts.typings);
				return sqlChunkParts.sql;
			}

			if (typeof chunk === 'string') {
				return chunk;
			}

			if (chunk instanceof Name) {
				return escapeName(chunk.value);
			}

			if (chunk instanceof Table) {
				const schemaName = chunk[Table.Symbol.Schema];
				const tableName = chunk[Table.Symbol.Name];
				return typeof schemaName !== 'undefined'
					? escapeName(schemaName) + '.' + escapeName(tableName)
					: escapeName(tableName);
			}

			if (chunk instanceof Column) {
				return escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(chunk.name);
			}

			if (chunk instanceof View) {
				const schemaName = chunk[ViewBaseConfig].schema;
				const viewName = chunk[ViewBaseConfig].name;
				return typeof schemaName !== 'undefined'
					? escapeName(schemaName) + '.' + escapeName(viewName)
					: escapeName(viewName);
			}

			if (chunk instanceof Param) {
				const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);

				if (mappedValue instanceof SQL) {
					const mappedValueQuery = mappedValue.toQuery({
						...config,
						paramStartIndex: paramStartIndex + params.length,
						inlineParams: this.shouldInlineParams || config.inlineParams,
					});
					params.push(...mappedValueQuery.params);
					if (prepareTyping && mappedValueQuery.typings) typings.push(...mappedValueQuery.typings);
					return mappedValueQuery.sql;
				}

				if (this.shouldInlineParams || inlineParams) {
					if (mappedValue === null) {
						return 'null';
					}
					if (mappedValue === undefined) {
						return '';
					}
					if (typeof mappedValue === 'number' || typeof mappedValue === 'boolean') {
						return mappedValue.toString();
					}
					if (typeof mappedValue === 'string') {
						return escapeString(mappedValue);
					}
					if (typeof mappedValue === 'object') {
						const mappedValueAsString = mappedValue.toString();
						if (mappedValueAsString === '[object Object]') {
							return escapeString(JSON.stringify(mappedValue));
						}
						return escapeString(mappedValueAsString);
					}
					throw new Error('Unexpected param value: ' + mappedValue);
				}

				params.push(mappedValue);
				if (typeof prepareTyping !== 'undefined') typings.push(prepareTyping(chunk.encoder));
				return escapeParam(paramStartIndex + params.length - 1, chunk.value);
			}

			const err = new Error('Unexpected chunk type!');
			console.error(chunk);
			throw err;
		});

		const sqlString = chunks.join('');

		return { sql: sqlString, params, typings };
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
		if (typeof alias === 'undefined') {
			return this;
		}

		return new SQL.Aliased(this, alias);
	}

	mapWith<
		TDecoder extends
			| DriverValueDecoder<any, any>
			| DriverValueDecoder<any, any>['mapFromDriverValue'],
	>(decoder: TDecoder): SQL<GetDecoderResult<TDecoder>> {
		if (typeof decoder === 'function') {
			this.decoder = { mapFromDriverValue: decoder };
		} else {
			this.decoder = decoder;
		}
		return this as SQL<GetDecoderResult<TDecoder>>;
	}

	inlineParams(): this {
		this.shouldInlineParams = true;
		return this;
	}
}

export type GetDecoderResult<T> = T extends
	| DriverValueDecoder<infer TData, any>
	| DriverValueDecoder<infer TData, any>['mapFromDriverValue'] ? TData
	: never;

/**
 * Any DB name (table, column, index etc.)
 */
export class Name {
	protected brand!: 'Name';

	constructor(readonly value: string) {}
}

/**
 * Any DB name (table, column, index etc.)
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
export class Param<TDataType = unknown, TDriverParamType = TDataType> {
	protected brand!: 'BoundParamValue';

	/**
	 * @param value - Parameter value
	 * @param encoder - Encoder to convert the value to a driver parameter
	 */
	constructor(
		readonly value: TDataType,
		readonly encoder: DriverValueEncoder<TDataType, TDriverParamType> = noopEncoder,
	) {}
}

export function param<TData, TDriver>(
	value: TData,
	encoder?: DriverValueEncoder<TData, TDriver>,
): Param<TData, TDriver> {
	return new Param(value, encoder);
}

export type SQLSourceParam =
	| SQLSourceParam[]
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

function buildChunksFromParam(param: SQLSourceParam): Chunk[] {
	if (Array.isArray(param)) {
		const result: Chunk[] = ['('];
		param.forEach((p, i) => {
			result.push(...buildChunksFromParam(p));
			if (i < param.length - 1) {
				result.push(', ');
			}
		});
		result.push(')');
		return result;
	}

	if (
		param instanceof Table
		|| param instanceof Column
		|| param instanceof Name
		|| param instanceof Param
		|| param instanceof View
		|| param instanceof SQL
	) {
		return [param];
	}

	if (param instanceof SQL.Aliased && typeof param.fieldAlias !== 'undefined') {
		return [new Name(param.fieldAlias)];
	}

	if (param instanceof Subquery) {
		if (param[SubqueryConfig].isWith) {
			return [new Name(param[SubqueryConfig].alias)];
		}
		return ['(', param[SubqueryConfig].sql, ') ', new Name(param[SubqueryConfig].alias)];
	}

	if (isSQLWrapper(param)) {
		return ['(', param.getSQL(), ')'];
	}

	if (param !== undefined) {
		return [new Param(param)];
	}

	return [];
}

export function sql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T>;
/*
	The type of `params` is specified as `SQLSourceParam[]`, but that's slightly incorrect -
	in runtime, users won't pass `FakePrimitiveParam` instances as `params` - they will pass primitive values
	which will be wrapped in `Param` using `buildChunksFromParam(...)`. That's why the overload
	specify `params` as `any[]` and not as `SQLSourceParam[]`. This type is used to make our lives easier and
	the type checker happy.
*/
export function sql(strings: TemplateStringsArray, ...params: SQLSourceParam[]): SQL {
	const queryChunks: Chunk[] = [];
	if (params.length > 0 || (strings.length > 0 && strings[0] !== '')) {
		queryChunks.push(strings[0]!);
	}
	params.forEach((param, paramIndex) => {
		queryChunks.push(...buildChunksFromParam(param));
		queryChunks.push(strings[paramIndex + 1]!);
	});

	return new SQL(queryChunks);
}

export namespace sql {
	export function empty(): SQL {
		return new SQL([]);
	}

	export function fromList(list: SQLSourceParam[]): SQL {
		return new SQL(list.map(buildChunksFromParam).flat(1));
	}

	/**
	 * Convenience function to create an SQL query from a raw string.
	 * @param str The raw SQL query string.
	 */
	export function raw(str: string): SQL {
		return new SQL([str]);
	}
}

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper {
		declare protected $brand: 'SQL.Aliased';
		declare protected $type: T;

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

export class Placeholder<TName extends string = string, TValue = any> {
	declare protected $brand: 'Placeholder';
	declare protected $type: TValue;

	constructor(readonly name: TName) {}
}

export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
	return new Placeholder(name);
}

export function fillPlaceholders(params: unknown[], values: Record<string, unknown>): unknown[] {
	return params.map((p) => {
		if (p instanceof Placeholder) {
			if (!(p.name in values)) {
				throw new Error(`No value for placeholder "${p.name}" was provided`);
			}
			return values[p.name];
		}

		return p;
	});
}
