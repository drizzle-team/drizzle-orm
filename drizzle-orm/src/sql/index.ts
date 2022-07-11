import { getTableName } from '../utils';
import { AnyTable, Column, Table } from '..';

export type Primitive = string | number | boolean | null | Record<string, unknown> | Date;

export class Param {
	constructor(public readonly value: Primitive) { }
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
	constructor(public readonly queryChunks: Chunk<TTable>[]) { }

	public toQuery({ escapeName, escapeParam }: BuildQueryConfig): [string, Primitive[]] {
		const params: Primitive[] = [];

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
	| Primitive
	| Primitive[]
	| SQL<any>
	| AnyTable<TTableName>
	| undefined;

export function sql<TTableName extends string>(
	strings: TemplateStringsArray,
	...params: SQLSourceParam<TTableName>[]
): SQL<TTableName> {
	const queryChunks: Chunk<TTableName>[] = [];
	params.forEach((param, paramIndex) => {
		if (paramIndex === 0) {
			queryChunks.push(strings[0]!);
		}

		if (param instanceof Table || param instanceof Column) {
			queryChunks.push(param);
		} else if (param instanceof Array) {
			queryChunks.push('(');
			param.forEach((p, j) => {
				queryChunks.push(new Param(p));
				if (j < param.length - 1) {
					queryChunks.push(', ');
				}
			});
			queryChunks.push(')');
		} else if (param instanceof SQL) {
			queryChunks.push(...param.queryChunks);
		} else if (typeof param !== 'undefined') {
			queryChunks.push(new Param(param));
		}

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

// const users = new Table('users');
// const usersId = new Column(users, 'id');
// const usersAge = new Column(users, 'age');
// const usersName = new Column(users, 'name');
// const usersCityId = new Column(users, 'city_id');

// const cities = new Table('Cities');
// const citiesId = new Column(cities, 'id');
// const citiesName = new Column(cities, 'name');

// const citiesList = ['New York', 'Los Angeles', 'Chicago'];
// const age = 10;

// const subquery = sql`select user_id from cities where name in ${citiesList}`;
// const query = sql`${usersId} in ${subquery} or ${usersAge} > ${age}`;
// console.log({ query: query.query, params: query.params });

// const name = 'John';

// const rawQuery = sql`
//   select
//     ${usersId}, max(${usersAge}) as max_age
//     from ${users}
//     left join ${cities}
//       on ${citiesId} = ${usersCityId}
//     where ${usersName} = ${name};
// `;
// console.log({ query: rawQuery.query, params: rawQuery.params });

// users.select({
// 	id: usersId,
// 	maxAge: sql`max(${usersAge})`,
// 	cityId: sql`foo(${usersCityId})`,
// });

// function max<TTable extends string>(col: Column<TTable>) {
// 	return sql`max(${col})`;
// }

// users.select({
// 	id: usersId,
// 	maxAge: max(usersAge),
// 	cityId: sql`foo(${usersCityId})`,
// 	// name: citiesName,
// 	// fooName: sql`foo(${citiesName})`,
// });
