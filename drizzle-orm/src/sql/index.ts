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
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export interface PreparedQuery {
	sql: string;
	params: unknown[];
}

export interface SQLWrapper {
	getSQL(): SQL;
}

export function isSQLWrapper(param: unknown): param is SQLWrapper {
	return !!param && typeof param === 'object' && 'getSQL' in param;
}

export class SQL implements SQLWrapper {
	declare protected $brand: 'SQL';

	constructor(public readonly queryChunks: Chunk[]) {}

	public toQuery({ escapeName, escapeParam }: BuildQueryConfig): PreparedQuery {
		const params: unknown[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (typeof chunk === 'string') {
				return chunk;
			} else if (chunk instanceof Name) {
				return escapeName(chunk.value);
			} else if (chunk instanceof Table) {
				return escapeName(chunk[Table.Symbol.Name]);
			} else if (chunk instanceof Column) {
				return escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(chunk.name);
			} else if (chunk instanceof Param) {
				params.push(chunk.value);
				return escapeParam(params.length, chunk.value);
			} else {
				const err = new Error('Unexpected chunk type!');
				console.error(chunk);
				throw err;
			}
		});

		const sqlString = chunks
			.join('')
			.trim()
			.replace(/\s{2,}/g, ' ')
			.replace(/\n+/g, '');

		return { sql: sqlString, params };
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

	constructor(public readonly value: string) {}
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
	| FakePrimitiveParam;

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
	} else if (typeof param !== 'undefined') {
		return [new Param(param as unknown)];
	} else {
		throw new Error('Unexpected param type: ' + param);
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
