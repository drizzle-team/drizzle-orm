import { getTableName, is, SQL } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { AnySQLiteColumn, AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import {
	getTableConfig,
	getViewConfig,
	SQLiteBaseInteger,
	SQLiteDialect,
	SQLiteTable,
	SQLiteTimestamp,
	SQLiteView,
} from 'drizzle-orm/sqlite-core';
import { loadModule } from '../../utils/utils-node';
import { findViewDependencies, sqlToStr } from '../drizzle';
import { entityKey } from '../utils';
import type { EntityKey, SchemaMetadata } from '../utils';
import type {
	CheckConstraint,
	Column,
	ForeignKey,
	Index,
	InterimColumn,
	InterimSchema,
	PrimaryKey,
	Table,
	UniqueConstraint,
	View,
} from './ddl';
import { Int, nameForForeignKey, nameForPk, nameForUnique, transformOnUpdateDelete, typeFor } from './grammar';

// key of a sqlite view (no schemas in sqlite ddl), see `findViewDependencies` in dialects/drizzle.ts
// "is this one of my views, and if so, what's its key?"
const viewKey = (chunk: unknown): EntityKey | null => {
	if (!is(chunk, SQLiteView)) return null;

	// aliased views keep the real view name in originalName
	// an alias exists only in the ORM query
	return entityKey(null, getViewConfig(chunk).originalName);
};

export const fromDrizzleSchema = (
	dTables: AnySQLiteTable[],
	dViews: SQLiteView[],
): { schema: InterimSchema; metadata: SchemaMetadata } => {
	const dialect = new SQLiteDialect();
	const metadata: SchemaMetadata = { viewDependencies: new Map() };
	const tableConfigs = dTables.map((it) => ({ table: it, config: getTableConfig(it) }));
	const tables: Table[] = tableConfigs.map((it) => {
		return {
			entityType: 'tables',
			name: it.config.name,
		} satisfies Table;
	});

	const columns = tableConfigs.map((it) => {
		return it.config.columns.map((column) => {
			const { name } = column;
			const primaryKey: boolean = column.primary;
			const generated = column.generated;

			const generatedObj: {
				as: string;
				type: 'virtual' | 'stored';
			} | null = generated
				? {
					as: is(generated.as, SQL)
						? `(${dialect.sqlToQuery(generated.as as SQL, 'indexes').sql})`
						: typeof generated.as === 'function'
						? `(${dialect.sqlToQuery(generated.as() as SQL, 'indexes').sql})`
						: `(${generated.as as any})`,

					// 'virtual' | 'stored' for for all dialects
					// 'virtual' | 'persisted' for mssql
					// We should remove this option from common Column and store it per dialect common
					// Was discussed with Andrew
					// Type error because of common in drizzle orm for all dialects (includes virtual' | 'stored' | 'persisted')
					type: generated.mode === 'stored' ? 'stored' : 'virtual',
				}
				: null;

			const defalutValue = defaultFromColumn(column);

			const hasUniqueIndex = Boolean(it.config.indexes.find((item) => {
				const i = item.config;
				const column = i.columns.length === 1 ? i.columns[0] : null;
				return column && !is(column, SQL) && column.name === name && i.unique;
			}));

			return {
				entityType: 'columns',
				table: it.config.name,
				name,
				type: column.getSQLType(),
				default: defalutValue,
				notNull: column.notNull && !primaryKey,
				pk: primaryKey,
				pkName: null,
				autoincrement: is(column, SQLiteBaseInteger)
					? column.autoIncrement
					: false,
				generated: generatedObj,
				isUnique: !hasUniqueIndex && column.isUnique,
				uniqueName: column.uniqueName ?? null,
			} satisfies InterimColumn;
		});
	}).flat();

	const pks = tableConfigs.map((it) => {
		return it.config.primaryKeys.map((pk) => {
			const columnNames = pk.columns.map((c) => c.name);
			return {
				entityType: 'pks',
				name: pk.name ?? nameForPk(getTableConfig(pk.table).name),
				table: it.config.name,
				columns: columnNames,
				nameExplicit: pk.isNameExplicit,
			} satisfies PrimaryKey;
		});
	}).flat();

	const fks = tableConfigs.map((it) => {
		return it.config.foreignKeys.map((fk) => {
			const tableFrom = it.config.name;
			const onDelete = fk.onDelete;
			const onUpdate = fk.onUpdate;
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);

			const columnsFrom = reference.columns.map((it) => it.name);
			const columnsTo = reference.foreignColumns.map((it) => it.name);

			const name = fk.isNameExplicit()
				? fk.getName()
				: nameForForeignKey({ table: tableFrom, columns: columnsFrom, tableTo, columnsTo });
			return {
				entityType: 'fks',
				table: it.config.name,
				name,
				tableTo,
				columns: columnsFrom,
				columnsTo,
				onDelete: transformOnUpdateDelete(onDelete ?? 'no action'),
				onUpdate: transformOnUpdateDelete(onUpdate ?? 'no action'),
				nameExplicit: fk.isNameExplicit(),
			} satisfies ForeignKey;
		});
	}).flat();

	const indexes = tableConfigs.map((it) => {
		return it.config.indexes.map((index) => {
			const columns = index.config.columns;
			const name = index.config.name;

			let indexColumns = columns.map((it) => {
				if (is(it, SQL)) {
					const sql = dialect.sqlToQuery(it, 'indexes').sql;
					return { value: sql, isExpression: true };
				}
				return { value: it.name, isExpression: false };
			});

			let where: string | undefined;
			if (index.config.where !== undefined) {
				if (is(index.config.where, SQL)) {
					where = dialect.sqlToQuery(index.config.where).sql;
				}
			}
			return {
				entityType: 'indexes',
				table: it.config.name,
				name,
				columns: indexColumns,
				isUnique: index.config.unique ?? false,
				where: where ?? null,
				origin: 'manual', // created by user https://www.sqlite.org/pragma.html#pragma_index_list
			} satisfies Index;
		});
	}).flat();

	const uniques = tableConfigs.map((it) => {
		return it.config.uniqueConstraints.map((unique) => {
			const columnNames = unique.columns.map((c) => c.name);
			const name = unique.isNameExplicit ? unique.name : nameForUnique(it.config.name, columnNames);
			return {
				entityType: 'uniques',
				table: it.config.name,
				name: name,
				columns: columnNames,
				nameExplicit: unique.isNameExplicit,
			} satisfies UniqueConstraint;
		});
	}).flat();

	const checks = tableConfigs.map((it) => {
		return it.config.checks.map((check) => {
			// TODO: dialect.sqlToQuery(check.value).sql returns "users"."age" > 21, as opposed to "age" > 21 for checks, which is wrong
			const value = dialect.sqlToQuery(check.value, /* should fix */ 'indexes').sql.replace(`"${it.config.name}".`, '');
			return {
				entityType: 'checks',
				table: it.config.name,
				name: check.name,
				value: value,
			} satisfies CheckConstraint;
		});
	}).flat();

	// views are ordered by dependencies in diff.ts (`sortCreateViews`), using `metadata.viewDependencies`
	const views = dViews.map((it) => {
		const { name: viewName, isExisting, query } = getViewConfig(it);

		if (query) metadata.viewDependencies.set(entityKey(null, viewName), findViewDependencies(query, viewKey));

		return {
			entityType: 'views',
			name: viewName,
			isExisting,
			definition: isExisting ? null : dialect.sqlToQuery(query!).sql,
			error: null,
		} satisfies View;
	});

	return { schema: { tables, columns, indexes, uniques, fks, pks, checks, views }, metadata };
};

export const fromExports = (exports: Record<string, unknown>) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];
	const relations: Relations[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SQLiteTable)) {
			tables.push(t);
		}

		if (is(t, SQLiteView)) {
			views.push(t);
		}

		if (is(t, Relations)) {
			relations.push(t);
		}
	});

	return { tables, views, relations };
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];
	const relations: Relations[] = [];

	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = await loadModule(it);
		const prepared = fromExports(i0);

		tables.push(...prepared.tables);
		views.push(...prepared.views);
		relations.push(...prepared.relations);
	}

	return { tables: Array.from(new Set(tables)), views, relations };
};

export type PreparedSqliteSchema = Awaited<ReturnType<typeof prepareFromSchemaFiles>>;

// Decouples the schema's origin (compiled `.ts` files vs. a supplied prebuilt schema) from its consumers.
export interface SchemaSource {
	load(): Promise<PreparedSqliteSchema>;
}

export const SchemaSource = {
	fromFilenames(filenames: string[]): SchemaSource {
		return { load: () => prepareFromSchemaFiles(filenames) };
	},
	fromSchema(schema: PreparedSqliteSchema): SchemaSource {
		return { load: async () => schema };
	},
};

export const defaultFromColumn = (
	column: AnySQLiteColumn,
): Column['default'] => {
	const def = column.default;
	if (typeof def === 'undefined') return null; // '', 0, false, etc.
	if (is(def, SQL)) return sqlToStr(def);
	if (is(column, SQLiteTimestamp)) return Int.defaultFromDrizzle(def, column.mode);
	return typeFor(column.getSQLType()).defaultFromDrizzle(def);
};
