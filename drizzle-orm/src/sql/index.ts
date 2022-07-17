import { AnyColumn, Column } from '../column';
import { AnyTable, Table } from '../table';
import { tableName } from '../utils';

export class Param {
	constructor(public readonly value: unknown) {}
}

export type Chunk<TTableName extends string> =
	| string
	| AnyTable<TTableName>
	| AnyColumn<TTableName>
	| Name
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export class SQL<TTableName extends string, TDriverParam> {
	constructor(public readonly queryChunks: Chunk<TTableName>[]) {}

	public toQuery({ escapeName, escapeParam }: BuildQueryConfig): [string, TDriverParam[]] {
		const params: TDriverParam[] = [];

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
				params.push(chunk.value as TDriverParam);
				return escapeParam(params.length - 1, chunk.value);
			} else {
				const err = new Error('Unexpected chunk type!');
				console.error(chunk);
				throw err;
			}
		});

		const sqlString = chunks
			.join('')
			.trim()
			.replace(/\s{2,}/, ' ')
			.replace(/\n+/g, '');

		return [sqlString, params];
	}
}

export type AnySQL<TTableName extends string = string> = SQL<TTableName, any>;

/**
 * Any DB name (table, column, index etc.)
 */
export class Name {
	protected brand!: 'Name';
	constructor(public readonly value: string) {}
}

export interface ParamValueMapper<TType, TDriverType> {
	mapFromDriverValue(value: TDriverType): TType;
	mapToDriverValue(value: TType): TDriverType;
}

export class MappedParamValue<TType, TDriverType> {
	private brand!: 'MappedParamValue';
	constructor(
		public readonly value: TType,
		public readonly mapper: ParamValueMapper<TType, TDriverType>,
	) {}
}

function buildChunksFromParam<TTableName extends string>(param: unknown): Chunk<TTableName>[] {
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
	} else if (
		param instanceof Table
		|| param instanceof Column
		|| param instanceof Name
	) {
		return [param];
	} else if (param instanceof MappedParamValue) {
		return [new Param(param.mapper.mapToDriverValue(param.value))];
	} else if (typeof param !== 'undefined') {
		return [new Param(param)];
	} else {
		return [];
	}
}

export type SQLSourceParam<TTableName extends string = string> =
	| AnyColumn<TTableName>
	| Name
	| MappedParamValue<any, any>
	| AnySQL
	| AnyTable<TTableName>
	| undefined
	| SQLSourceParam<TTableName>[]
	| unknown;

export type MapSQLSourceParam<TParam extends SQLSourceParam> = TParam extends any[] ? MapSQLSourceParam<TParam[number]>
	: TParam extends Column<any, any, infer TDriverParam, any, any> ? TDriverParam
	: TParam extends MappedParamValue<any, infer TDriverParam> ? TDriverParam
	: TParam extends SQL<any, infer TDriverParam> ? TDriverParam
	: never;

export function sql<TTableName extends string, TQueryParams extends SQLSourceParam<TTableName>[]>(
	strings: TemplateStringsArray,
	...params: TQueryParams
): SQL<TTableName, MapSQLSourceParam<TQueryParams[number]>> {
	const queryChunks: Chunk<TTableName>[] = [];
	if (params.length > 0 || (strings.length > 0 && strings[0] !== '')) {
		queryChunks.push(strings[0]!);
	}
	params.forEach((param, paramIndex) => {
		queryChunks.push(...buildChunksFromParam<TTableName>(param));
		queryChunks.push(strings[paramIndex + 1]!);
	});

	return new SQL(queryChunks);
}

export namespace sql {
	export function empty(): SQL<string, never> {
		return new SQL([]);
	}

	export function fromList<
		TTableName extends string,
		TQueryParams extends SQLSourceParam<TTableName>[],
	>(list: TQueryParams): SQL<TTableName, MapSQLSourceParam<TQueryParams[number]>> {
		return new SQL(list.map(buildChunksFromParam<TTableName>).flat(1));
	}

	export function response<T>() {
		return <TTableName extends string>(
			strings: TemplateStringsArray,
			...params: unknown[]
		): SQLResponse<TTableName, T> => {
			return new SQLResponseRaw(sql(strings, ...params));
		};
	}

	/**
	 * Convenience function to create an SQL query from a raw input.
	 * @param str The raw SQL query string.
	 */
	export function raw<TTableName extends string = string, TParams = unknown>(
		str: string,
	): SQL<TTableName, TParams> {
		return new SQL([str]);
	}
}

export abstract class SQLResponse<TTableName extends string = string, TValue = any> {
	protected value!: TValue;
	constructor(readonly sql: SQL<TTableName, TValue>) {}

	abstract mapFromDriverValue(value: any): TValue;
}

export class SQLResponseRaw<TTableName extends string, TValue = any> extends SQLResponse<
	TTableName,
	TValue
> {
	override mapFromDriverValue(value: any): TValue {
		return value;
	}
}
