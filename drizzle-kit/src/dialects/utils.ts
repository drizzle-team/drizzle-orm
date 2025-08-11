import type { Simplify } from '../utils';

export type Named = {
	name: string;
};

export type NamedWithSchema = {
	name: string;
	schema: string;
};

export type ModifiedItems<T> = {
	schema?: string;
	table: string;
	items: T[];
};

export type RenamedItems<T> = {
	schema?: string;
	table: string;
	renames: { from: T; to: T }[];
};

type NullIfUndefined<T> = T extends undefined ? null : T;

export const getOrNull = <T extends Record<string, unknown>, TKey extends keyof T>(
	it: T | null,
	key: TKey,
): NullIfUndefined<T[TKey]> | null => {
	if (it === null) return null;
	return (it?.[key] ?? null) as any;
};

export type GroupedRow<
	TStatement extends { $diffType: 'create' | 'drop' | 'alter'; schema?: string | null; table?: string | null },
> =
	& {
		inserted: TStatement[];
		deleted: TStatement[];
		updated: TStatement[];
	}
	& {
		[K in 'schema' | 'table' as null extends TStatement[K] ? never : K]: TStatement[K];
	};

export const groupDiffs = <
	T extends { $diffType: 'create' | 'drop' | 'alter'; schema?: string | null; table?: string | null },
>(
	arr: T[],
): Simplify<GroupedRow<T>>[] => {
	if (arr.length === 0) return [];
	if (!arr[0].table && !arr[0].schema) throw new Error('No schema or table in item');

	const res: GroupedRow<T>[] = [];
	for (let i = 0; i < arr.length; i++) {
		const stmnt = arr[i];

		const idx = res.findIndex((it) =>
			('schema' in it ? stmnt.schema === it['schema'] : true) && ('table' in it ? stmnt.table === it.table : true)
		);

		let item: GroupedRow<T>;

		if (idx < 0) {
			const sch = 'schema' in stmnt ? { schema: stmnt.schema } : {};
			const tbl = 'table' in stmnt ? { table: stmnt.table } : {};
			item = {
				...sch,
				...tbl,
				deleted: [],
				inserted: [],
				updated: [],
			} as any;
			res.push(item);
		} else {
			item = res[idx];
		}

		if (stmnt.$diffType === 'drop') {
			item.deleted.push(stmnt);
		} else if (stmnt.$diffType === 'create') {
			item.inserted.push(stmnt);
		} else {
			item.updated.push(stmnt);
		}
	}
	return res;
};

export const numberForTs = (value: string) => {
	const check = Number(value);

	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return { mode: 'number', value: value };
	return { mode: 'bigint', value: `${value}n` };
};

export const parseParams = (type: string) => {
	return type.match(/\(([0-9,\s]+)\)/)?.[1].split(',').map((x) => x.trim()) ?? [];
};

export const escapeForSqlDefault = (input: string, mode: 'default' | 'pg-arr' = 'default') => {
	let value = input.replace(/\\/g, '\\\\').replace(/'/g, "''");
	if (mode === 'pg-arr') value = value.replaceAll('"', '\\"');
	return value;
};

export const unescapeFromSqlDefault = (input: string) => {
	return input.replace(/''/g, "'").replace(/\\\\/g, '\\');
};

export const escapeForTsLiteral = (input: string) => {
	return input.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
};

export function inspect(it: any): string {
	if (!it) return '';

	const keys = Object.keys(it);
	if (keys.length === 0) return '';

	const pairs = keys.map((key) => {
		const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
			? key
			: `'${key}'`;

		const value = it[key];
		const formattedValue = typeof value === 'string' ? `'${value}'` : String(value);

		return `${formattedKey}: ${formattedValue}`;
	});

	return `{ ${pairs.join(', ')} }`;
}
