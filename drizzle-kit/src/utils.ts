import type { RunResult } from 'better-sqlite3';
import type { NamedWithSchema } from './dialects/utils';
import { snapshotVersion } from './global';
import type { Dialect } from './schemaValidator';
import type { ProxyParams } from './serializer/studio';

export type Proxy = (params: ProxyParams) => Promise<any[]>;

export type SqliteProxy = {
	proxy: (params: ProxyParams) => Promise<any[] | RunResult>;
};

export type DB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
};

export type SQLiteDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
};

export type LibSQLDB = {
	query: <T extends any = any>(sql: string, params?: any[]) => Promise<T[]>;
	run(query: string): Promise<void>;
	batchWithPragma?(queries: string[]): Promise<void>;
};

export type RecordValues<T> = T extends Record<string, infer U> ? U[] : never;
export type RecordValuesOptional<T> = T extends Record<string, infer U> ? (U[] | undefined) : never;
export type RecordValuesAnd<T, AND> = T extends Record<string, infer U> ? (U & AND)[] : never;
export type RecordValuesOptionalAnd<T, AND> = T extends Record<string, infer U> ? ((U & AND)[] | undefined) : never;

export type Simplify<T> =
	& {
		[K in keyof T]: T[K];
	}
	& {};

interface SchemaDuplicate {
	type: 'schema_name_duplicate';
	name: string;
}

interface EnumDuplicate {
	type: 'enum_name_duplicate';
	name: string;
	schema: string;
}

interface TableDuplicate {
	type: 'table_name_duplicate';
	name: string;
	schema: string;
}
interface ColumnDuplicate {
	type: 'column_name_duplicate';
	schema: string;
	table: string;
	name: string;
}

interface ConstraintDuplicate {
	type: 'constraint_name_duplicate';
	schema: string;
	table: string;
	name: string;
}
interface SequenceDuplicate {
	type: 'sequence_name_duplicate';
	schema: string;
	name: string;
}

interface ViewDuplicate {
	type: 'view_name_duplicate';
	schema: string;
	name: string;
}

interface IndexWithoutName {
	type: 'index_no_name';
	schema: string;
	table: string;
	sql: string;
}

interface IndexDuplicate {
	type: 'index_duplicate';
	schema: string;
	table: string;
	name: string;
}

interface PgVectorIndexNoOp {
	type: 'pgvector_index_noop';
	table: string;
	column: string;
	indexName: string;
	method: string;
}

interface PolicyDuplicate {
	type: 'policy_duplicate';
	schema: string;
	table: string;
	policy: string;
}

interface RoleDuplicate {
	type: 'role_duplicate';
	name: string;
}

export type SchemaError =
	| SchemaDuplicate
	| EnumDuplicate
	| TableDuplicate
	| ColumnDuplicate
	| ViewDuplicate
	| ConstraintDuplicate
	| SequenceDuplicate
	| IndexWithoutName
	| IndexDuplicate
	| PgVectorIndexNoOp
	| RoleDuplicate
	| PolicyDuplicate;

interface PolicyNotLinked {
	type: 'policy_not_linked';
	policy: string;
}
export type SchemaWarning = PolicyNotLinked;

export const copy = <T>(it: T): T => {
	return JSON.parse(JSON.stringify(it));
};

export const objectValues = <T extends object>(obj: T): Array<T[keyof T]> => {
	return Object.values(obj);
};

export type Journal = {
	version: string;
	dialect: Dialect;
	entries: {
		idx: number;
		version: string;
		when: number;
		tag: string;
		breakpoints: boolean;
	}[];
};

export const dryJournal = (dialect: Dialect): Journal => {
	return {
		version: snapshotVersion,
		dialect,
		entries: [],
	};
};

export const prepareMigrationRenames = (
	renames: {
		from: { schema?: string; table?: string; name: string };
		to: { schema?: string; table?: string; name: string };
	}[],
) => {
	return renames.map((it) => {
		const schema1 = it.from.schema ? `${it.from.schema}.` : '';
		const schema2 = it.to.schema ? `${it.to.schema}.` : '';

		const table1 = it.from.table ? `${it.from.table}.` : '';
		const table2 = it.to.table ? `${it.to.table}.` : '';

		return `${schema1}${table1}${it.from.name}->${schema2}${table2}${it.to.name}`;
	});
};

export const prepareMigrationMeta = (
	schemas: { from: string; to: string }[],
	tables: { from: NamedWithSchema; to: NamedWithSchema }[],
	columns: {
		from: { table: string; schema: string; column: string };
		to: { table: string; schema: string; column: string };
	}[],
) => {
	const _meta = {
		schemas: {} as Record<string, string>,
		tables: {} as Record<string, string>,
		columns: {} as Record<string, string>,
	};

	schemas.forEach((it) => {
		const from = schemaRenameKey(it.from);
		const to = schemaRenameKey(it.to);
		_meta.schemas[from] = to;
	});
	tables.forEach((it) => {
		const from = tableRenameKey(it.from);
		const to = tableRenameKey(it.to);
		_meta.tables[from] = to;
	});

	columns.forEach((it) => {
		const from = columnRenameKey(it.from.table, it.from.schema, it.from.column);
		const to = columnRenameKey(it.to.table, it.to.schema, it.to.column);
		_meta.columns[from] = to;
	});

	return _meta;
};

export const schemaRenameKey = (it: string) => {
	return it;
};

export const tableRenameKey = (it: NamedWithSchema) => {
	const out = it.schema ? `"${it.schema}"."${it.name}"` : `"${it.name}"`;
	return out;
};

export const columnRenameKey = (
	table: string,
	schema: string,
	column: string,
) => {
	const out = schema
		? `"${schema}"."${table}"."${column}"`
		: `"${table}"."${column}"`;
	return out;
};

export const kloudMeta = () => {
	return {
		pg: [5],
		mysql: [] as number[],
		sqlite: [] as number[],
	};
};

export const normalisePGliteUrl = (
	it: string,
) => {
	if (it.startsWith('file:')) {
		return it.substring(5);
	}

	return it;
};

export function isPgArrayType(sqlType: string) {
	return sqlType.match(/.*\[\d*\].*|.*\[\].*/g) !== null;
}

export function findAddedAndRemoved(columnNames1: string[], columnNames2: string[]) {
	const set1 = new Set(columnNames1);
	const set2 = new Set(columnNames2);

	const addedColumns = columnNames2.filter((it) => !set1.has(it));
	const removedColumns = columnNames1.filter((it) => !set2.has(it));

	return { addedColumns, removedColumns };
}

export function escapeSingleQuotes(str: string) {
	return str.replace(/'/g, "''");
}

export function unescapeSingleQuotes(str: string, ignoreFirstAndLastChar: boolean) {
	const regex = ignoreFirstAndLastChar ? /(?<!^)'(?!$)/g : /'/g;
	return str.replace(/''/g, "'").replace(regex, "\\'");
}
