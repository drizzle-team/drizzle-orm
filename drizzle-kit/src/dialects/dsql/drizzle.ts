import { getTableName, is, SQL } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type { CasingType } from 'src/cli/validations/common';
import { safeRegister } from 'src/utils/utils-node';
import { getColumnCasing } from '../drizzle';
import type {
	Column,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	PrimaryKey,
	Schema,
	SchemaError,
	SchemaWarning,
	UniqueConstraint,
} from '../postgres/ddl';
import { defaultNameForPK, indexName, splitSqlType, trimDefaultValueSuffix, typeFor } from '../postgres/grammar';
import type { EntityFilter } from '../pull-utils';

// DSQL-specific imports
import type { AnyDSQLColumn, DSQLView } from 'drizzle-orm/dsql-core';
import {
	DSQLDialect,
	DSQLSchema,
	DSQLTable,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	isDSQLView,
} from 'drizzle-orm/dsql-core';

/**
 * Unwraps a DSQL column to extract type information.
 * DSQL doesn't have enums, so we don't need to handle enum columns.
 */
export const unwrapColumn = (column: AnyDSQLColumn) => {
	const dimensions = (column as any).dimensions ?? 0;
	const baseColumn = column;

	let sqlBaseType = baseColumn.getSQLType();
	// numeric(6, 2) -> numeric(6,2)
	sqlBaseType = sqlBaseType.replace(', ', ',');

	/* legacy, for not to patch orm and don't up snapshot */
	sqlBaseType = sqlBaseType.startsWith('timestamp (') ? sqlBaseType.replace('timestamp (', 'timestamp(') : sqlBaseType;

	const { type, options } = splitSqlType(sqlBaseType);
	const sqlType = dimensions > 0 ? `${sqlBaseType}${'[]'.repeat(dimensions)}` : sqlBaseType;
	return {
		baseColumn,
		dimensions,
		isEnum: false, // DSQL doesn't support enums
		typeSchema: null,
		sqlType,
		baseType: type,
		options,
	};
};

/**
 * Extracts the default value from a column for DSQL.
 */
export const defaultFromColumn = (
	base: AnyDSQLColumn,
	def: unknown,
	dimensions: number,
	dialect: DSQLDialect,
): Column['default'] => {
	if (typeof def === 'undefined') return null;

	if (is(def, SQL)) {
		let sql = dialect.sqlToQuery(def).sql;
		sql = trimDefaultValueSuffix(sql);
		return sql;
	}

	const grammarType = typeFor(base.getSQLType(), false);

	if (dimensions > 0 && Array.isArray(def)) {
		if (def.flat(5).length === 0) return "'{}'";
		return grammarType.defaultArrayFromDrizzle(def, dimensions);
	}

	return grammarType.defaultFromDrizzle(def);
};

/**
 * Default name for foreign key constraint.
 * DSQL doesn't support foreign keys, but we keep this for consistency.
 */
export const defaultNameForFK = (
	tableFrom: string,
	columnsFrom: string[],
	tableTo: string,
	columnsTo: string[],
): string => {
	return `${tableFrom}_${columnsFrom.join('_')}_${tableTo}_${columnsTo.join('_')}_fk`;
};

/**
 * Converts Drizzle dsql-core schema types to InterimSchema format.
 *
 * DSQL limitations handled here:
 * - No enums (dsql-core doesn't have enums)
 * - No sequences (dsql-core doesn't have sequences)
 * - No policies/RLS (dsql-core doesn't have policies)
 * - No foreign keys (dsql-core doesn't have foreign keys)
 * - No identity columns (dsql-core doesn't have identity columns)
 * - Only btree indexes (dsql-core only supports btree)
 */
export const fromDrizzleSchema = (
	schema: {
		schemas: DSQLSchema<string>[];
		tables: DSQLTable[];
		views: DSQLView[];
	},
	casing: CasingType | undefined,
	filter: EntityFilter,
): {
	schema: InterimSchema;
	errors: SchemaError[];
	warnings: SchemaWarning[];
} => {
	const dialect = new DSQLDialect({ casing });
	const errors: SchemaError[] = [];
	const warnings: SchemaWarning[] = [];

	const res: InterimSchema = {
		indexes: [],
		pks: [],
		fks: [],
		uniques: [],
		checks: [],
		columns: [],
		policies: [],
		enums: [],
		roles: [],
		privileges: [],
		schemas: [],
		sequences: [],
		tables: [],
		viewColumns: [],
		views: [],
	};

	res.schemas = schema.schemas
		.filter((it) => {
			return it.schemaName !== 'public' && filter({ type: 'schema', name: it.schemaName });
		})
		.map<Schema>((it) => ({
			entityType: 'schemas',
			name: it.schemaName,
		}));

	const tableConfigPairs = schema.tables.map((it) => {
		return { config: getTableConfig(it), table: it };
	}).filter((x) => {
		return filter({ type: 'table', schema: x.config.schema ?? 'public', name: x.config.name });
	});

	// DSQL doesn't support policies, so we skip policy processing

	res.tables = tableConfigPairs.map((it) => {
		const config = it.config;
		const schema = config.schema ?? 'public';

		return {
			entityType: 'tables',
			schema,
			name: config.name,
			isRlsEnabled: false, // DSQL doesn't support RLS
		};
	});

	for (const { table: _table, config } of tableConfigPairs) {
		const {
			name: tableName,
			columns: drizzleColumns,
			indexes: drizzleIndexes,
			checks: drizzleChecks,
			schema: drizzleSchema,
			primaryKeys: drizzlePKs,
			uniqueConstraints: drizzleUniques,
		} = config;

		const schema = drizzleSchema || 'public';

		res.columns.push(
			...drizzleColumns.map<InterimColumn>((column) => {
				const name = getColumnCasing(column, casing);

				const isPk = column.primary
					|| config.primaryKeys.find((pk) =>
							pk.columns.some((col) => col.name ? col.name === column.name : col.keyAsName === column.keyAsName)
						) !== undefined;

				const notNull = column.notNull || isPk;

				const generated = column.generated;

				// DSQL doesn't support identity columns
				const identityValue = null;

				const generatedValue: Column['generated'] = generated
					? {
						as: is(generated.as, SQL)
							? dialect.sqlToQuery(generated.as as SQL).sql
							: typeof generated.as === 'function'
							? dialect.sqlToQuery(generated.as() as SQL).sql
							: String(generated.as),

						type: 'stored',
					}
					: null;

				const { baseColumn, dimensions, typeSchema, sqlType } = unwrapColumn(column);
				const columnDefault = defaultFromColumn(baseColumn, column.default, dimensions, dialect);

				return {
					entityType: 'columns',
					schema: schema,
					table: tableName,
					name,
					type: sqlType.replaceAll('[]', ''),
					typeSchema: typeSchema ?? null,
					dimensions: dimensions,
					pk: column.primary,
					pkName: null,
					notNull: notNull,
					default: columnDefault,
					generated: generatedValue,
					unique: column.isUnique,
					uniqueName: column.uniqueName ?? null,
					uniqueNullsNotDistinct: column.uniqueType === 'not distinct',
					identity: identityValue,
				} satisfies InterimColumn;
			}),
		);

		res.pks.push(
			...drizzlePKs.map<PrimaryKey>((pk) => {
				const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

				const name = pk.name || defaultNameForPK(tableName);

				return {
					entityType: 'pks',
					schema: schema,
					table: tableName,
					name: name,
					columns: columnNames,
					nameExplicit: pk.isNameExplicit,
				};
			}),
		);

		res.uniques.push(
			...drizzleUniques.map<UniqueConstraint>((unq) => {
				const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));
				const name = unq.isNameExplicit ? unq.name! : `${tableName}_${columnNames.join('_')}_unique`;
				return {
					entityType: 'uniques',
					schema: schema,
					table: tableName,
					name,
					nameExplicit: unq.isNameExplicit,
					nullsNotDistinct: unq.nullsNotDistinct,
					columns: columnNames,
				} satisfies UniqueConstraint;
			}),
		);

		// DSQL doesn't support foreign keys - skip FK processing

		for (const index of drizzleIndexes) {
			const columns = index.config.columns;
			for (const column of columns) {
				if (is(column, IndexedColumn)) continue;

				if (is(column, SQL) && !index.config.name) {
					errors.push({
						type: 'index_no_name',
						schema: schema,
						table: getTableName(index.config.table),
						sql: dialect.sqlToQuery(column).sql,
					});
					continue;
				}
			}
		}

		res.indexes.push(
			...drizzleIndexes.map<InterimIndex>((value) => {
				const columns = value.config.columns;

				let indexColumnNames = columns.map((it) => {
					const name = getColumnCasing(it as IndexedColumn, casing);
					return name;
				});

				const name = value.config.name ?? indexName(tableName, indexColumnNames);

				let indexColumns = columns.map((it) => {
					if (is(it, SQL)) {
						return {
							value: dialect.sqlToQuery(it, 'indexes').sql,
							isExpression: true,
							asc: true,
							nullsFirst: false,
							opclass: null,
						} satisfies Index['columns'][number];
					} else {
						it = it as IndexedColumn;

						let nullsFirst = false;
						let asc = it.indexConfig?.order ? it.indexConfig.order === 'asc' : true;
						if (!asc && !it.indexConfig?.nulls) nullsFirst = true;
						else nullsFirst = it.indexConfig?.nulls ? it.indexConfig.nulls === 'first' : nullsFirst;

						return {
							value: getColumnCasing(it as IndexedColumn, casing),
							isExpression: false,
							asc: asc,
							nullsFirst: nullsFirst,
							opclass: it.indexConfig?.opClass
								? {
									name: it.indexConfig.opClass,
									default: false,
								}
								: null,
						} satisfies Index['columns'][number];
					}
				});

				// DSQL only supports btree indexes - normalize method to btree
				const method = 'btree';

				let where = value.config.where ? dialect.sqlToQuery(value.config.where.inlineParams(), 'indexes').sql : '';
				where = where === 'true' ? '' : where;

				return {
					entityType: 'indexes',
					schema,
					table: tableName,
					name,
					nameExplicit: value.config.name !== undefined,
					columns: indexColumns,
					isUnique: value.config.unique,
					where: where ? where : null,
					concurrently: value.config.concurrently ?? false,
					method,
					with: '',
					forPK: false,
					forUnique: false,
				} satisfies InterimIndex;
			}),
		);

		// DSQL doesn't support policies - skip policy processing

		res.checks.push(
			...drizzleChecks.map((check) => {
				const value = dialect.sqlToQuery(check.value.inlineParams(), 'indexes').sql;

				const checkName = check.name;
				return {
					entityType: 'checks' as const,
					schema,
					table: tableName,
					name: checkName,
					value,
				};
			}),
		);
	}

	// DSQL doesn't support sequences - skip sequence processing

	// DSQL doesn't support roles - skip role processing

	// Process views
	for (const view of schema.views) {
		const viewConfig = getViewConfig(view);
		if (
			viewConfig.isExisting || !filter({ type: 'table', schema: viewConfig.schema ?? 'public', name: viewConfig.name })
		) {
			continue;
		}

		const viewSchema = viewConfig.schema ?? 'public';

		const withOpt = (view as any)[Symbol.for('drizzle:DSQLViewConfig')]?.with ?? null;

		const hasNonNullOpts = withOpt ? Object.values(withOpt).filter((x) => x !== null).length > 0 : false;

		res.views.push({
			entityType: 'views',
			definition: viewConfig.query ? dialect.sqlToQuery(viewConfig.query as SQL).sql : null,
			name: viewConfig.name,
			schema: viewSchema,
			with: hasNonNullOpts ? withOpt : null,
			withNoData: null, // DSQL doesn't support materialized views
			materialized: false, // DSQL doesn't support materialized views
			tablespace: null,
			using: null,
		});
	}

	return {
		schema: res,
		errors,
		warnings,
	};
};

/**
 * Extracts tables, schemas, and views from module exports.
 */
export const fromExports = (exports: Record<string, unknown>) => {
	const tables: DSQLTable[] = [];
	const schemas: DSQLSchema<string>[] = [];
	const views: DSQLView[] = [];
	const relations: Relations[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (is(t, DSQLTable)) {
			tables.push(t);
		}

		if (is(t, DSQLSchema)) {
			schemas.push(t);
		}

		if (isDSQLView(t)) {
			views.push(t);
		}

		if (is(t, Relations)) {
			relations.push(t);
		}
	});

	return {
		tables,
		schemas,
		views,
		relations,
	};
};

/**
 * Prepares schema entities from schema files for DSQL.
 */
export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: DSQLTable[] = [];
	const schemas: DSQLSchema<string>[] = [];
	const views: DSQLView[] = [];
	const relations: Relations[] = [];

	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];

			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = fromExports(i0);

			tables.push(...prepared.tables);
			schemas.push(...prepared.schemas);
			views.push(...prepared.views);
			relations.push(...prepared.relations);
		}
	});

	return {
		tables,
		schemas,
		views,
		relations,
	};
};
