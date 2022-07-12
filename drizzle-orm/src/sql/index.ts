import { Column } from '../column';
import { AnyTable, Table } from '../table';
import { getTableName } from '../utils';

export type ParamValue = string | number | boolean | null | Record<string, unknown> | Date;

export class Param {
	constructor(public readonly value: ParamValue) {}
}

export type Chunk<TTableName extends string> =
	| string
	| AnyTable<TTableName>
	| Column<TTableName>
	| Param;

export interface BuildQueryConfig {
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
}

export class SQL<TTable extends string = string> {
	constructor(public readonly queryChunks: Chunk<TTable>[]) {}

	public toQuery({ escapeName, escapeParam }: BuildQueryConfig): [string, ParamValue[]] {
		const params: ParamValue[] = [];

		const chunks = this.queryChunks.map((chunk) => {
			if (typeof chunk === 'string') {
				return chunk;
			} else if (chunk instanceof Table) {
				return escapeName(getTableName(chunk));
			} else if (chunk instanceof Column) {
				return escapeName(getTableName(chunk.table)) + '.' + escapeName(chunk.name);
			} else if (chunk instanceof Param) {
				params.push(chunk.value);
				return escapeParam(params.length - 1, chunk.value);
			} else {
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

export type SQLSourceParam<TTableName extends string> =
	| Column<TTableName>
	| Column<TTableName>[]
	| ParamValue
	| ParamValue[]
	| SQL<any>
	| SQL<any>[]
	| AnyTable<TTableName>
	| AnyTable<TTableName>[]
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
	} else if (param instanceof Table || param instanceof Column) {
		return [param];
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
	params.forEach((param, paramIndex) => {
		if (paramIndex === 0) {
			queryChunks.push(strings[0]!);
		}

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
		list: (string | SQL<TTableName>)[],
	): SQL<TTableName> {
		const queryChunks: Chunk<TTableName>[] = [];
		for (const param of list) {
			if (typeof param === 'string') {
				queryChunks.push(param);
			} else if (param instanceof SQL) {
				queryChunks.push(...param.queryChunks);
			}
		}
		return new SQL(queryChunks);
	}
}

export function raw<TTableName extends string = string>(str: string): SQL<TTableName> {
	return sql.fromList([str]);
}
