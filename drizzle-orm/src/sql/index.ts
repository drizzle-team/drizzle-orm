import { AnyColumn, Column } from '../column';
import { AnyTable, Table } from '../table';
import { tableName } from '../utils';

export type ParamValue = string | number | boolean | null | Record<string, unknown> | Date;

export class Param {
	constructor(public readonly value: ParamValue) {}
}

export type Chunk<TTableName extends string> =
	| string
	| AnyTable<TTableName>
	| Column<TTableName>
	| ColumnWithoutTable<AnyColumn>
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export class SQL<TTableName extends string = string> {
	constructor(public readonly queryChunks: Chunk<TTableName>[]) {}

	public toQuery({ escapeName, escapeParam }: BuildQueryConfig): [string, ParamValue[]] {
		const params: ParamValue[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (typeof chunk === 'string') {
				return chunk;
			} else if (chunk instanceof Table) {
				return escapeName(chunk[tableName]);
			} else if (chunk instanceof Column) {
				return escapeName(chunk.table[tableName]) + '.' + escapeName(chunk.name);
			} else if (chunk instanceof ColumnWithoutTable) {
				return escapeName(chunk.column.name);
			} else if (chunk instanceof Param) {
				params.push(chunk.value);
				return escapeParam(params.length - 1, chunk.value);
			} else {
				console.log(chunk);
				throw new Error('Unexpected chunk type');
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

/**
 * Column that will be represented just as "column" instead of "table"."column" in the SQL.
 * Used in columns list in INSERT queries.
 */
export class ColumnWithoutTable<TColumn extends AnyColumn> {
	private brand!: 'ColumnWithoutTable';
	constructor(public readonly column: TColumn) {}
}

export interface ParamValueMapper<TType extends ParamValue> {
	mapFromDriverValue(value: any): TType;
	mapToDriverValue(value: TType): any;
}

export const noopParamValueMapper: ParamValueMapper<ParamValue> = {
	mapFromDriverValue: (value) => value,
	mapToDriverValue: (value) => value,
};

export class MappedParamValue<TType extends ParamValue> {
	private brand!: 'MappedParamValue';
	constructor(public readonly value: TType, public readonly mapper: ParamValueMapper<TType>) {}
}

export type SQLSourceParam<TTableName extends string = string> =
	| Column<TTableName>
	| ColumnWithoutTable<Column<TTableName>>
	| ParamValue
	| MappedParamValue<any>
	| SQL<any>
	| AnyTable<TTableName>
	| undefined
	| SQLSourceParam<TTableName>[];

function buildChunksFromParam<TTableName extends string>(
	param: SQLSourceParam<TTableName>,
): Chunk<TTableName>[] {
	if (Array.isArray(param)) {
		const result: Chunk<TTableName>[] = ['('];
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
	} else if (
		param instanceof Table ||
		param instanceof Column ||
		param instanceof ColumnWithoutTable
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

export function sql<TTableName extends string>(
	strings: TemplateStringsArray,
	...params: SQLSourceParam<TTableName>[]
): SQL<TTableName> {
	const queryChunks: Chunk<TTableName>[] = [];
	if (params.length > 0) {
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

	export function fromList<TTableName extends string>(
		list: SQLSourceParam<TTableName>[],
	): SQL<TTableName> {
		return new SQL(list.map(buildChunksFromParam).flat(1));
	}

	export function response<T>() {
		return <TTableName extends string>(
			strings: TemplateStringsArray,
			...params: SQLSourceParam<TTableName>[]
		): SQLResponse<TTableName, T> => {
			return new SQLResponseRaw(sql(strings, ...params));
		};
	}
}

/**
 * Convenience function to create an SQL query from a raw input.
 * @param str The raw SQL query string.
 */
export function raw<TTableName extends string = string>(str: string): SQL<TTableName> {
	return new SQL([str]);
}

export abstract class SQLResponse<TTableName extends string, TValue = any> {
	protected value!: TValue;
	constructor(readonly sql: SQL<TTableName>) {}

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
