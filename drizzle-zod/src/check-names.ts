import { getTableName, is } from 'drizzle-orm';
import type { Table } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';

export interface CheckNames {
	/** names of the table-level checks, in declaration order */
	table: string[];
	/** names of the column-level checks, by check builder */
	column: Map<object, string>;
}

const cache = new WeakMap<object, CheckNames>();

/**
 * The names drizzle-kit gives a pg table's CHECK constraints: unnamed ones follow postgres' scheme
 * (`<table>_check`, `<table>_<column>_check`, then `...check1`, `...check2`), counted across the whole
 * table, table-level checks first.
 */
export function pgCheckNames(table: Table): CheckNames {
	const cached = cache.get(table);
	if (cached) return cached;
	const names: CheckNames = { table: [], column: new Map() };
	if (!is(table, PgTable)) return names;
	const { checks, columns } = getTableConfig(table);
	const tableName = getTableName(table);
	const all: { name: string | undefined; base: string; set: (n: string) => void }[] = [
		...checks.map((c, i) => ({ name: c.name, base: tableName, set: (n: string) => (names.table[i] = n) })),
		...columns.flatMap((col) =>
			(col.checkConstraints ?? []).map((c) => ({
				name: c.name,
				base: `${tableName}_${col.name}`,
				set: (n: string) => names.column.set(c, n),
			}))
		),
	];
	const taken = new Set(all.map((c) => c.name).filter(Boolean) as string[]);
	for (const c of all) {
		let name = c.name;
		if (!name) {
			name = `${c.base}_check`;
			for (let i = 1; taken.has(name); i++) name = `${c.base}_check${i}`;
			taken.add(name);
		}
		c.set(name);
	}
	cache.set(table, names);
	return names;
}
