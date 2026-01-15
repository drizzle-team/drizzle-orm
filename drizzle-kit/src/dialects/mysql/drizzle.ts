import type { Casing } from 'drizzle-orm';
import { getTableName, is, SQL } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { AnyMySqlColumn, AnyMySqlTable } from 'drizzle-orm/mysql-core';
import {
	getTableConfig,
	getViewConfig,
	MySqlChar,
	MySqlColumn,
	MySqlCustomColumn,
	MySqlDateTime,
	MySqlDialect,
	MySqlEnumColumn,
	MySqlTable,
	MySqlText,
	MySqlTimestamp,
	MySqlVarChar,
	MySqlView,
} from 'drizzle-orm/mysql-core';
import type { CasingType } from 'src/cli/validations/common';
import { safeRegister } from '../../utils/utils-node';
import { getColumnCasing, sqlToStr } from '../drizzle';
import type { Column, InterimSchema } from './ddl';
import { defaultNameForFK, nameForUnique, typeFor } from './grammar';

export const defaultFromColumn = (
	column: AnyMySqlColumn,
	casing?: Casing,
): Column['default'] => {
	if (typeof column.default === 'undefined') return null;
	let value = column.default;

	if (is(column.default, SQL)) {
		let str = sqlToStr(column.default, casing);
		// we need to wrap unknown statements in () otherwise there's not enough info in Type.toSQL
		if (!str.startsWith('(')) return `(${str})`;
		return str;
	}

	if (is(column, MySqlCustomColumn)) {
		const res = column.mapToDriverValue(column.default);
		if (typeof res === 'string') value = res;
		value = String(res);
	}

	const grammarType = typeFor(column.getSQLType().toLowerCase());
	if (grammarType) return grammarType.defaultFromDrizzle(value);

	throw new Error(`unexpected default: ${column.getSQLType().toLowerCase()} ${column.default}`);
};

export const upper = <T extends string>(value: T | undefined): Uppercase<T> | null => {
	if (!value) return null;
	return value.toUpperCase() as Uppercase<T>;
};

export const fromDrizzleSchema = (
	tables: AnyMySqlTable[],
	views: MySqlView[],
	casing: CasingType | undefined,
): InterimSchema => {
	const dialect = new MySqlDialect({ casing });
	const result: InterimSchema = {
		tables: [],
		columns: [],
		pks: [],
		fks: [],
		indexes: [],
		checks: [],
		views: [],
		viewColumns: [],
	};

	for (const table of tables) {
		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			schema,
			checks,
			primaryKeys,
			uniqueConstraints,
		} = getTableConfig(table);

		if (schema) continue;

		result.tables.push({
			entityType: 'tables',
			name: tableName,
		});

		for (const column of columns) {
			const name = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;

			const sqlType = column.getSQLType().replace(', ', ','); // TODO: remove, should be redundant real(6, 3)->real(6,3)

			const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
				? false
				: (column as any).autoIncrement;

			const generated: Column['generated'] = column.generated
				? {
					as: is(column.generated.as, SQL)
						? dialect.sqlToQuery(column.generated.as as SQL).sql
						: typeof column.generated.as === 'function'
						? dialect.sqlToQuery(column.generated.as() as SQL).sql
						: (column.generated.as as any),
					type: column.generated.mode === 'virtual' ? 'virtual' : 'stored',
				}
				: null;

			const defaultValue = defaultFromColumn(column, casing);
			const type = is(column, MySqlEnumColumn)
				? `enum(${column.enumValues?.map((it) => `'${it.replaceAll("'", "''")}'`).join(',')})`
				: sqlType;

			let onUpdateNow: boolean = false;
			let onUpdateNowFsp: number | null = null;
			if (is(column, MySqlTimestamp) || is(column, MySqlDateTime)) {
				onUpdateNow = column.hasOnUpdateNow ?? false;
				onUpdateNowFsp = column.onUpdateNowFsp ?? null;
			}

			let charSet: string | null = null;
			let collation: string | null = null;
			if (is(column, MySqlChar) || is(column, MySqlVarChar) || is(column, MySqlText) || is(column, MySqlEnumColumn)) {
				charSet = column.charSet;
				collation = column.collation ?? null;
			}

			result.columns.push({
				entityType: 'columns',
				table: tableName,
				name,
				type,
				notNull,
				autoIncrement,
				onUpdateNow,
				onUpdateNowFsp,
				charSet,
				collation,
				generated,
				isPK: column.primary,
				isUnique: column.isUnique,
				uniqueName: column.uniqueName ?? null,
				default: defaultValue,
			});
		}

		for (const pk of primaryKeys) {
			const columnNames = pk.columns.map((c: any) => getColumnCasing(c, casing));

			result.pks.push({
				entityType: 'pks',
				table: tableName,
				name: 'PRIMARY',
				columns: columnNames,
			});
		}

		for (const unique of uniqueConstraints) {
			const columns = unique.columns.map((c) => {
				if (is(c, SQL)) {
					const sql = dialect.sqlToQuery(c).sql;
					return { value: sql, isExpression: true };
				}
				return { value: getColumnCasing(c, casing), isExpression: false };
			});

			const name = unique.isNameExplicit
				? unique.name
				: nameForUnique(tableName, unique.columns.filter((c) => !is(c, SQL)).map((c) => c.name));

			result.indexes.push({
				entityType: 'indexes',
				table: tableName,
				name: name,
				columns: columns,
				isUnique: true,
				algorithm: null,
				lock: null,
				using: null,
				nameExplicit: unique.isNameExplicit,
			});
		}

		for (const fk of foreignKeys) {
			const reference = fk.reference();
			const referenceFT = reference.foreignTable;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);

			const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
			const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

			let name = fk.isNameExplicit()
				? fk.getName()
				: defaultNameForFK({ table: tableName, columns: columnsFrom, tableTo, columnsTo });

			result.fks.push({
				entityType: 'fks',
				table: tableName,
				name,
				columns: columnsFrom,
				tableTo,
				columnsTo,
				onUpdate: upper(fk.onUpdate) ?? 'NO ACTION',
				onDelete: upper(fk.onDelete) ?? 'NO ACTION',
				nameExplicit: fk.isNameExplicit(),
			});
		}

		for (const index of indexes) {
			const columns = index.config.columns;
			const name = index.config.name;

			result.indexes.push({
				entityType: 'indexes',
				table: tableName,
				name,
				columns: columns.map((it) => {
					if (is(it, SQL)) {
						const sql = dialect.sqlToQuery(it, 'indexes').sql;
						return { value: sql, isExpression: true };
					} else {
						return { value: `${getColumnCasing(it, casing)}`, isExpression: false };
					}
				}),
				algorithm: index.config.algorithm ?? null,
				lock: index.config.lock ?? null,
				isUnique: index.config.unique ?? false,
				using: index.config.using ?? null,
				nameExplicit: index.isNameExplicit,
			});
		}

		for (const check of checks) {
			const name = check.name;
			const value = check.value;

			result.checks.push({
				entityType: 'checks',
				table: tableName,
				name,
				value: dialect.sqlToQuery(value).sql,
			});
		}
	}

	for (const view of views) {
		const cfg = getViewConfig(view);
		const {
			isExisting,
			name,
			query,
			selectedFields,
			algorithm,
			sqlSecurity,
			withCheckOption,
		} = cfg;

		if (isExisting) continue;

		for (const key in selectedFields) {
			if (is(selectedFields[key], MySqlColumn)) {
				const column = selectedFields[key];
				const notNull: boolean = column.notNull;

				result.viewColumns.push({
					view: name,
					name: column.name,
					type: column.getSQLType(),
					notNull: notNull,
				});
			}
		}

		result.views.push({
			entityType: 'views',
			name,
			definition: query ? dialect.sqlToQuery(query).sql : '',
			withCheckOption: withCheckOption ?? null,
			algorithm: algorithm ?? 'undefined', // set default values
			sqlSecurity: sqlSecurity ?? 'definer', // set default values
		});
	}

	return result;
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];
	const relations: Relations[] = [];

	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];
			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = prepareFromExports(i0);

			tables.push(...prepared.tables);
			views.push(...prepared.views);
			relations.push(...prepared.relations);
		}
	});
	return { tables: Array.from(new Set(tables)), views, relations };
};

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];
	const relations: Relations[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, MySqlTable)) {
			tables.push(t);
		}

		if (is(t, MySqlView)) {
			views.push(t);
		}

		if (is(t, Relations)) {
			relations.push(t);
		}
	});

	return { tables, views, relations };
};
