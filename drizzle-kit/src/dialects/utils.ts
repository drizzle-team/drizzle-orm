import { type Simplify, trimChar } from '../utils';
import type { CockroachDDL } from './cockroach/ddl';
import type { MssqlDDL } from './mssql/ddl';
import type { MysqlDDL } from './mysql/ddl';
import type { PostgresDDL } from './postgres/ddl';
import type { SQLiteDDL } from './sqlite/ddl';

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

export const numberForTs = (value: string): { mode: 'number' | 'bigint'; value: string } => {
	const check = Number(value);
	if (Number.isNaN(check)) return { mode: 'number', value: `sql\`${trimChar(escapeForTsLiteral(value), '"')}\`` };

	if (check >= Number.MIN_SAFE_INTEGER && check <= Number.MAX_SAFE_INTEGER) return { mode: 'number', value: value };
	return { mode: 'bigint', value: `${value}n` };
};

// numeric precision can be bigger than 9 as it was before here
export const parseParams = (type: string) => {
	return type.match(/\(((?:\d+(?:\s*,\s*\d+)*)|max)\)/i)?.[1].split(',').map((x) => x.trim()) ?? [];
};

export const escapeForSqlDefault = (input: string, mode: 'default' | 'pg-arr' = 'default') => {
	let value = input.replace(/\\/g, '\\\\').replace(/'/g, "''");
	if (mode === 'pg-arr') value = value.replaceAll('"', '\\"');
	return value;
};

export const unescapeFromSqlDefault = (input: string, mode: 'default' | 'arr' = 'default') => {
	let res = input.replace(/\\"/g, '"').replace(/\\\\/g, '\\');

	if (mode === 'arr') return res;
	return res.replace(/''/g, "'");
};

export const escapeForTsLiteral = (input: string) => {
	return JSON.stringify(input);
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

export const preserveEntityNames = <
	C extends
		| PostgresDDL['uniques' | 'fks' | 'pks' | 'indexes']
		| MysqlDDL['indexes' | 'fks']
		| MssqlDDL['uniques' | 'fks' | 'pks' | 'defaults']
		| CockroachDDL['fks' | 'pks' | 'indexes']
		| SQLiteDDL['uniques' | 'pks' | 'fks'],
>(
	collection1: C,
	collection2: C,
	mode: 'push' | 'default',
) => {
	const items = collection1.list().filter((x) => mode === 'push' || !x.nameExplicit);
	for (const left of items) {
		const { entityType: _1, name: _2, nameExplicit: _3, ...filter } = left;

		const match = collection2.list({ ...filter, nameExplicit: false } as any);

		if (match.length !== 1 || match[0].name === left.name) continue;

		collection2.update({
			set: { name: left.name },
			where: {
				...filter,
				nameExplicit: false,
			} as any,
		});
	}
};

export const filterMigrationsSchema = (
	interim: {
		schemas?: { name: string }[];
		columns: { table: string; schema?: string }[];
		pks: { table: string; schema?: string }[];
		tables: { name: string; schema?: string }[];
	},
	migrations: {
		schema: string;
		table: string;
	},
) => {
	const migrationsSchema = migrations.schema;
	const migrationsTable = migrations.table;

	interim.tables = interim.tables.filter((table) =>
		!(table.name === migrationsTable && (table.schema ? table.schema === migrationsSchema : true))
	);
	interim.columns = interim.columns.filter((column) =>
		!(column.table === migrationsTable && (column.schema ? column.schema === migrationsSchema : true))
	);
	interim.pks = interim.pks.filter((pk) =>
		!(pk.table === migrationsTable && (pk.schema ? pk.schema === migrationsSchema : true))
	);

	if (interim.schemas) {
		let tablesInMigrationSchema = interim.tables.filter((table) => table.schema === migrationsSchema);
		if (!tablesInMigrationSchema.length) {
			interim.schemas = interim.schemas.filter((schema) => schema.name !== migrationsSchema);
		}
	}

	return interim;
};
