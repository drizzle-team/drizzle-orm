import { getTableName, is, SQL } from 'drizzle-orm';
import {
	AnySQLiteTable,
	getTableConfig,
	getViewConfig,
	SQLiteBaseInteger,
	SQLiteSyncDialect,
	SQLiteTable,
	SQLiteView,
	uniqueKeyName,
} from 'drizzle-orm/sqlite-core';
import { safeRegister } from '../../cli/commands/utils';
import { CasingType } from '../../cli/validations/common';
import { getColumnCasing, sqlToStr } from '../../serializer/utils';
import { CheckConstraint, Column, ForeignKey, Index, PrimaryKey, SqliteEntities, UniqueConstraint, View } from './ddl';

export const fromDrizzleSchema = (
	dTables: AnySQLiteTable[],
	dViews: SQLiteView[],
	casing: CasingType | undefined,
) => {
	const dialect = new SQLiteSyncDialect({ casing });
	const tableConfigs = dTables.map((it) => ({ table: it, config: getTableConfig(it) }));
	const tables: SqliteEntities['tables'][] = tableConfigs.map((it) => {
		return {
			entityType: 'tables',
			name: it.config.name,
		} satisfies SqliteEntities['tables'];
	});
	const columns = tableConfigs.map((it) => {
		return it.config.columns.map((column) => {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const primaryKey: boolean = column.primary;
			const generated = column.generated;
			const generatedObj = generated
				? {
					as: is(generated.as, SQL)
						? `(${dialect.sqlToQuery(generated.as as SQL, 'indexes').sql})`
						: typeof generated.as === 'function'
						? `(${dialect.sqlToQuery(generated.as() as SQL, 'indexes').sql})`
						: `(${generated.as as any})`,
					type: generated.mode ?? 'virtual',
				}
				: null;

			const defalutValue = column.default
				? is(column.default, SQL)
					? { value: sqlToStr(column.default, casing), isExpression: true }
					: typeof column.default === 'string'
					? { value: column.default, isExpression: false }
					: typeof column.default === 'object' || Array.isArray(column.default)
					? { value: JSON.stringify(column.default), isExpression: false }
					: { value: String(column.default), isExpression: true } // integer boolean etc
				: null;

			return {
				entityType: 'columns',
				table: it.config.name,
				name,
				type: column.getSQLType(),
				default: defalutValue,
				notNull,
				primaryKey,
				autoincrement: is(column, SQLiteBaseInteger)
					? column.autoIncrement
					: false,
				generated: generatedObj,
				unique: column.isUnique ? { name: column.uniqueName ?? null } : null,
			} satisfies Column;
		});
	}).flat();

	const pks = tableConfigs.map((it) => {
		return it.config.primaryKeys.map((pk) => {
			const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

			return {
				entityType: 'pks',
				name: pk.name ?? '',
				table: it.config.name,
				columns: columnNames,
			} satisfies PrimaryKey;
		});
	}).flat();

	const fks = tableConfigs.map((it) => {
		return it.config.foreignKeys.map((fk) => {
			const tableFrom = it.config.name;
			const onDelete = fk.onDelete ?? null;
			const onUpdate = fk.onUpdate ?? null;
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;
			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT); // TODO: casing?

			const originalColumnsFrom = reference.columns.map((it) => it.name);
			const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
			const originalColumnsTo = reference.foreignColumns.map((it) => it.name);
			const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

			let name = fk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnsFrom.length; i++) {
					name = name.replace(originalColumnsFrom[i], columnsFrom[i]);
				}
				for (let i = 0; i < originalColumnsTo.length; i++) {
					name = name.replace(originalColumnsTo[i], columnsTo[i]);
				}
			}
			return {
				entityType: 'fks',
				table: it.config.name,
				name,
				tableTo,
				columnsFrom,
				columnsTo,
				onDelete,
				onUpdate,
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
				return { value: getColumnCasing(it, casing), isExpression: false };
			});

			let where: string | undefined = undefined;
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
			const columnNames = unique.columns.map((c) => getColumnCasing(c, casing));
			const name = unique.name ?? uniqueKeyName(it.table, columnNames);
			return {
				entityType: 'uniques',
				table: it.config.name,
				name: name,
				columns: columnNames,
			} satisfies UniqueConstraint;
		});
	}).flat();

	const checks = tableConfigs.map((it) => {
		return it.config.checks.map((check) => {
			return {
				entityType: 'checks',
				table: it.config.name,
				name: check.name,
				value: dialect.sqlToQuery(check.value).sql,
			} satisfies CheckConstraint;
		});
	}).flat();

	const views = dViews.map((it) => {
		const { name: viewName, isExisting, selectedFields, query } = getViewConfig(it);

		return {
			entityType: 'views',
			name: viewName,
			isExisting,
			definition: isExisting ? null : dialect.sqlToQuery(query!).sql,
		} satisfies View;
	});

	return { tables, columns, indexes, uniques, fks, pks, checks, views };
};

export const fromExports = (exports: Record<string, unknown>) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SQLiteTable)) {
			tables.push(t);
		}

		if (is(t, SQLiteView)) {
			views.push(t);
		}
	});

	return { tables, views };
};

export const prepareFromSqliteSchemaFiles = async (imports: string[]) => {
	const tables: AnySQLiteTable[] = [];
	const views: SQLiteView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = fromExports(i0);

		tables.push(...prepared.tables);
		views.push(...prepared.views);
	}

	unregister();

	return { tables: Array.from(new Set(tables)), views };
};
