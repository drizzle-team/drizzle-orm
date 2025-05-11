import { getTableName, is, SQL } from 'drizzle-orm';
import {
	GelArray,
	GelDialect,
	GelMaterializedView,
	GelMaterializedViewWithConfig,
	GelPolicy,
	GelRole,
	GelSchema,
	GelSequence,
	GelTable,
	GelView,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	uniqueKeyName,
	ViewWithConfig,
} from 'drizzle-orm/gel-core';
import { PgEnum, PgEnumColumn } from 'drizzle-orm/pg-core';
import { getColumnCasing } from 'src/serializer/utils';
import { CasingType } from '../../cli/validations/common';
import {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	InterimColumn,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	SchemaError,
	SchemaWarning,
	Sequence,
	UniqueConstraint,
	View,
} from '../postgres/ddl';
import { defaultFromColumn, policyFrom, transformOnUpdateDelete } from '../postgres/drizzle';
import {
	defaultNameForPK,
	indexName,
	maxRangeForIdentityBasedOn,
	minRangeForIdentityBasedOn,
	stringFromIdentityProperty,
} from '../postgres/grammar';
import { getOrNull } from '../utils';

const unwrapArray = (column: GelArray<any, any>, dimensions: number = 1) => {
	const baseColumn = column.baseColumn;
	if (is(baseColumn, GelArray)) return unwrapArray(baseColumn, dimensions + 1);

	return { baseColumn, dimensions };
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
	drizzleSchemas: GelSchema[],
	drizzleTables: GelTable[],
	drizzleEnums: PgEnum<any>[],
	drizzleSequences: GelSequence[],
	drizzleRoles: GelRole[],
	drizzlePolicies: GelPolicy[],
	drizzleViews: GelView[],
	drizzleMatViews: GelMaterializedView[],
	casing: CasingType | undefined,
	schemaFilter?: string[],
): {
	schema: InterimSchema;
	errors: SchemaError[];
	warnings: SchemaWarning[];
} => {
	const dialect = new GelDialect({ casing });
	const errors: SchemaError[] = [];
	const warnings: SchemaWarning[] = [];

	const schemas = drizzleSchemas
		.map<Schema>((it) => ({
			entityType: 'schemas',
			name: it.schemaName,
		}))
		.filter((it) => {
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
			isRlsEnabled: config.enableRLS || config.policies.length > 0,
		} satisfies PostgresEntities['tables'];
	});

	const indexes: Index[] = [];
	const pks: PrimaryKey[] = [];
	const fks: ForeignKey[] = [];
	const uniques: UniqueConstraint[] = [];
	const checks: CheckConstraint[] = [];
	const columns: InterimColumn[] = [];
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

		columns.push(
			...drizzleColumns.map<InterimColumn>((column) => {
				const name = getColumnCasing(column, casing);
				const notNull = column.notNull;
				const isPrimary = column.primary;

				const { baseColumn, dimensions } = is(column, GelArray)
					? unwrapArray(column)
					: { baseColumn: column, dimensions: 0 };

				const typeSchema = is(baseColumn, PgEnumColumn)
					? baseColumn.enum.schema || 'public'
					: null;
				const generated = column.generated;
				const identity = column.generatedIdentity;

				const increment = stringFromIdentityProperty(identity?.sequenceOptions?.increment)
					?? '1';
				const minValue = stringFromIdentityProperty(identity?.sequenceOptions?.minValue)
					?? (parseFloat(increment) < 0
						? minRangeForIdentityBasedOn(column.columnType)
						: '1');
				const maxValue = stringFromIdentityProperty(identity?.sequenceOptions?.maxValue)
					?? (parseFloat(increment) < 0
						? '-1'
						: maxRangeForIdentityBasedOn(column.getSQLType()));
				const startWith = stringFromIdentityProperty(identity?.sequenceOptions?.startWith)
					?? (parseFloat(increment) < 0 ? maxValue : minValue);
				const cache = Number(stringFromIdentityProperty(identity?.sequenceOptions?.cache) ?? 1);

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
					: null;

				// TODO:??
				// Should do for all types
				// columnToSet.default = `'${column.default}'::${sqlTypeLowered}`;

				let sqlType = column.getSQLType();
				/* legacy, for not to patch orm and don't up snapshot */
				sqlType = sqlType.startsWith('timestamp (') ? sqlType.replace('timestamp (', 'timestamp(') : sqlType;

				return {
					entityType: 'columns',
					schema: schema,
					table: tableName,
					name,
					type: sqlType,
					typeSchema: typeSchema ?? null,
					dimensions: dimensions,
					pk: column.primary,
					pkName: null,
					notNull: notNull && !isPrimary && !generatedValue && !identityValue,
					default: defaultFromColumn(baseColumn, column.default, dimensions, dialect),
					generated: generatedValue,
					unique: column.isUnique,
					uniqueName: column.uniqueNameExplicit ? column.uniqueName ?? null : null,
					uniqueNullsNotDistinct: column.uniqueType === 'not distinct',
					identity: identityValue,
				} satisfies InterimColumn;
			}),
		);

		pks.push(
			...drizzlePKs.map<PrimaryKey>((pk) => {
				const columnNames = pk.columns.map((c) => getColumnCasing(c, casing));

				const name = pk.name || defaultNameForPK(tableName);
				const isNameExplicit = !!pk.name;
				return {
					entityType: 'pks',
					schema: schema,
					table: tableName,
					name: name,
					columns: columnNames,
					nameExplicit: isNameExplicit,
				};
			}),
		);

		uniques.push(
			...drizzleUniques.map<UniqueConstraint>((unq) => {
				const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));
				const name = unq.name || uniqueKeyName(table, columnNames);

				return {
					entityType: 'uniques',
					schema: schema,
					table: tableName,
					name,
					nameExplicit: !!unq.name,
					nullsNotDistinct: unq.nullsNotDistinct,
					columns: columnNames,
				} satisfies UniqueConstraint;
			}),
		);

		fks.push(
			...drizzleFKs.map<ForeignKey>((fk) => {
				const onDelete = fk.onDelete;
				const onUpdate = fk.onUpdate;
				const reference = fk.reference();

				const tableTo = getTableName(reference.foreignTable);

				// TODO: resolve issue with schema undefined/public for db push(or squasher)
				// getTableConfig(reference.foreignTable).schema || "public";

				const schemaTo = getTableConfig(reference.foreignTable).schema || 'public';

				const originalColumnsFrom = reference.columns.map((it) => it.name);
				const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
				const originalColumnsTo = reference.foreignColumns.map((it) => it.name);
				const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

				// TODO: compose name with casing here, instead of fk.getname? we have fk.reference.columns, etc.
				let name = fk.reference.name || fk.getName();
				const nameExplicit = !!fk.reference.name;

				if (casing !== undefined && !nameExplicit) {
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
					table: tableName,
					name,
					nameExplicit,
					tableTo,
					schemaTo,
					columns: columnsFrom,
					columnsTo,
					onDelete: onDelete ? transformOnUpdateDelete(onDelete) : null,
					onUpdate: onUpdate ? transformOnUpdateDelete(onUpdate) : null,
				} satisfies ForeignKey;
			}),
		);

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

				if (
					is(column, IndexedColumn)
					&& column.type === 'PgVector'
					&& !column.indexConfig.opClass
				) {
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

		indexes.push(
			...drizzleIndexes.map<Index>((value) => {
				const columns = value.config.columns;

				let indexColumnNames = columns.map((it) => {
					const name = getColumnCasing(it as IndexedColumn, casing);
					return name;
				});

				const name = value.config.name
					? value.config.name
					: indexName(tableName, indexColumnNames);
				const nameExplicit = !!value.config.name;

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

				const withOpt = Object.entries(value.config.with || {})
					.map((it) => `${it[0]}=${it[1]}`)
					.join(', ');

				let where = value.config.where ? dialect.sqlToQuery(value.config.where).sql : '';
				where = where === 'true' ? '' : where;

				return {
					entityType: 'indexes',
					schema,
					table: tableName,
					name,
					nameExplicit,
					columns: indexColumns,
					isUnique: value.config.unique,
					where: where ? where : null,
					concurrently: value.config.concurrently ?? false,
					method: value.config.method ?? 'btree',
					with: withOpt,
					isPrimary: false,
				} satisfies Index;
			}),
		);

		policies.push(
			...drizzlePolicies.map<Policy>((policy) => {
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
			}),
		);

		checks.push(
			...drizzleChecks.map<CheckConstraint>((check) => {
				const checkName = check.name;
				return {
					entityType: 'checks',
					schema,
					table: tableName,
					name: checkName,
					value: dialect.sqlToQuery(check.value).sql,
				};
			}),
		);
	}

	for (const policy of drizzlePolicies) {
		if (
			!('_linkedTable' in policy)
			|| typeof policy._linkedTable === 'undefined'
		) {
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
		const cache = Number(stringFromIdentityProperty(sequence.seqOptions?.cache) ?? 1);
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
		if (is(it, GelView)) {
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

		type MergerWithConfig = keyof (
			& ViewWithConfig
			& GelMaterializedViewWithConfig
		);
		const opt = view.with as
			| {
				[K in MergerWithConfig]: (
					& ViewWithConfig
					& GelMaterializedViewWithConfig
				)[K];
			}
			| null;

		const withOpt = opt
			? {
				checkOption: getOrNull(opt, 'checkOption'),
				securityBarrier: getOrNull(opt, 'securityBarrier'),
				securityInvoker: getOrNull(opt, 'securityInvoker'),
				autovacuumEnabled: getOrNull(opt, 'autovacuumEnabled'),
				autovacuumFreezeMaxAge: getOrNull(opt, 'autovacuumFreezeMaxAge'),
				autovacuumFreezeMinAge: getOrNull(opt, 'autovacuumFreezeMinAge'),
				autovacuumFreezeTableAge: getOrNull(
					opt,
					'autovacuumFreezeTableAge',
				),
				autovacuumMultixactFreezeMaxAge: getOrNull(
					opt,
					'autovacuumMultixactFreezeMaxAge',
				),
				autovacuumMultixactFreezeMinAge: getOrNull(
					opt,
					'autovacuumMultixactFreezeMinAge',
				),
				autovacuumMultixactFreezeTableAge: getOrNull(
					opt,
					'autovacuumMultixactFreezeTableAge',
				),
				autovacuumVacuumCostDelay: getOrNull(
					opt,
					'autovacuumVacuumCostDelay',
				),
				autovacuumVacuumCostLimit: getOrNull(
					opt,
					'autovacuumVacuumCostLimit',
				),
				autovacuumVacuumScaleFactor: getOrNull(
					opt,
					'autovacuumVacuumScaleFactor',
				),
				autovacuumVacuumThreshold: getOrNull(
					opt,
					'autovacuumVacuumThreshold',
				),
				fillfactor: getOrNull(opt, 'fillfactor'),
				logAutovacuumMinDuration: getOrNull(
					opt,
					'logAutovacuumMinDuration',
				),
				parallelWorkers: getOrNull(opt, 'parallelWorkers'),
				toastTupleTarget: getOrNull(opt, 'toastTupleTarget'),
				userCatalogTable: getOrNull(opt, 'userCatalogTable'),
				vacuumIndexCleanup: getOrNull(opt, 'vacuumIndexCleanup'),
				vacuumTruncate: getOrNull(opt, 'vacuumTruncate'),
			}
			: null;

		const hasNonNullOpts = Object.values(withOpt ?? {}).filter((x) => x !== null).length > 0;

		views.push({
			entityType: 'views',
			definition: isExisting ? null : dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
			isExisting,
			with: hasNonNullOpts ? withOpt : null,
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
			viewColumns: [],
		},
		errors,
		warnings,
	};
};
