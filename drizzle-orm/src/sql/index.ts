import { AnyColumn, Column } from '../column';
import { AnyTable, Table } from '../table';
import { tableName } from '../utils';

export class Param<TDriverParam = unknown> {
	constructor(public readonly value: TDriverParam) {}
}

export type Chunk<TTableName extends string = string> =
	| string
	| AnyTable<TTableName>
	| AnyColumn<TTableName>
	| Name
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export class SQL<TTableName extends string> {
	constructor(public readonly queryChunks: Chunk<TTableName>[]) {}

	public toQuery<TDriverParam = unknown>({ escapeName, escapeParam }: BuildQueryConfig): [string, TDriverParam[]] {
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
			.replace(/\s{2,}/, ' ')
			.replace(/\n+/g, '');

		return [sqlString, params];
	}
}

export type AnySQL<TTableName extends string = string> = SQL<TTableName>;

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

/**
 * Parameter value that is bound to a specific mapper (usually, a column of a specific type)
 * @param value - Parameter value to bind
 * @param mapper - Mapper to use to convert the value to/from the driver parameter
 */
export class BoundParamValue<TType, TDriverType> {
	protected brand!: 'BoundParamValue';

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
	} else if (param instanceof BoundParamValue) {
		return [new Param(param.mapper.mapToDriverValue(param.value))];
	} else if (typeof param !== 'undefined') {
		return [new Param(param)];
	} else {
		return [];
	}
}

export function sql<TTableName extends string>(
	strings: TemplateStringsArray,
	...params: (AnyColumn<TTableName> | AnyTable<TTableName> | AnySQL)[]
): SQL<TTableName>;
export function sql<TTableName extends string = string>(
	strings: TemplateStringsArray,
	...params: unknown[]
): SQL<TTableName>;
export function sql(
	strings: TemplateStringsArray,
	...params: unknown[]
): SQL<string> {
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
		TTableName extends string = string,
	>(list: unknown[]): SQL<TTableName> {
		return new SQL(list.map(buildChunksFromParam<TTableName>).flat(1));
	}

	export function response<T>(column: AnyColumn) {
		return <TTableName extends string>(
			strings: TemplateStringsArray,
			...params: unknown[]
		): SQLResponse<TTableName, T> => {
			return new SQLResponse(sql(strings, ...params), column);
		};
	}

	/**
	 * Convenience function to create an SQL query from a raw string.
	 * @param str The raw SQL query string.
	 */
	export function raw<TTableName extends string = string>(
		str: string,
	): SQL<TTableName> {
		return new SQL([str]);
	}
}

export class SQLResponse<TTableName extends string, TValue> {
	protected typeKeeper!: {
		brand: 'SQLResponse';
		tableName: TTableName;
		value: TValue;
	};

	constructor(
		readonly sql: SQL<TTableName>,
		readonly column: AnyColumn,
	) {}
}

export type AnySQLResponse<TTableName extends string = string> = SQLResponse<TTableName, any>;
