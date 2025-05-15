import { Casing, GeneratedStorageMode, getTableName, is, SQL } from 'drizzle-orm';
import {
	AnyMsSqlColumn,
	AnyMsSqlTable,
	getTableConfig,
	getViewConfig,
	MsSqlColumn,
	MsSqlDialect,
	MsSqlSchema,
	MsSqlTable,
	MsSqlView,
} from 'drizzle-orm/mssql-core';
import { CasingType } from 'src/cli/validations/common';
import { getColumnCasing, sqlToStr } from 'src/serializer/utils';
import { safeRegister } from 'src/utils-node';
import { DefaultConstraint, InterimSchema, MssqlEntities, Schema } from './ddl';
import { defaultNameForDefault, defaultNameForFK, defaultNameForPK, defaultNameForUnique } from './grammar';

export const upper = <T extends string>(value: T | undefined): Uppercase<T> | null => {
	if (!value) return null;
	return value.toUpperCase() as Uppercase<T>;
};

export const defaultFromColumn = (
	column: AnyMsSqlColumn,
	casing?: Casing,
): DefaultConstraint['default'] | null => {
	if (typeof column.default === 'undefined') return null;

	// return { value: String(column.default), type: 'unknown' };

	// TODO skip
	// const sqlTypeLowered = column.getSQLType().toLowerCase();
	if (is(column.default, SQL)) {
		let str = sqlToStr(column.default, casing);

		return { value: str, type: 'unknown' };
	}

	const sqlType = column.getSQLType();
	if (sqlType === 'bit') {
		return { value: String(column.default ? 1 : 0), type: 'number' };
	}

	const type = typeof column.default;
	if (type === 'string' || type === 'number' || type === 'bigint' || type === 'boolean') {
		return { value: String(column.default), type: type };
	}

	throw new Error(`unexpected default: ${column.default}`);
};

export const fromDrizzleSchema = (
	schema: {
		schemas: MsSqlSchema[];
		tables: AnyMsSqlTable[];
		views: MsSqlView[];
	},
	casing: CasingType | undefined,
	schemaFilter?: string[],
): InterimSchema => {
	const dialect = new MsSqlDialect({ casing });
	// const errors: SchemaError[] = [];

	const schemas = schema.schemas
		.map<Schema>((it) => ({
			entityType: 'schemas',
			name: it.schemaName,
		}))
		.filter((it) => {
			if (schemaFilter) {
				return schemaFilter.includes(it.name) && it.name !== 'dbo';
			} else {
				return it.name !== 'dbo';
			}
		});

	const tableConfigPairs = schema.tables.map((it) => {
		return { config: getTableConfig(it), table: it };
	});

	const tables = tableConfigPairs.map((it) => {
		const config = it.config;

		return {
			entityType: 'tables',
			schema: config.schema ?? 'dbo',
			name: config.name,
		} satisfies MssqlEntities['tables'];
	});

	const result: InterimSchema = {
		schemas: schemas,
		tables: tables,
		columns: [],
		pks: [],
		fks: [],
		indexes: [],
		checks: [],
		views: [],
		viewColumns: [],
		uniques: [],
		defaults: [],
	};

	for (const { table, config } of tableConfigPairs) {
		const {
			name: tableName,
			columns,
			indexes,
			foreignKeys,
			schema: drizzleSchema,
			checks,
			primaryKeys,
			uniqueConstraints,
		} = config;

		const schema = drizzleSchema || 'dbo';
		if (schemaFilter && !schemaFilter.includes(schema)) {
			continue;
		}

		for (const column of columns) {
			const columnName = getColumnCasing(column, casing);
			const notNull: boolean = column.notNull;
			const sqlType = column.getSQLType();

			// @ts-expect-error
			// Drizzle ORM gives this value in runtime, but not in types.
			// After sync with Andrew, we decided to fix this with Dan later
			// That's due to architecture problems we have in columns and complex abstraction we should avoid
			// for now we are sure this value is here
			// If it's undefined - than users didn't provide any identity
			// If it's an object with seed/increment and a) both are undefined - use default identity startegy
			// b) some of them have values - use them
			// Note: you can't have only one value. Either both are undefined or both are defined
			const identity = column.identity as { seed: number; increment: number } | undefined;

			const generated = column.generated
				? {
					as: is(column.generated.as, SQL)
						? dialect.sqlToQuery(column.generated.as as SQL).sql
						: typeof column.generated.as === 'function'
						? dialect.sqlToQuery(column.generated.as() as SQL).sql
						: `${column.generated.as}`,
					type: column.generated.mode ?? 'virtual',
				}
				: null;

			result.columns.push({
				schema,
				entityType: 'columns',
				table: tableName,
				name: columnName,
				type: sqlType,
				notNull: notNull
					&& !column.primary
					&& !column.generated
					&& !identity,
				// @ts-expect-error
				// TODO update description
				// 'virtual' | 'stored' for all dialects
				// 'virtual' | 'persisted' for mssql
				// We should remove this option from common Column and store it per dialect common
				// Was discussed with Andrew
				// Type erorr because of common in drizzle orm for all dialects (includes virtual' | 'stored' | 'persisted')
				generated,
				identity: identity ?? null,
				isPK: column.primary,
				isUnique: column.isUnique,
				uniqueName: column.uniqueName ?? null,
			});

			if (typeof column.default !== 'undefined') {
				result.defaults.push({
					entityType: 'defaults',
					name: defaultNameForDefault(tableName, columnName),
					nameExplicit: false,
					schema,
					column: columnName,
					table: tableName,
					default: defaultFromColumn(column, casing),
				});
			}
		}

		for (const pk of primaryKeys) {
			const columnNames = pk.columns.map((c: any) => getColumnCasing(c, casing));

			const name = pk.name || defaultNameForPK(tableName);
			const isNameExplicit = !!pk.name;

			result.pks.push({
				entityType: 'pks',
				table: tableName,
				schema: schema,
				name: name,
				nameExplicit: isNameExplicit,
				columns: columnNames,
			});
		}

		for (const unique of uniqueConstraints) {
			const columns = unique.columns.map((c) => {
				return getColumnCasing(c, casing);
			});

			const name = unique.name ?? defaultNameForUnique(tableName, unique.columns.map((c) => c.name));

			result.uniques.push({
				entityType: 'uniques',
				table: tableName,
				name: name,
				schema: schema,
				nameExplicit: !!unique.name,
				columns: columns,
			});
		}

		for (const fk of foreignKeys) {
			const reference = fk.reference();

			const referenceFT = reference.foreignTable;

			// eslint-disable-next-line @typescript-eslint/no-unsafe-argument
			const tableTo = getTableName(referenceFT);

			const originalColumnsFrom = reference.columns.map((it) => it.name);
			const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
			const originalColumnsTo = reference.foreignColumns.map((it) => it.name);
			const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

			let name = fk.getName() || defaultNameForFK(tableName, columnsFrom, tableTo, columnsTo);
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
				schema,
				columns: columnsFrom,
				tableTo,
				columnsTo,
				nameExplicit: !!fk.getName(),
				schemaTo: getTableConfig(fk.reference().foreignTable).schema || 'dbo',
				onUpdate: upper(fk.onUpdate) ?? 'NO ACTION',
				onDelete: upper(fk.onDelete) ?? 'NO ACTION',
			});
		}

		for (const index of indexes) {
			const columns = index.config.columns;
			const name = index.config.name;

			let where = index.config.where ? dialect.sqlToQuery(index.config.where).sql : '';
			where = where === 'true' ? '' : where;

			result.indexes.push({
				entityType: 'indexes',
				table: tableName,
				name,
				schema,
				columns: columns.map((it) => {
					if (is(it, SQL)) {
						const sql = dialect.sqlToQuery(it, 'indexes').sql;
						return { value: sql, isExpression: true };
					} else {
						return { value: `${getColumnCasing(it, casing)}`, isExpression: false };
					}
				}),
				isUnique: index.config.unique ?? false,
				nameExplicit: false,
				where: where ? where : null,
			});
		}

		for (const check of checks) {
			const name = check.name;
			const value = check.value;

			result.checks.push({
				entityType: 'checks',
				table: tableName,
				schema,
				name,
				value: dialect.sqlToQuery(value).sql,
				nameExplicit: true,
			});
		}
	}

	for (const view of schema.views) {
		const cfg = getViewConfig(view);
		const {
			isExisting,
			name,
			query,
			schema: drizzleSchema,
			selectedFields,
			checkOption,
			encryption,
			schemaBinding,
			viewMetadata,
		} = cfg;

		if (isExisting) continue;

		const schema = drizzleSchema ?? 'dbo';

		for (const key in selectedFields) {
			if (is(selectedFields[key], MsSqlColumn)) {
				const column = selectedFields[key];
				const notNull: boolean = column.notNull;

				result.viewColumns.push({
					view: name,
					schema,
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
			checkOption: checkOption ?? null,
			encryption: encryption ?? null,
			schema,
			schemaBinding: schemaBinding ?? null,
			viewMetadata: viewMetadata ?? null,
		});
	}

	return result;
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnyMsSqlTable[] = [];
	const schemas: MsSqlSchema[] = [];
	const views: MsSqlView[] = [];

	const { unregister } = await safeRegister();
	for (let i = 0; i < imports.length; i++) {
		const it = imports[i];

		const i0: Record<string, unknown> = require(`${it}`);
		const prepared = fromExport(i0);

		tables.push(...prepared.tables);
		schemas.push(...prepared.schemas);
		views.push(...prepared.views);
	}
	unregister();

	return {
		tables,
		schemas,
		views,
	};
};

const fromExport = (exports: Record<string, unknown>) => {
	const tables: AnyMsSqlTable[] = [];
	const schemas: MsSqlSchema[] = [];
	const views: MsSqlView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, MsSqlTable)) {
			tables.push(t);
		}

		if (is(t, MsSqlSchema)) {
			schemas.push(t);
		}

		if (is(t, MsSqlView)) {
			views.push(t);
		}
	});

	return {
		tables,
		schemas,
		views,
	};
};
