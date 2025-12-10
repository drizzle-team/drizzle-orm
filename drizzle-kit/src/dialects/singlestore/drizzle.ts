import type { Casing } from 'drizzle-orm';
import { is, SQL } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { AnySingleStoreColumn, AnySingleStoreTable } from 'drizzle-orm/singlestore-core';
import { getTableConfig, SingleStoreDialect, SingleStoreTable, uniqueKeyName } from 'drizzle-orm/singlestore-core';
import type { CasingType } from 'src/cli/validations/common';
import { escapeSingleQuotes } from 'src/utils';
import { safeRegister } from '../../utils/utils-node';
import { getColumnCasing, sqlToStr } from '../drizzle';
import type { Column, InterimSchema } from '../mysql/ddl';
import { typeFor } from '../mysql/grammar';

const handleEnumType = (type: string) => {
	let str = type.split('(')[1];
	str = str.substring(0, str.length - 1);
	const values = str.split(',').map((v) => `'${escapeSingleQuotes(v.substring(1, v.length - 1))}'`);
	return `enum(${values.join(',')})`;
};

export const defaultFromColumn = (column: AnySingleStoreColumn, casing?: Casing): Column['default'] => {
	if (typeof column.default === 'undefined') return null;

	if (is(column.default, SQL)) {
		return sqlToStr(column.default, casing);
	}

	const grammarType = typeFor(column.getSQLType().toLocaleLowerCase());
	return grammarType.defaultFromDrizzle(column.default);
};

export const upper = <T extends string>(value: T | undefined): Uppercase<T> | null => {
	if (!value) return null;
	return value.toUpperCase() as Uppercase<T>;
};

export const fromDrizzleSchema = (
	tables: AnySingleStoreTable[],
	casing: CasingType | undefined,
): InterimSchema => {
	const dialect = new SingleStoreDialect({ casing });
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
			schema,
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
			const sqlType = column.getSQLType();
			const autoIncrement = typeof (column as any).autoIncrement === 'undefined'
				? false
				: (column as any).autoIncrement;

			const generated = column.generated
				? {
					as: is(column.generated.as, SQL)
						? dialect.sqlToQuery(column.generated.as as SQL).sql
						: typeof column.generated.as === 'function'
						? dialect.sqlToQuery(column.generated.as() as SQL).sql
						: (column.generated.as as any),
					type: column.generated.mode ?? 'stored',
				}
				: null;

			result.columns.push({
				entityType: 'columns',
				table: tableName,
				name,
				type: sqlType.startsWith('enum') ? handleEnumType(sqlType) : sqlType,
				notNull,
				autoIncrement,
				onUpdateNow: (column as any).hasOnUpdateNow ?? false, // TODO: ??
				// @ts-expect-error
				// TODO update description
				// 'virtual' | 'stored' for all dialects
				// 'virtual' | 'persisted' for mssql
				// We should remove this option from common Column and store it per dialect common
				// Was discussed with Andrew
				// Type erorr because of common in drizzle orm for all dialects (includes virtual' | 'stored' | 'persisted')
				generated,
				isPK: column.primary,
				isUnique: column.isUnique,
				default: defaultFromColumn(column, casing),
			});
		}

		for (const pk of primaryKeys) {
			const originalColumnNames = pk.columns.map((c) => c.name);
			const columnNames = pk.columns.map((c: any) => getColumnCasing(c, casing));

			let name = pk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnNames.length; i++) {
					name = name.replace(originalColumnNames[i], columnNames[i]);
				}
			}

			result.pks.push({
				entityType: 'pks',
				table: tableName,
				name: name,
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

			const name = unique.name ?? uniqueKeyName(table, unique.columns.filter((c) => !is(c, SQL)).map((c) => c.name));

			result.indexes.push({
				entityType: 'indexes',
				table: tableName,
				name: name,
				columns: columns,
				isUnique: true,
				algorithm: null,
				lock: null,
				using: null,
				nameExplicit: !!unique.name,
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
				nameExplicit: true,
			});
		}
	}

	return result;
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnySingleStoreTable[] = [];
	const relations: Relations[] = [];

	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];
			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = prepareFromExports(i0);

			tables.push(...prepared.tables);
			relations.push(...prepared.relations);
		}
	});

	return { tables: Array.from(new Set(tables)), relations };
};

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnySingleStoreTable[] = [];
	const relations: Relations[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, SingleStoreTable)) {
			tables.push(t);
		}

		if (is(t, Relations)) {
			relations.push(t);
		}
	});

	return { tables, relations };
};
