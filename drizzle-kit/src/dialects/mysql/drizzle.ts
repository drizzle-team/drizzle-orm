import { Casing, getTableName, is, SQL } from 'drizzle-orm';
import {
	AnyMySqlColumn,
	AnyMySqlTable,
	getTableConfig,
	getViewConfig,
	MySqlColumn,
	MySqlDialect,
	MySqlTable,
	MySqlView,
	uniqueKeyName,
} from 'drizzle-orm/mysql-core';
import { CasingType } from 'src/cli/validations/common';
import { getColumnCasing, sqlToStr } from 'src/serializer/utils';
import { escapeSingleQuotes } from 'src/utils';
import { InterimSchema } from './ddl';
import { safeRegister } from '../../utils-node';

const handleEnumType = (type: string) => {
	let str = type.split('(')[1];
	str = str.substring(0, str.length - 1);
	const values = str.split(',').map((v) => `'${escapeSingleQuotes(v.substring(1, v.length - 1))}'`);
	return `enum(${values.join(',')})`;
};

const defaultFromColumn = (column: AnyMySqlColumn, casing?: Casing) => {
	if (typeof column.default === 'undefined') return null;

	const sqlTypeLowered = column.getSQLType().toLowerCase();
	if (is(column.default, SQL)) {
		return sqlToStr(column.default, casing);
	}

	if (typeof column.default === 'string') {
		if (sqlTypeLowered.startsWith('enum') || sqlTypeLowered.startsWith('varchar')) {
			return `'${escapeSingleQuotes(column.default)}'`;
		}

		return `('${escapeSingleQuotes(column.default)}')`;
	}

	if (sqlTypeLowered === 'json') {
		return `('${JSON.stringify(column.default)}')`;
	}

	if (column.default instanceof Date) {
		if (sqlTypeLowered === 'date') {
			return `'${column.default.toISOString().split('T')[0]}'`;
		}

		if (
			sqlTypeLowered.startsWith('datetime')
			|| sqlTypeLowered.startsWith('timestamp')
		) {
			return `'${
				column.default
					.toISOString()
					.replace('T', ' ')
					.slice(0, 23)
			}'`;
		}
	}

	if (['blob', 'text', 'json'].includes(column.getSQLType())) {
		return `(${column.default})`;
	}

	return String(column.default);
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

			const def = defaultFromColumn(column, casing);

			result.columns.push({
				entityType: 'columns',
				table: tableName,
				name,
				type: sqlType.startsWith('enum') ? handleEnumType(sqlType) : sqlType,
				notNull,
				autoIncrement,
				onUpdateNow: (column as any).hasOnUpdateNow, // TODO: ??
				generated,
				isPK: column.primary,
				isUnique: column.isUnique,
				default: def ? { value: def, expression: false } : null,
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
				nameExplicit: !!pk.name,
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
				unique: true,
				algorithm: null,
				lock: null,
				using: null,
			});
		}

		for (const fk of foreignKeys) {
			const onDelete = fk.onDelete ?? 'NO';
			const onUpdate = fk.onUpdate ?? 'no action';
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);

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

			result.fks.push({
				entityType: 'fks',
				table: tableName,
				name,
				columns: columnsFrom,
				tableTo,
				columnsTo,
				onUpdate: upper(fk.onUpdate) ?? 'NO ACTION',
				onDelete: upper(fk.onDelete) ?? 'NO ACTION',
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
				algorithm: index.config.algorythm ?? null,
				lock: index.config.lock ?? null,
				unique: index.config.unique ?? false,
				using: index.config.using ?? null,
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
				nameExplicit: false,
			});
		}

		for (const view of views) {
			const cfg = getViewConfig(view);
			const {
				isExisting,
				name,
				query,
				schema,
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
	}

	return result;
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];
		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = prepareFromExports(i0);

		tables.push(...prepared.tables);
		views.push(...prepared.views);
	}
	unregister();
	return { tables: Array.from(new Set(tables)), views };
};

export const prepareFromExports = (exports: Record<string, unknown>) => {
	const tables: AnyMySqlTable[] = [];
	const views: MySqlView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, MySqlTable)) {
			tables.push(t);
		}

		if (is(t, MySqlView)) {
			views.push(t);
		}
	});

	return { tables, views };
};