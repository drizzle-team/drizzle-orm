import { getTableName, is, SQL } from 'drizzle-orm';
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
	PgMaterializedViewWithConfig,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgView,
	uniqueKeyName,
	ViewWithConfig,
} from 'drizzle-orm/pg-core';
import { CasingType } from 'src/cli/validations/common';
import { getColumnCasing } from 'src/serializer/utils';
import { escapeSingleQuotes, isPgArrayType, type SchemaError, type SchemaWarning } from '../../utils';
import { getOrNull } from '../utils';
import {
	type CheckConstraint,
	type Column,
	createDDL,
	type Enum,
	type ForeignKey,
	type Index,
	type InterimSchema,
	type Policy,
	type PostgresDDL,
	type PostgresEntities,
	type PrimaryKey,
	type Role,
	type Schema,
	type Sequence,
	type UniqueConstraint,
	type View,
} from './ddl';
import {
	buildArrayString,
	indexName,
	maxRangeForIdentityBasedOn,
	minRangeForIdentityBasedOn,
	stringFromIdentityProperty,
} from './grammar';

export const policyFrom = (policy: PgPolicy, dialect: PgDialect) => {
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
	const policyTo = mappedTo.sort(); // TODO: ??
	const policyUsing = is(policy.using, SQL) ? dialect.sqlToQuery(policy.using).sql : null;
	const withCheck = is(policy.withCheck, SQL) ? dialect.sqlToQuery(policy.withCheck).sql : null;

	return {
		name: policy.name,
		as: policyAs,
		for: policyFor,
		roles: policyTo,
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
export const fromDrizzleSchema = (
	drizzleSchemas: PgSchema[],
	drizzleTables: AnyPgTable[],
	drizzleEnums: PgEnum<any>[],
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

	const schemas = drizzleSchemas.map<Schema>((it) => ({
		entityType: 'schemas',
		name: it.schemaName,
	})).filter((it) => {
		if (schemaFilter) {
			return schemaFilter.includes(it.name) && it.name !== 'public';
		} else {
			return it.name !== 'public';
		}
	});

	const tableConfigPairs = drizzleTables.map((it) => {
		return { config: getTableConfig(it), table: it };
	});

	const tables = tableConfigPairs.map((it) => {
		const config = it.config;
		return {
			entityType: 'tables',
			schema: config.schema ?? 'public',
			name: config.name,
			isRlsEnabled: config.enableRLS,
		} satisfies PostgresEntities['tables'];
	});

	const indexes: Index[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const columns: Column[] = [];
	const policies: Policy[] = [];

	for (const { table, config } of tableConfigPairs) {
		const {
			name: tableName,
			columns: drizzleColumns,
			indexes: drizzleIndexes,
			foreignKeys: drizzleFKs,
			checks: drizzleChecks,
			schema: drizzleSchema,
			primaryKeys: drizzlePKs,
			uniqueConstraints: drizzleUniques,
			policies: drizzlePolicies,
			enableRLS,
		} = config;

		const schema = drizzleSchema || 'public';
		if (schemaFilter && !schemaFilter.includes(schema)) {
			continue;
		}

		columns.push(...drizzleColumns.map<Column>((column) => {
			const name = getColumnCasing(column, casing);
			const notNull = column.notNull;
			const primaryKey = column.primary;
			const sqlTypeLowered = column.getSQLType().toLowerCase();

			const typeSchema = is(column, PgEnumColumn) ? column.enum.schema || 'public' : null;
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

			const generatedValue: Column['generated'] = generated
				? {
					as: is(generated.as, SQL)
						? dialect.sqlToQuery(generated.as as SQL).sql
						: typeof generated.as === 'function'
						? dialect.sqlToQuery(generated.as() as SQL).sql
						: String(generated.as),

					type: 'stored', // TODO: why only stored? https://orm.drizzle.team/docs/generated-columns
				}
				: null;

			const identityValue: Column['identity'] = identity
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
				: null;

			const isExpression: boolean = !column.default ? false : is(column.default, SQL);
			const value = !column.default ? null : is(column.default, SQL)
				? dialect.sqlToQuery(column.default).sql
				: typeof column.default === 'string'
				? `'${escapeSingleQuotes(column.default)}'`
				: sqlTypeLowered === 'jsonb' || sqlTypeLowered === 'json'
				? `'${JSON.stringify(column.default)}'::${sqlTypeLowered}`
				: isPgArrayType(sqlTypeLowered) && Array.isArray(column.default)
				? buildArrayString(column.default, sqlTypeLowered)
				: column.default instanceof Date
				? (sqlTypeLowered === 'date'
					? `'${column.default.toISOString().split('T')[0]}'`
					: sqlTypeLowered === 'timestamp'
					? `'${column.default.toISOString().replace('T', ' ').slice(0, 23)}'`
					: `'${column.default.toISOString()}'`)
				: String(column.default);

			const defaultValue = !column.default
				? null
				: {
					value: value!,
					expression: isExpression,
				};

			// TODO:??
			// Should do for all types
			// columnToSet.default = `'${column.default}'::${sqlTypeLowered}`;

			return {
				entityType: 'columns',
				schema: schema,
				table: tableName,
				name,
				type: column.getSQLType(),
				typeSchema: typeSchema ?? null,
				primaryKey,
				notNull,
				default: defaultValue,
				generated: generatedValue,
				isUnique: column.isUnique,
				uniqueName: column.uniqueName ?? null,
				nullsNotDistinct: column.uniqueType === 'not distinct',
				identity: identityValue,
			};
		}));

		pks.push(...drizzlePKs.map<PrimaryKey>((pk) => {
			const originalColumnNames = pk.columns.map((c) => c.name);
			const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

			let name = pk.name || pk.getName();
			if (casing !== undefined) {
				for (let i = 0; i < originalColumnNames.length; i++) {
					name = name.replace(originalColumnNames[i], columnNames[i]);
				}
			}
			return {
				entityType: 'pks',
				schema: schema,
				table: tableName,
				name: name,
				columns: columnNames,
				isNameExplicit: !pk.name,
			};
		}));

		uniques.push(...drizzleUniques.map<UniqueConstraint>((unq) => {
			const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));
			const name = unq.name || uniqueKeyName(table, columnNames);

			return {
				entityType: 'uniques',
				schema: schema,
				table: tableName,
				name,
				nullsNotDistinct: unq.nullsNotDistinct,
				columns: columnNames,
			};
		}));

		fks.push(...drizzleFKs.map<ForeignKey>((fk) => {
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
				entityType: 'fks',
				schema: schema,
				table: tableFrom,
				name,
				tableFrom,
				tableTo,
				schemaTo,
				columnsFrom,
				columnsTo,
				onDelete,
				onUpdate,
			} as ForeignKey;
		}));

		for (const index of drizzleIndexes) {
			const columns = index.config.columns;
			for (const column of columns) {
				if (is(column, IndexedColumn) && column.type !== 'PgVector') continue;

				if (is(column, SQL) && !index.config.name) {
					errors.push({
						type: 'index_no_name',
						schema: schema,
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

		indexes.push(...drizzleIndexes.map<Index>((value) => {
			const columns = value.config.columns;

			let indexColumnNames = columns.map((it) => {
				const name = getColumnCasing(it as IndexedColumn, casing);
				return name;
			});

			const name = value.config.name ? value.config.name : indexName(tableName, indexColumnNames);
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
					return {
						value: getColumnCasing(it as IndexedColumn, casing),
						isExpression: false,
						asc: it.indexConfig?.order === 'asc',
						nullsFirst: it.indexConfig?.nulls
							? it.indexConfig?.nulls === 'first'
								? true
								: false
							: false,
						opclass: it.indexConfig?.opClass
							? {
								name: it.indexConfig.opClass,
								default: false,
							}
							: null,
					} satisfies Index['columns'][number];
				}
			});

			return {
				entityType: 'indexes',
				schema,
				table: tableName,
				name,
				columns: indexColumns,
				isUnique: value.config.unique,
				where: value.config.where ? dialect.sqlToQuery(value.config.where).sql : null,
				concurrently: value.config.concurrently ?? false,
				method: value.config.method ?? 'btree',
				with: Object.entries(value.config.with || {}).map((it) => `${it[0]}=${it[1]}`).join(', '),
			} satisfies Index;
		}));

		policies.push(...drizzlePolicies.map<Policy>((policy) => {
			const p = policyFrom(policy, dialect);
			return {
				entityType: 'policies',
				schema: schema,
				table: tableName,
				name: p.name,
				as: p.as,
				for: p.for,
				roles: p.roles,
				using: p.using,
				withCheck: p.withCheck,
			};
		}));

		checks.push(...drizzleChecks.map<CheckConstraint>((check) => {
			const checkName = check.name;
			return {
				entityType: 'checks',
				schema,
				table: tableName,
				name: checkName,
				value: dialect.sqlToQuery(check.value).sql,
			};
		}));
	}

	const policyNames = new Set<string>();
	for (const policy of drizzlePolicies) {
		if (!('_linkedTable' in policy)) {
			warnings.push({ type: 'policy_not_linked', policy: policy.name });
			continue;
		}

		// @ts-ignore
		const { schema: configSchema, name: tableName } = getTableConfig(policy._linkedTable);

		const p = policyFrom(policy, dialect);
		policies.push({
			entityType: 'policies',
			schema: configSchema ?? 'public',
			table: tableName,
			name: p.name,
			as: p.as,
			for: p.for,
			roles: p.roles,
			using: p.using,
			withCheck: p.withCheck,
		});
	}

	const sequences: Sequence[] = [];

	for (const sequence of drizzleSequences) {
		const name = sequence.seqName!;
		const increment = stringFromIdentityProperty(sequence.seqOptions?.increment) ?? '1';
		const minValue = stringFromIdentityProperty(sequence.seqOptions?.minValue)
			?? (parseFloat(increment) < 0 ? '-9223372036854775808' : '1');
		const maxValue = stringFromIdentityProperty(sequence.seqOptions?.maxValue)
			?? (parseFloat(increment) < 0 ? '-1' : '9223372036854775807');
		const startWith = stringFromIdentityProperty(sequence.seqOptions?.startWith)
			?? (parseFloat(increment) < 0 ? maxValue : minValue);
		const cache = stringFromIdentityProperty(sequence.seqOptions?.cache) ?? '1';
		sequences.push({
			entityType: 'sequences',
			name,
			schema: sequence.schema ?? 'public',
			incrementBy: increment,
			startWith,
			minValue,
			maxValue,
			cacheSize: cache,
			cycle: sequence.seqOptions?.cycle ?? false,
		});
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

	for (const view of combinedViews) {
		const {
			name: viewName,
			schema,
			query,
			isExisting,
			tablespace,
			using,
			withNoData,
			materialized,
		} = view;

		const viewSchema = schema ?? 'public';

		type MergerWithConfig = keyof (ViewWithConfig & PgMaterializedViewWithConfig);
		const opt = view.with as { [K in MergerWithConfig]: (ViewWithConfig & PgMaterializedViewWithConfig)[K] } | null;

		views.push({
			entityType: 'views',
			definition: isExisting ? null : dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
			isExisting,
			with: opt
				? {
					checkOption: getOrNull(opt, 'checkOption'),
					securityBarrier: getOrNull(opt, 'securityBarrier'),
					securityInvoker: getOrNull(opt, 'securityInvoker'),
					autovacuumEnabled: getOrNull(opt, 'autovacuumEnabled'),
					autovacuumFreezeMaxAge: getOrNull(opt, 'autovacuumFreezeMaxAge'),
					autovacuumFreezeMinAge: getOrNull(opt, 'autovacuumFreezeMinAge'),
					autovacuumFreezeTableAge: getOrNull(opt, 'autovacuumFreezeTableAge'),
					autovacuumMultixactFreezeMaxAge: getOrNull(opt, 'autovacuumMultixactFreezeMaxAge'),
					autovacuumMultixactFreezeMinAge: getOrNull(opt, 'autovacuumMultixactFreezeMinAge'),
					autovacuumMultixactFreezeTableAge: getOrNull(opt, 'autovacuumMultixactFreezeTableAge'),
					autovacuumVacuumCostDelay: getOrNull(opt, 'autovacuumVacuumCostDelay'),
					autovacuumVacuumCostLimit: getOrNull(opt, 'autovacuumVacuumCostLimit'),
					autovacuumVacuumScaleFactor: getOrNull(opt, 'autovacuumVacuumScaleFactor'),
					autovacuumVacuumThreshold: getOrNull(opt, 'autovacuumVacuumThreshold'),
					fillfactor: getOrNull(opt, 'fillfactor'),
					logAutovacuumMinDuration: getOrNull(opt, 'logAutovacuumMinDuration'),
					parallelWorkers: getOrNull(opt, 'parallelWorkers'),
					toastTupleTarget: getOrNull(opt, 'toastTupleTarget'),
					userCatalogTable: getOrNull(opt, 'userCatalogTable'),
					vacuumIndexCleanup: getOrNull(opt, 'vacuumIndexCleanup'),
					vacuumTruncate: getOrNull(opt, 'vacuumTruncate'),
				}
				: null,
			withNoData: withNoData ?? null,
			materialized,
			tablespace: tablespace ?? null,
			using: using
				? {
					name: using,
					default: false,
				}
				: null,
		});
	}

	const enums = drizzleEnums.map<Enum>((e) => {
		return {
			entityType: 'enums',
			name: e.enumName,
			schema: e.schema || 'public',
			values: e.enumValues,
		};
	});

	return {
		schema: {
			schemas,
			tables,
			enums,
			columns,
			indexes,
			fks,
			pks,
			uniques,
			checks,
			sequences,
			roles,
			policies,
			views,
		},
		errors,
		warnings,
	};
};

// TODO: convert drizzle entities to internal entities on 1 step above so that:
// drizzle studio can use this method without drizzle orm
export const generatePgSnapshot = (schema: InterimSchema): { ddl: PostgresDDL; errors: SchemaError[] } => {
	const ddl = createDDL();
	const errors: SchemaError[] = [];

	for (const it of schema.schemas) {
		const res = ddl.schemas.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'schema_name_duplicate', name: it.name });
		}
	}

	for (const it of schema.enums) {
		const res = ddl.enums.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'enum_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	for (const it of schema.tables) {
		const res = ddl.tables.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'table_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	for (const column of schema.columns) {
		const res = ddl.columns.insert(column);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'column_name_duplicate', schema: column.schema, table: column.table, name: column.name });
		}
	}

	for (const it of schema.indexes) {
		const res = ddl.indexes.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'index_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.fks) {
		const res = ddl.fks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.pks) {
		const res = ddl.pks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.uniques) {
		const res = ddl.uniques.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}
	for (const it of schema.checks) {
		const res = ddl.checks.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'constraint_name_duplicate', schema: it.schema, table: it.table, name: it.name });
		}
	}

	for (const it of schema.roles) {
		const res = ddl.roles.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'role_duplicate', name: it.name });
		}
	}
	for (const it of schema.policies) {
		const res = ddl.policies.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'policy_duplicate', schema: it.schema, table: it.table, policy: it.name });
		}
	}
	for (const it of schema.views) {
		const res = ddl.views.insert(it);
		if (res.status === 'CONFLICT') {
			errors.push({ type: 'view_name_duplicate', schema: it.schema, name: it.name });
		}
	}

	return { ddl, errors };
};



