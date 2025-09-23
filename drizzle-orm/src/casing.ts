import { Column } from '~/column.ts';
import { entityKind, is } from './entity.ts';
import type { View } from './sql/index.ts';
import { Table } from './table.ts';
import type { Casing } from './utils.ts';

export function toSnakeCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];

	return words.map((word) => word.toLowerCase()).join('_');
}

export function toCamelCase(input: string) {
	const words = input
		.replace(/['\u2019]/g, '')
		.match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? [];

	return words.reduce((acc, word, i) => {
		const formattedWord = i === 0 ? word.toLowerCase() : `${word[0]!.toUpperCase()}${word.slice(1)}`;
		return acc + formattedWord;
	}, '');
}

function noopCase(input: string) {
	return input;
}

export class CasingCache {
	static readonly [entityKind]: string = 'CasingCache';

	/** @internal */
	cache: Record<string, string> = {};
	private cachedTables: Record<string, true> = {};
	private convert: (input: string) => string;

	constructor(casing?: Casing) {
		this.convert = casing === 'snake_case'
			? toSnakeCase
			: casing === 'camelCase'
			? toCamelCase
			: noopCase;
	}

	getColumnCasing(column: Column): string {
		if (!column.keyAsName) return column.name;

		const schema = column.table[Table.Symbol.Schema] ?? 'public';
		const tableName = column.table[Table.Symbol.OriginalName];
		const key = `${schema}.${tableName}.${column.name}`;

		if (!this.cache[key]) {
			this.cacheTable(column.table);
		}
		return this.cache[key]!;
	}

	private cacheTable(table: Table | View) {
		const schema = table[Table.Symbol.Schema] ?? 'public';
		const tableName = table[Table.Symbol.OriginalName];
		const tableKey = `${schema}.${tableName}`;

		if (!this.cachedTables[tableKey]) {
			for (const column of Object.values(table[Table.Symbol.Columns])) {
				if (!is(column, Column)) continue;

				const columnKey = `${tableKey}.${column.name}`;
				this.cache[columnKey] = this.convert(column.name);
			}
			this.cachedTables[tableKey] = true;
		}
	}

	clearCache() {
		this.cache = {};
		this.cachedTables = {};
	}
}
