import { getTableName, is, Simplify, SQL } from 'drizzle-orm';
import {
	AnyPgTable,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	PgDialect,
	PgEnum,
	PgEnumColumn,
	PgMaterializedView,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgView,
	uniqueKeyName,
} from 'drizzle-orm/pg-core';
import type { CasingType } from '../cli/validations/common';
import type {
	Column,
	Enum,
	ForeignKey,
	IndexColumnType,
	Policy,
	PrimaryKey,
	Role,
	Sequence,
	Table,
	UniqueConstraint,
	View,
} from '../dialects/postgres/ddl';
import { escapeSingleQuotes, isPgArrayType, RecordValues, RecordValuesAnd, SchemaError, SchemaWarning } from '../utils';
import { InterimSchema } from './pgSerializer';
import { getColumnCasing, sqlToStr } from './utils';

export const indexName = (tableName: string, columns: string[]) => {
	return `${tableName}_${columns.join('_')}_index`;
};

function stringFromIdentityProperty(field: string | number | undefined): string | undefined {
	return typeof field === 'string' ? (field as string) : typeof field === 'undefined' ? undefined : String(field);
}

function maxRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '2147483647' : columnType === 'bigint' ? '9223372036854775807' : '32767';
}

function minRangeForIdentityBasedOn(columnType: string) {
	return columnType === 'integer' ? '-2147483648' : columnType === 'bigint' ? '-9223372036854775808' : '-32768';
}

function stringFromDatabaseIdentityProperty(field: any): string | undefined {
	return typeof field === 'string'
		? (field as string)
		: typeof field === 'undefined'
		? undefined
		: typeof field === 'bigint'
		? field.toString()
		: String(field);
}

export function buildArrayString(array: any[], sqlType: string): string {
	sqlType = sqlType.split('[')[0];
	const values = array
		.map((value) => {
			if (typeof value === 'number' || typeof value === 'bigint') {
				return value.toString();
			} else if (typeof value === 'boolean') {
				return value ? 'true' : 'false';
			} else if (Array.isArray(value)) {
				return buildArrayString(value, sqlType);
			} else if (value instanceof Date) {
				if (sqlType === 'date') {
					return `"${value.toISOString().split('T')[0]}"`;
				} else if (sqlType === 'timestamp') {
					return `"${value.toISOString().replace('T', ' ').slice(0, 23)}"`;
				} else {
					return `"${value.toISOString()}"`;
				}
			} else if (typeof value === 'object') {
				return `"${JSON.stringify(value).replaceAll('"', '\\"')}"`;
			}

			return `"${value}"`;
		})
		.join(',');

	return `{${values}}`;
}

export type InterimTable = Simplify<
	& Omit<
		Table,
		| 'columns'
		| 'indexes'
		| 'foreignKeys'
		| 'compositePrimaryKeys'
		| 'uniqueConstraints'
		| 'policies'
		| 'checkConstraints'
	>
	& {
		columns: RecordValues<Table['columns']>;
		indexes: RecordValues<Table['indexes']>;
		foreignKeys: RecordValues<Table['foreignKeys']>;
		compositePrimaryKeys: RecordValues<Table['compositePrimaryKeys']>;
		uniqueConstraints: RecordValues<Table['uniqueConstraints']>;
		checkConstraints: RecordValues<Table['checkConstraints']>;
		policies: RecordValuesAnd<Table['policies'], { table?: string }>;
	}
>;

const policyFrom = (policy: PgPolicy, dialect: PgDialect) => {
	const mappedTo = !policy.to
		? ['public']
		: typeof policy.to === 'string'
		? [policy.to]
		: is(policy, PgRole)
		? [(policy.to as PgRole).name]
		: Array.isArray(policy.to)
		? policy.to.map((it) => {
			if (typeof it === 'string') {
				return it;
			} else if (is(it, PgRole)) {
				return it.name;
			}
			return '' as never; // unreachable unless error in types
		})
		: '' as never; // unreachable unless error in types

	const policyAs = policy.as?.toUpperCase() as Policy['as'] ?? 'PERMISSIVE';
	const policyFor = policy.for?.toUpperCase() as Policy['for'] ?? 'ALL';
	const policyTo = mappedTo.sort(); // ??
	const policyUsing = is(policy.using, SQL) ? dialect.sqlToQuery(policy.using).sql : undefined;
	const withCheck = is(policy.withCheck, SQL) ? dialect.sqlToQuery(policy.withCheck).sql : undefined;

	return {
		name: policy.name,
		as: policyAs,
		for: policyFor,
		to: policyTo,
		using: policyUsing,
		withCheck,
	};
};

/*
	We map drizzle entities into interim schema entities,
	so that both Drizzle Kit and Drizzle Studio are able to share
	common business logic of composing and diffing InternalSchema

	By having interim schemas based on arrays instead of records - we can postpone
	collissions(duplicate indexes, columns, etc.) checking/or printing via extra `errors` field upwards,
	while trimming serializer.ts of Hanji & Chalk dependencies
*/
export const drizzleToInternal = (
	drizzleTables: AnyPgTable[],
	drizzleEnums: PgEnum<any>[],
	drizzleSchemas: PgSchema[],
	drizzleSequences: PgSequence[],
	drizzleRoles: PgRole[],
	drizzlePolicies: PgPolicy[],
	drizzleViews: PgView[],
	drizzleMatViews: PgMaterializedView[],
	casing: CasingType | undefined,
	schemaFilter?: string[],
): { schema: InterimSchema; errors: SchemaError[]; warnings: SchemaWarning[] } => {
	const dialect = new PgDialect({ casing });
	const errors: SchemaError[] = [];
	const warnings: SchemaWarning[] = [];

	const recordKeyForTable = (table: string, schema?: string) => {
		return `${schema || 'public'}.${table}`;
	};

	const tables: InterimTable[] = [];
	const tablesRecord: Record<string, InterimTable> = {};

	for (const table of drizzleTables) {
		const {
			name: tableName,
			columns: drizzleColumns,
			indexes: drizzleIndexes,
			foreignKeys: drizzleFKs,
			checks: drizzleChecks,
			schema,
			primaryKeys: drizzlePKs,
			uniqueConstraints: drizzleUniques,
			policies: drizzlePolicies,
			enableRLS,
		} = getTableConfig(table);

		if (schemaFilter && !schemaFilter.includes(schema ?? 'public')) {
			continue;
		}

		const columns: Column[] = drizzleColumns.map((column) => {
			const name = getColumnCasing(column, casing);
			const notNull = column.notNull;
			const primaryKey = column.primary;
			const sqlTypeLowered = column.getSQLType().toLowerCase();

			const typeSchema = is(column, PgEnumColumn) ? column.enum.schema || 'public' : undefined;
			const generated = column.generated;
			const identity = column.generatedIdentity;

			const increment = stringFromIdentityProperty(identity?.sequenceOptions?.increment) ?? '1';
			const minValue = stringFromIdentityProperty(identity?.sequenceOptions?.minValue)
				?? (parseFloat(increment) < 0 ? minRangeForIdentityBasedOn(column.columnType) : '1');
			const maxValue = stringFromIdentityProperty(identity?.sequenceOptions?.maxValue)
				?? (parseFloat(increment) < 0 ? '-1' : maxRangeForIdentityBasedOn(column.getSQLType()));
			const startWith = stringFromIdentityProperty(identity?.sequenceOptions?.startWith)
				?? (parseFloat(increment) < 0 ? maxValue : minValue);
			const cache = stringFromIdentityProperty(identity?.sequenceOptions?.cache) ?? '1';

			const generatedValue = generated
				? {
					as: is(generated.as, SQL)
						? dialect.sqlToQuery(generated.as as SQL).sql
						: typeof generated.as === 'function'
						? dialect.sqlToQuery(generated.as() as SQL).sql
						: (generated.as as any),
					type: 'stored' as const,
				}
				: undefined;

			const identityValue = identity
				? {
					type: identity.type,
					name: identity.sequenceName ?? `${tableName}_${name}_seq`,
					increment,
					startWith,
					minValue,
					maxValue,
					cache,
					cycle: identity?.sequenceOptions?.cycle ?? false,
				}
				: undefined;

			let defaultValue = undefined;
			if (column.default) {
				if (is(column.default, SQL)) {
					defaultValue = sqlToStr(column.default, casing);
				} else {
					if (typeof column.default === 'string') {
						defaultValue = `'${escapeSingleQuotes(column.default)}'`;
					} else {
						if (sqlTypeLowered === 'jsonb' || sqlTypeLowered === 'json') {
							defaultValue = `'${JSON.stringify(column.default)}'::${sqlTypeLowered}`;
						} else if (column.default instanceof Date) {
							if (sqlTypeLowered === 'date') {
								defaultValue = `'${column.default.toISOString().split('T')[0]}'`;
							} else if (sqlTypeLowered === 'timestamp') {
								defaultValue = `'${column.default.toISOString().replace('T', ' ').slice(0, 23)}'`;
							} else {
								defaultValue = `'${column.default.toISOString()}'`;
							}
						} else if (isPgArrayType(sqlTypeLowered) && Array.isArray(column.default)) {
							defaultValue = `'${buildArrayString(column.default, sqlTypeLowered)}'`;
						} else {
							// Should do for all types
							// columnToSet.default = `'${column.default}'::${sqlTypeLowered}`;
							defaultValue = column.default;
						}
					}
				}
			}

			/* in */
			const uniqueMeta = column.isUnique
				? {
					isUnique: column.isUnique,
					uniqueName: column.uniqueName,
					nullsNotDistinct: column.uniqueType === 'not distinct',
				}
				: {};
			const identityMeta = identityValue
				? {
					identity: identityValue,
				}
				: {};

			return {
				name,
				type: column.getSQLType(),
				typeSchema: typeSchema,
				primaryKey,
				notNull,
				default: defaultValue,
				generated: generatedValue,
				...identityMeta,
				...uniqueMeta,
			};
		});

		const constraintNames = new Set<string>();

		for (const column of columns) {
			if (!column.isUnique) continue;
			const key = `${schema || 'public'}:${tableName}:${column.uniqueName!}`;

			if (constraintNames.has(key)) {
				errors.push({
					type: 'constraint_name_duplicate',
					schema: schema || 'public',
					table: tableName,
					name: column.uniqueName!,
				});
			}

			/*
				we can't convert unique drizzle columns to constraints here
				because this part of business logic should be common between
				both CLI and Drizzle Studio, but we need
			*/
			constraintNames.add(key);
		}

		const pks: PrimaryKey[] = drizzlePKs.map((pk) => {
			const originalColumnNames = pk.columns.map((c) => c.name);
			const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

			let name = pk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnNames.length; i++) {
					name = name.replace(originalColumnNames[i], columnNames[i]);
				}
			}
			return {
				name,
				columns: columnNames,
			};
		});

		const uniques: UniqueConstraint[] = drizzleUniques.map((unq) => {
			const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));
			const name = unq.name || uniqueKeyName(table, columnNames);
			return {
				name,
				nullsNotDistinct: unq.nullsNotDistinct,
				columns: columnNames,
			};
		});

		const fks: ForeignKey[] = drizzleFKs.map((fk) => {
			const tableFrom = tableName;
			const onDelete = fk.onDelete;
			const onUpdate = fk.onUpdate;
			const reference = fk.reference();

			const tableTo = getTableName(reference.foreignTable);
			// TODO: resolve issue with schema undefined/public for db push(or squasher)
			// getTableConfig(reference.foreignTable).schema || "public";
			const schemaTo = getTableConfig(reference.foreignTable).schema;

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
				name,
				tableFrom,
				tableTo,
				schemaTo,
				columnsFrom,
				columnsTo,
				onDelete,
				onUpdate,
			} as ForeignKey;
		});

		for (const index of drizzleIndexes) {
			const columns = index.config.columns;
			for (const column of columns) {
				if (is(column, IndexedColumn) && column.type !== 'PgVector') continue;

				if (is(column, SQL) && !index.config.name) {
					errors.push({
						type: 'index_no_name',
						schema: schema || 'public',
						table: getTableName(index.config.table),
						sql: dialect.sqlToQuery(column).sql,
					});
					continue;
				}

				if (is(column, IndexedColumn) && column.type === 'PgVector' && !column.indexConfig.opClass) {
					const columnName = getColumnCasing(column, casing);
					errors.push({
						type: 'pgvector_index_noop',
						table: tableName,
						column: columnName,
						indexName: index.config.name!,
						method: index.config.method!,
					});
				}
			}
		}

		const indexNames = new Set<string>();
		for (const index of drizzleIndexes) {
			// check for index names duplicates
			const name = `${schema || 'public'}:${index.config.name}`;
			if (!indexNames.has(name)) {
				indexNames.add(name);
				continue;
			}
			errors.push({
				type: 'index_duplicate',
				schema: schema || 'public',
				table: tableName,
				indexName: index.config.name!,
			});
		}

		const indexes = drizzleIndexes.map((value) => {
			const columns = value.config.columns;

			let indexColumnNames = columns.map((it) => {
				const name = getColumnCasing(it as IndexedColumn, casing);
				return name;
			});

			const name = value.config.name ? value.config.name : indexName(tableName, indexColumnNames);
			let indexColumns: IndexColumnType[] = columns.map(
				(it): IndexColumnType => {
					if (is(it, SQL)) {
						return {
							expression: dialect.sqlToQuery(it, 'indexes').sql,
							asc: true,
							isExpression: true,
							nulls: 'last',
						};
					} else {
						it = it as IndexedColumn;
						return {
							expression: getColumnCasing(it as IndexedColumn, casing),
							isExpression: false,
							asc: it.indexConfig?.order === 'asc',
							nulls: it.indexConfig?.nulls
								? it.indexConfig?.nulls
								: it.indexConfig?.order === 'desc'
								? 'first'
								: 'last',
							opclass: it.indexConfig?.opClass,
						};
					}
				},
			);

			return {
				name,
				columns: indexColumns,
				isUnique: value.config.unique ?? false,
				where: value.config.where ? dialect.sqlToQuery(value.config.where).sql : undefined,
				concurrently: value.config.concurrently ?? false,
				method: value.config.method ?? 'btree',
				with: value.config.with ?? {},
			};
		});

		const policyNames = new Set<string>();
		for (const { name } of drizzlePolicies) {
			if (!policyNames.has(name)) {
				policyNames.add(name);
				continue;
			}
			errors.push({
				type: 'policy_duplicate',
				schema: schema || 'public',
				table: tableName,
				policy: name,
			});
		}

		const policies = drizzlePolicies.map((policy) => policyFrom(policy, dialect));

		for (const check of drizzleChecks) {
			const key = `${schema || 'public'}:${tableName}:${check.name}`;
			if (constraintNames.has(key)) {
				errors.push({
					type: 'constraint_name_duplicate',
					name: check.name,
					schema: schema || 'public',
					table: tableName,
				});
			}
			constraintNames.add(key);
		}

		const checks = drizzleChecks.map((check) => {
			const checkName = check.name;
			return {
				name: checkName,
				value: dialect.sqlToQuery(check.value).sql,
			};
		});

		const mapped = {
			name: tableName,
			schema: schema ?? '',
			columns: columns,
			indexes: indexes,
			foreignKeys: fks,
			compositePrimaryKeys: pks,
			uniqueConstraints: uniques,
			policies: policies,
			checkConstraints: checks,
			isRLSEnabled: enableRLS,
		};

		const recordKey = recordKeyForTable(tableName, schema);
		tablesRecord[recordKey] = mapped;
		tables.push(mapped);
	}

	const policies: Policy[] = [];
	const policyNames = new Set<string>();
	for (const policy of drizzlePolicies) {
		// @ts-ignore
		if (!policy._linkedTable) {
			warnings.push({ type: 'policy_not_linked', policy: policy.name });
			continue;
		}

		// @ts-ignore
		const { schema, name: tableName } = getTableConfig(policy._linkedTable);

		const validationKey = `${schema || 'public'}:${tableName}:${policy.name}`;
		if (policyNames.has(validationKey)) {
			errors.push({
				type: 'policy_duplicate',
				schema: schema || 'public',
				table: tableName,
				policy: policy.name,
			});
			continue;
		}

		const mapped = policyFrom(policy, dialect);
		const key = recordKeyForTable(tableName, schema);
		const table = tablesRecord[key];

		if (table) {
			table.policies.push(mapped);
		} else {
			policies.push({
				...mapped,
				schema: schema ?? 'public',
				on: `"${schema ?? 'public'}"."${tableName}"`,
			});
		}
	}

	const sequences: Sequence[] = [];
	const sequenceNames = new Set<string>();

	for (const sequence of drizzleSequences) {
		const name = sequence.seqName!;
		const increment = stringFromIdentityProperty(sequence?.seqOptions?.increment) ?? '1';
		const minValue = stringFromIdentityProperty(sequence?.seqOptions?.minValue)
			?? (parseFloat(increment) < 0 ? '-9223372036854775808' : '1');
		const maxValue = stringFromIdentityProperty(sequence?.seqOptions?.maxValue)
			?? (parseFloat(increment) < 0 ? '-1' : '9223372036854775807');
		const startWith = stringFromIdentityProperty(sequence?.seqOptions?.startWith)
			?? (parseFloat(increment) < 0 ? maxValue : minValue);
		const cache = stringFromIdentityProperty(sequence?.seqOptions?.cache) ?? '1';
		sequences.push({
			entityType: 'sequences',
			name,
			schema: sequence.schema ?? 'public',
			increment,
			startWith,
			minValue,
			maxValue,
			cache,
			cycle: sequence.seqOptions?.cycle ?? false,
		});

		const dupKey = `${sequence.schema ?? 'public'}.${name}`;
		if (sequenceNames.has(dupKey)) {
			errors.push({ type: 'sequence_name_duplicate', schema: sequence.schema || 'public', name });
			continue;
		}
		sequenceNames.add(dupKey);
	}

	const roles: Role[] = [];
	for (const _role of drizzleRoles) {
		const role = _role as any;
		if (role._existing) continue;

		roles.push({
			entityType: 'roles',
			name: role.name,
			createDb: role.createDb ?? false,
			createRole: role.createRole ?? false,
			inherit: role.inherit ?? true,
		});
	}

	const views: View[] = [];
	const combinedViews = [...drizzleViews, ...drizzleMatViews].map((it) => {
		if (is(it, PgView)) {
			return {
				...getViewConfig(it),
				materialized: false,
				tablespace: undefined,
				using: undefined,
				withNoData: undefined,
			};
		} else {
			return { ...getMaterializedViewConfig(it), materialized: true };
		}
	});

	const viewNames = new Set<string>();
	for (const view of combinedViews) {
		const {
			name: viewName,
			schema,
			query,
			isExisting,
			with: withOption,
			tablespace,
			using,
			withNoData,
			materialized,
		} = view;

		const viewSchema = schema ?? 'public';
		const viewKey = `${viewSchema}.${viewName}`;

		if (viewNames.has(viewKey)) {
			errors.push({ type: 'view_name_duplicate', schema: viewSchema, name: viewName });
			continue;
		}
		viewNames.add(viewKey);

		views.push({
			entityType: 'views',
			definition: isExisting ? null : dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
			isExisting,
			with: withOption,
			withNoData,
			materialized,
			tablespace,
			using,
		});
	}

	const enums: Enum[] = [];
	for (const e of drizzleEnums) {
		const enumSchema = e.schema || 'public';
		const key = `${enumSchema}.${e.enumName}`;
		enums.push({
			name: e.enumName,
			schema: enumSchema,
			values: e.enumValues,
		});
	}
	const schemas = drizzleSchemas.filter((it) => {
		if (schemaFilter) {
			return schemaFilter.includes(it.schemaName) && it.schemaName !== 'public';
		} else {
			return it.schemaName !== 'public';
		}
	}).map((it) => it.schemaName);

	const interimSchema = { schemas, tables, enums, views, sequences, policies, roles };

	return { schema: interimSchema, errors, warnings };
};
