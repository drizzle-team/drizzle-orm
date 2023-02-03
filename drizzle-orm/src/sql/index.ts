import { MySqlDate, MySqlDecimal, MySqlJson, MySqlTime, MySqlTimestamp } from '~/mysql-core';
import { PgDate, PgJson, PgJsonb, PgNumeric, PgTime, PgTimestamp, PgUUID } from '~/pg-core';
import { AnyColumn, Column } from '../column';
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
	| AnyColumn
	| Name
	| Param
	| Placeholder;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
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

function prepareTyping(encoder: DriverValueEncoder<unknown, unknown>): QueryTypingsValue {
	if (
		encoder instanceof PgJsonb || encoder instanceof PgJson
		|| encoder instanceof MySqlJson
	) {
		return 'json';
	} else if (encoder instanceof MySqlDecimal || encoder instanceof PgNumeric) {
		return 'decimal';
	} else if (encoder instanceof PgTime || encoder instanceof MySqlTime) {
		return 'time';
	} else if (encoder instanceof PgTimestamp || encoder instanceof MySqlTimestamp) {
		return 'timestamp';
	} else if (encoder instanceof PgDate || encoder instanceof MySqlDate) {
		return 'date';
	} else if (encoder instanceof PgUUID) {
		return 'uuid';
	} else {
		return 'none';
	}
}

export class SQL implements SQLWrapper {
	declare protected $brand: 'SQL';

	constructor(readonly queryChunks: Chunk[]) {}

	toQuery({ escapeName, escapeParam }: BuildQueryConfig): Query {
		const params: unknown[] = [];
		const typings: QueryTypingsValue[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (typeof chunk === 'string') {
				return chunk;
			} else if (chunk instanceof Name) {
				return escapeName(chunk.value);
			} else if (chunk instanceof Table) {
				const schemaName = chunk[Table.Symbol.Schema];
				return typeof schemaName !== 'undefined'
					? escapeName(schemaName) + '.' + escapeName(chunk[Table.Symbol.Name])
					: escapeName(chunk[Table.Symbol.Name]);
			} else if (chunk instanceof Column) {
				return escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(chunk.name);
			} else if (chunk instanceof Param) {
				params.push(chunk.encoder.mapToDriverValue(chunk.value));
				typings.push(prepareTyping(chunk.encoder));
				return escapeParam(params.length - 1, chunk.value);
			} else {
				const err = new Error('Unexpected chunk type!');
				console.error(chunk);
				throw err;
			}
		});

		const sqlString = chunks
			.join('')
			.trim();

		return { sql: sqlString, params, typings };
	}

	getSQL(): SQL {
		return this;
	}

	as<
		TDecoder extends
			| DriverValueDecoder<any, any>
			| DriverValueDecoder<any, any>['mapFromDriverValue'],
	>(decoder: TDecoder): SQLResponse<GetDecoderColumnData<TDecoder>>;
	as<TData>(): SQLResponse<TData>;
	as(
		decoder: ((value: any) => any) | DriverValueDecoder<any, any> = noopDecoder,
	): SQLResponse<unknown> {
		return new SQLResponse(
			this,
			typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder,
		);
	}
}

export type GetDecoderColumnData<T> = T extends
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
	mapToDriverValue(value: TData): TDriverParam;
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
	} else if (param instanceof SQL) {
		return param.queryChunks;
	} else if (isSQLWrapper(param)) {
		return buildChunksFromParam(param.getSQL());
	} else if (param instanceof Table || param instanceof Column || param instanceof Name || param instanceof Param) {
		return [param];
	} else if (param !== undefined) {
		return [new Param(param)];
	} else {
		return [];
	}
}

export function sql(strings: TemplateStringsArray, ...params: any[]): SQL;
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

export class SQLResponse<TValue = unknown> {
	declare protected $brand: 'SQLResponse';

	constructor(readonly sql: SQL, readonly decoder: DriverValueDecoder<TValue, any>) {}
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
