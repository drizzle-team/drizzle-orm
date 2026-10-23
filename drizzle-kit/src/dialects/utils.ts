import type { DB, Simplify } from '../utils';
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
		defaults?: { table: string; schema?: string }[]; // for mssql only
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

	// mssql only
	if (interim.defaults) {
		interim.defaults = interim.defaults.filter((def) =>
			!(def.table === migrationsTable && (def.schema ? def.schema === migrationsSchema : true))
		);
	}

	if (interim.schemas) {
		let tablesInMigrationSchema = interim.tables.filter((table) => table.schema === migrationsSchema);
		if (!tablesInMigrationSchema.length) {
			interim.schemas = interim.schemas.filter((schema) => schema.name !== migrationsSchema);
		}
	}

	return interim;
};

export const batchQuery = async <T>(
	db: DB,
	getSQL: (params: { limit: number; cursor: T | undefined }) => string,
	callback: (count: number) => void,
	batchSize: number = 100_000,
): Promise<T[]> => {
	let results: T[] = [];
	let cursor: T | undefined;

	while (true) {
		const batch = await db.query(getSQL({ limit: batchSize, cursor }).trim());

		if (batch.length === 0) {
			break;
		}

		results.push(...batch);
		callback(results.length);

		if (batch.length < batchSize) {
			break;
		}

		cursor = batch[batch.length - 1];
	}
	return results;
};

export type EntityKey = string;
// names may contain `.` or `"`, so `${schema}.${name}` would be ambiguous
// schema is null for dialects without schemas (mysql, sqlite)
export const entityKey = (schema: string | null, name: string): EntityKey => JSON.stringify([schema, name]);

export interface SchemaMetadata {
	viewDependencies: Map<EntityKey, readonly EntityKey[]>;
}

/*
	DFS topological sort of create_view statements
	Every view goes after the views it reads from (direct dependencies from metadata, see `findViewDependencies` in dialects/drizzle.ts)
	dependencies that are not created in this migration are skipped, without metadata the order is kept as is

	fixes https://github.com/drizzle-team/drizzle-orm/issues/4520 and https://github.com/drizzle-team/drizzle-orm/issues/6176
*/
export const sortCreateViews = <T extends { view: { schema?: string; name: string } }>(
	statements: T[],
	viewDependencies: SchemaMetadata['viewDependencies'] | undefined,
): T[] => {
	if (!viewDependencies) return statements;

	const byKey = new Map<EntityKey, T>(statements.map((it) => [entityKey(it.view.schema ?? null, it.view.name), it]));
	const visited = new Set<EntityKey>();
	const sorted: T[] = [];

	const visit = (key: EntityKey) => {
		if (visited.has(key)) return; // marked on enter, so a dependency cycle can't loop forever
		visited.add(key);

		for (const dependency of viewDependencies.get(key) ?? []) {
			if (byKey.has(dependency)) visit(dependency);
		}

		sorted.push(byKey.get(key)!);
	};

	for (const key of byKey.keys()) visit(key);

	return sorted;
};
