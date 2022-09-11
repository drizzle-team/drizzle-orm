import { ColumnData, ColumnDriverParam, TableName, Unwrap } from '../branded-types';
import { AnyColumn, Column, GetColumnData } from '../column';
import { AnyTable, Table } from '../table';
import { GetTableName, tableName } from '../utils';

export class Param<TData = ColumnData | PrimitiveDriverParam> {
	constructor(public readonly value: TData) {}
}

export type Chunk<TTableName extends TableName = TableName> =
	| string
	| AnyTable<TTableName>
	| AnyColumn<TTableName>
	| Name
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export interface PreparedQuery<TDriverParam extends ColumnDriverParam = ColumnDriverParam> {
	sql: string;
	params: TDriverParam[];
}

export interface SQLWrapper {
	getSQL(): AnySQL;
}

export function isSQLWrapper(
	param: unknown,
): param is SQLWrapper {
	return !!param && typeof param === 'object' && 'getSQL' in param;
}

export class SQL<TTableName extends TableName> implements SQLWrapper {
	protected typeKeeper!: {
		brand: 'SQL';
		tableName: TTableName;
	};

	constructor(public readonly queryChunks: Chunk<TTableName>[]) {}

	public toQuery<TDriverParamType = unknown>(
		{ escapeName, escapeParam }: BuildQueryConfig,
	): PreparedQuery<ColumnDriverParam<TDriverParamType>> {
		const params: TDriverParamType[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (typeof chunk === 'string') {
				return chunk;
			} else if (chunk instanceof Name) {
				return escapeName(chunk.value);
			} else if (chunk instanceof Table) {
				return escapeName(chunk[tableName]);
			} else if (chunk instanceof Column) {
				return escapeName(chunk.table[tableName]) + '.' + escapeName(chunk.name);
			} else if (chunk instanceof Param) {
				params.push(chunk.value as TDriverParamType);
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

		return { sql: sqlString, params: params as ColumnDriverParam<TDriverParamType>[] };
	}

	getSQL(): AnySQL<TTableName> {
		return this;
	}

	as<TDecoder extends DriverValueDecoder<any, any> | DriverValueDecoder<any, any>['mapFromDriverValue']>(
		decoder: TDecoder,
	): SQLResponse<TTableName, GetDecoderColumnData<TDecoder>>;
	as<TData>(): SQLResponse<TTableName, ColumnData<TData>>;
	as(
		decoder: ((value: any) => any) | DriverValueDecoder<any, any> = noopDecoder,
	): SQLResponse<TTableName, ColumnData> {
		return new SQLResponse(
			this,
			typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder,
		);
	}
}

export type GetDecoderColumnData<T> = T extends DriverValueDecoder<infer TData, any> ? ColumnData<TData>
	: T extends DriverValueDecoder<infer TData, any>['mapFromDriverValue'] ? ColumnData<TData>
	: never;

export type AnySQL<TTableName extends TableName = TableName> = SQL<TTableName>;

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

/**
 * Parameter value that is bound to a specific mapper (usually, a column of a specific type)
 * @param value - Parameter value to bind
 * @param mapper - Mapper to use to convert the value to/from the driver parameter
 */
export class BoundParamValue<TDataType extends ColumnData, TDriverParamType extends ColumnDriverParam> {
	protected brand!: 'BoundParamValue';

	constructor(
		public readonly value: TDataType,
		public readonly mapper: DriverValueMapper<Unwrap<TDataType>, Unwrap<TDriverParamType>>,
	) {}
}

export type AnyBoundParamValue = BoundParamValue<any, any>;

export type SQLSourceParam<TTableName extends TableName> =
	| SQLSourceParam<TTableName>[]
	| ColumnData
	| SQLWrapper
	| AnySQL<TTableName>
	| AnyTable<TTableName>
	| AnyColumn<TTableName>
	| AnyBoundParamValue
	| Name
	| PrimitiveDriverParam
	| undefined;

function buildChunksFromParam<TTableName extends TableName>(param: SQLSourceParam<TTableName>): Chunk<TTableName>[] {
	if (Array.isArray(param)) {
		const result: Chunk<TTableName>[] = ['('];
		param.forEach((p, i) => {
			result.push(...buildChunksFromParam<TTableName>(p));
			if (i < param.length - 1) {
				result.push(', ');
			}
		});
		result.push(')');
		return result;
	} else if (param instanceof SQL) {
		return param.queryChunks;
	} else if (isSQLWrapper(param)) {
		return buildChunksFromParam<TTableName>(param.getSQL());
	} else if (
		param instanceof Table
		|| param instanceof Column
		|| param instanceof Name
	) {
		return [param];
	} else if (param instanceof BoundParamValue) {
		return [new Param(param.mapper.mapToDriverValue(param.value) as PrimitiveDriverParam)];
	} else if (typeof param !== 'undefined') {
		return [new Param(param)];
	} else {
		return [];
	}
}

export type PrimitiveDriverParam = string | number | boolean | null;

export function sql<
	TTableName extends TableName,
>(
	strings: TemplateStringsArray,
	...params: (SQLSourceParam<TTableName> | PrimitiveDriverParam)[]
): SQL<TTableName>;
export function sql<
	TTableName extends string,
>(
	strings: TemplateStringsArray,
	...params: (SQLSourceParam<TableName<TTableName>> | PrimitiveDriverParam)[]
): SQL<TableName<TTableName>>;
export function sql(
	strings: TemplateStringsArray,
	...params: (SQLSourceParam<TableName> | PrimitiveDriverParam)[]
): AnySQL {
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
	export function empty(): AnySQL {
		return new SQL([]);
	}

	export function fromList<
		TTableName extends TableName = TableName,
	>(list: SQLSourceParam<TTableName>[]): SQL<TTableName> {
		return new SQL(list.map(buildChunksFromParam).flat(1));
	}

	/**
	 * Convenience function to create an SQL query from a raw string.
	 * @param str The raw SQL query string.
	 */
	export function raw<TTableName extends TableName = TableName>(
		str: string,
	): SQL<TTableName> {
		return new SQL([str]);
	}
}

export class SQLResponse<TTableName extends TableName, TValue extends ColumnData> {
	protected typeKeeper!: {
		brand: 'SQLResponse';
		tableName: TTableName;
		value: TValue;
	};

	constructor(
		readonly sql: SQL<TTableName>,
		readonly decoder: DriverValueDecoder<TValue, any>,
	) {}
}

export type AnySQLResponse<TTableName extends TableName = TableName> = SQLResponse<TTableName, any>;
