import { getTableName, is, SQL } from 'drizzle-orm';
import { Relations } from 'drizzle-orm/_relations';
import type {
	AnyCockroachColumn,
	AnyCockroachTable,
	CockroachEnum,
	CockroachMaterializedView,
	CockroachSequence,
	UpdateDeleteAction,
} from 'drizzle-orm/cockroach-core';
import {
	CockroachArray,
	CockroachDialect,
	CockroachEnumColumn,
	CockroachGeometry,
	CockroachGeometryObject,
	CockroachPolicy,
	CockroachRole,
	CockroachSchema,
	CockroachTable,
	CockroachView,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	isCockroachEnum,
	isCockroachMaterializedView,
	isCockroachSequence,
	isCockroachView,
} from 'drizzle-orm/cockroach-core';
import type { CasingType } from 'src/cli/validations/common';
import { safeRegister } from 'src/utils/utils-node';
import { assertUnreachable } from '../../utils';
import { getColumnCasing } from '../drizzle';
import type { EntityFilter } from '../pull-utils';
import type {
	CheckConstraint,
	CockroachEntities,
	Column,
	Enum,
	ForeignKey,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PrimaryKey,
	Schema,
	SchemaError,
	SchemaWarning,
} from './ddl';
import {
	defaultNameForFK,
	defaultNameForPK,
	defaultNameForUnique,
	defaults,
	GeometryPoint,
	indexName,
	maxRangeForIdentityBasedOn,
	minRangeForIdentityBasedOn,
	splitSqlType,
	stringFromIdentityProperty,
	trimDefaultValueSuffix,
	typeFor,
} from './grammar';

export const policyFrom = (policy: CockroachPolicy, dialect: CockroachDialect) => {
	const mappedTo = !policy.to
		? ['public']
		: typeof policy.to === 'string'
		? [policy.to]
		: is(policy.to, CockroachRole)
		? [(policy.to as CockroachRole).name]
		: Array.isArray(policy.to)
		? policy.to.map((it) => {
			if (typeof it === 'string') {
				return it;
			} else if (is(it, CockroachRole)) {
				return it.name;
			}
			return '' as never; // unreachable unless error in types
		})
		: ('' as never); // unreachable unless error in types

	const policyAs = (policy.as?.toUpperCase() as Policy['as']) ?? 'PERMISSIVE';
	const policyFor = (policy.for?.toUpperCase() as Policy['for']) ?? 'ALL';
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

export const unwrapColumn = (column: AnyCockroachColumn) => {
	const { baseColumn, dimensions } = is(column, CockroachArray)
		? unwrapArray(column)
		: { baseColumn: column, dimensions: 0 };

	const isEnum = is(baseColumn, CockroachEnumColumn);
	const typeSchema = isEnum ? baseColumn.enum.schema || 'public' : null;

	/* TODO: legacy, for not to patch orm and don't up snapshot */
	let sqlBaseType = baseColumn.getSQLType();
	sqlBaseType = sqlBaseType.startsWith('timestamp (') ? sqlBaseType.replace('timestamp (', 'timestamp(') : sqlBaseType;

	const { type, options } = splitSqlType(sqlBaseType);
	const sqlType = dimensions > 0 ? `${sqlBaseType}${'[]'.repeat(dimensions)}` : sqlBaseType;

	return {
		baseColumn,
		dimensions,
		isEnum,
		typeSchema,
		sqlType,
		baseType: type,
		options,
	};
};

export const unwrapArray = (
	column: CockroachArray<any, any>,
	dimensions: number = 1,
): { baseColumn: AnyCockroachColumn; dimensions: number } => {
	const baseColumn = column.baseColumn;
	if (is(baseColumn, CockroachArray)) return unwrapArray(baseColumn, dimensions + 1);

	return { baseColumn, dimensions };
};

export const transformOnUpdateDelete = (on: UpdateDeleteAction): ForeignKey['onUpdate'] => {
	if (on === 'no action') return 'NO ACTION';
	if (on === 'cascade') return 'CASCADE';
	if (on === 'restrict') return 'RESTRICT';
	if (on === 'set default') return 'SET DEFAULT';
	if (on === 'set null') return 'SET NULL';

	assertUnreachable(on);
};

export const defaultFromColumn = (
	base: AnyCockroachColumn,
	def: unknown,
	dimensions: number,
	dialect: CockroachDialect,
): Column['default'] => {
	if (typeof def === 'undefined') return null;

	if (is(def, SQL)) {
		let sql = dialect.sqlToQuery(def).sql;
		sql = trimDefaultValueSuffix(sql);

		// TODO: check if needed

		// const isText = /^'(?:[^']|'')*'$/.test(sql);
		// sql = isText ? trimChar(sql, "'") : sql;

		return sql;
	}
	const { baseColumn, isEnum } = unwrapColumn(base);
	const grammarType = typeFor(base.getSQLType(), isEnum);

	if (is(baseColumn, CockroachGeometry) || is(baseColumn, CockroachGeometryObject)) {
		return (dimensions > 0 && Array.isArray(def))
			? def.flat(5).length === 0
				? "'{}'"
				: GeometryPoint.defaultArrayFromDrizzle(def, baseColumn.mode, baseColumn.srid)
			: GeometryPoint.defaultFromDrizzle(def, baseColumn.mode, baseColumn.srid);
	}

	if (grammarType) {
		if (dimensions > 0 && Array.isArray(def)) {
			if (def.flat(5).length === 0) return "'{}'";

			return grammarType.defaultArrayFromDrizzle(def);
		}

		return grammarType.defaultFromDrizzle(def);
	}

	throw new Error(`Unhandled type: ${base.getSQLType()}`);
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
	schema: {
		schemas: CockroachSchema[];
		tables: AnyCockroachTable[];
		enums: CockroachEnum<any>[];
		sequences: CockroachSequence[];
		roles: CockroachRole[];
		policies: CockroachPolicy[];
		views: CockroachView[];
		matViews: CockroachMaterializedView[];
	},
	casing: CasingType | undefined,
	filter: EntityFilter,
): {
	schema: InterimSchema;
	errors: SchemaError[];
	warnings: SchemaWarning[];
} => {
	const dialect = new CockroachDialect({ casing });
	const errors: SchemaError[] = [];
	const warnings: SchemaWarning[] = [];

	const res: InterimSchema = {
		indexes: [],
		pks: [],
		fks: [],
		checks: [],
		columns: [],
		policies: [],
		enums: [],
		roles: [],
		schemas: [],
		sequences: [],
		tables: [],
		viewColumns: [],
		views: [],
	};

	res.schemas = schema.schemas
		.filter((x) => {
			return !x.isExisting && x.schemaName !== 'public' && filter({ type: 'schema', name: x.schemaName });
		})
		.map<Schema>((it) => ({
			entityType: 'schemas',
			name: it.schemaName,
		}));

	const tableConfigPairs = schema.tables.map((it) => {
		return { config: getTableConfig(it), table: it };
	}).filter((it) => {
		return filter({ type: 'table', schema: it.config.schema ?? 'public', name: it.config.name });
	});

	for (const policy of schema.policies) {
		if (!('_linkedTable' in policy) || typeof policy._linkedTable === 'undefined') {
			warnings.push({ type: 'policy_not_linked', policy: policy.name });
			continue;
		}

		// @ts-expect-error
		const { schema: configSchema, name: tableName } = getTableConfig(policy._linkedTable);

		const p = policyFrom(policy, dialect);
		res.policies.push({
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

	res.tables = tableConfigPairs.map((it) => {
		const config = it.config;
		const schema = config.schema ?? 'public';
		const isRlsEnabled = config.enableRLS || config.policies.length > 0
			|| res.policies.some((x) => x.schema === schema && x.table === config.name);

		return {
			entityType: 'tables',
			schema,
			name: config.name,
			isRlsEnabled,
		} satisfies CockroachEntities['tables'];
	});

	for (const { config } of tableConfigPairs) {
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
		} = config;

		const schema = drizzleSchema || 'public';

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

		res.columns.push(
			...drizzleColumns.map<InterimColumn>((column) => {
				const name = getColumnCasing(column, casing);
				const notNull = column.notNull;

				const generated = column.generated;
				const identity = column.generatedIdentity;

				const increment = stringFromIdentityProperty(identity?.sequenceOptions?.increment) ?? '1';
				const minValue = stringFromIdentityProperty(identity?.sequenceOptions?.minValue)
					?? (parseFloat(increment) < 0 ? minRangeForIdentityBasedOn(column.columnType) : '1');
				const maxValue = stringFromIdentityProperty(identity?.sequenceOptions?.maxValue)
					?? (parseFloat(increment) < 0 ? '-1' : maxRangeForIdentityBasedOn(column.getSQLType()));
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
						increment,
						startWith,
						minValue,
						maxValue,
						cache,
					}
					: null;

				const { dimensions, sqlType, typeSchema, baseColumn } = unwrapColumn(column);

				const columnDefault = defaultFromColumn(baseColumn, column.default, dimensions, dialect);

				const isPk = column.primary
					|| config.primaryKeys.find((pk) =>
							pk.columns.some((col) => col.name ? col.name === column.name : col.keyAsName === column.keyAsName)
						) !== undefined;

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
					notNull: notNull || isPk,
					default: columnDefault,
					generated: generatedValue,
					unique: column.isUnique,
					uniqueName: column.uniqueName ?? null,
					identity: identityValue,
				} satisfies InterimColumn;
			}),
		);

		res.fks.push(
			...drizzleFKs.map<ForeignKey>((fk) => {
				const onDelete = fk.onDelete;
				const onUpdate = fk.onUpdate;
				const reference = fk.reference();

				const tableTo = getTableName(reference.foreignTable);

				const schemaTo = getTableConfig(reference.foreignTable).schema || 'public';
				const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
				const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

				const name = fk.getName() || defaultNameForFK(tableName, columnsFrom, tableTo, columnsTo);

				return {
					entityType: 'fks',
					schema: schema,
					table: tableName,
					name,
					nameExplicit: fk.isNameExplicit(),
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
				if (is(column, IndexedColumn) && column.type !== 'CockroachVector') continue;

				if (is(column, SQL) && !index.isNameExplicit) {
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

		for (const unique of drizzleUniques) {
			const columns: InterimIndex['columns'] = unique.columns.map((c) => {
				if (is(c, SQL)) {
					const sql = dialect.sqlToQuery(c).sql;
					return { value: sql, isExpression: true, asc: true };
				}
				return { value: getColumnCasing(c, casing), isExpression: false, asc: true };
			});

			const name = unique.name
				?? defaultNameForUnique(tableName, ...unique.columns.filter((c) => !is(c, SQL)).map((c) => c.name));

			res.indexes.push({
				entityType: 'indexes',
				columns: columns,
				forPK: false,
				isUnique: true,
				method: defaults.index.method,
				nameExplicit: unique.isNameExplicit,
				name: name,
				schema: schema,
				table: tableName,
				where: null,
			});
		}

		res.indexes.push(
			...drizzleIndexes.map<InterimIndex>((value) => {
				const columns = value.config.columns;

				let indexColumnNames = columns.map((it) => {
					const name = getColumnCasing(it as IndexedColumn, casing);
					return name;
				});

				const name = value.config.name
					?? (value.config.unique
						? defaultNameForUnique(tableName, ...indexColumnNames)
						: indexName(tableName, indexColumnNames));
				const nameExplicit = value.isNameExplicit;

				let indexColumns = columns.map((it) => {
					if (is(it, SQL)) {
						return {
							value: dialect.sqlToQuery(it, 'indexes').sql,
							isExpression: true,
							asc: true,
						} satisfies Index['columns'][number];
					} else {
						it = it as IndexedColumn;

						const asc = it.indexConfig?.order ? it.indexConfig.order === 'asc' : true;
						return {
							value: getColumnCasing(it as IndexedColumn, casing),
							isExpression: false,
							asc: asc,
						} satisfies Index['columns'][number];
					}
				});

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
					method: value.config.method ?? defaults.index.method,
					forPK: false,
				} satisfies InterimIndex;
			}),
		);

		res.policies.push(
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

		res.checks.push(
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

	for (const sequence of schema.sequences) {
		const name = sequence.seqName!;
		const increment = stringFromIdentityProperty(sequence.seqOptions?.increment) ?? '1';
		const minValue = stringFromIdentityProperty(sequence.seqOptions?.minValue)
			?? (parseFloat(increment) < 0 ? '-9223372036854775808' : '1');
		const maxValue = stringFromIdentityProperty(sequence.seqOptions?.maxValue)
			?? (parseFloat(increment) < 0 ? '-1' : '9223372036854775807');
		const startWith = stringFromIdentityProperty(sequence.seqOptions?.startWith)
			?? (parseFloat(increment) < 0 ? maxValue : minValue);
		const cache = Number(stringFromIdentityProperty(sequence.seqOptions?.cache) ?? 1);
		res.sequences.push({
			entityType: 'sequences',
			schema: sequence.schema ?? 'public',
			incrementBy: increment,
			startWith,
			name,
			minValue,
			maxValue,
			cacheSize: cache,
		});
	}

	for (const _role of schema.roles) {
		const role = _role as any;
		if (role._existing) continue;

		res.roles.push({
			entityType: 'roles',
			name: role.name,
			createDb: role.createDb ?? false,
			createRole: role.createRole ?? false,
		});
	}

	const combinedViews = [...schema.views, ...schema.matViews].map((it) => {
		if (is(it, CockroachView)) {
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
		if (view.isExisting) continue;
		if (!filter({ type: 'table', schema: view.schema ?? 'public', name: view.name })) continue;

		const { name: viewName, schema, query, withNoData, materialized } = view;

		const viewSchema = schema ?? 'public';

		res.views.push({
			entityType: 'views',
			definition: dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
			withNoData: withNoData ?? null,
			materialized,
		});
	}

	res.enums = schema.enums.map<Enum>((e) => {
		return {
			entityType: 'enums',
			name: e.enumName,
			schema: e.schema || 'public',
			values: e.enumValues,
		};
	});

	return {
		schema: res,
		errors,
		warnings,
	};
};

export const fromExports = (exports: Record<string, unknown>) => {
	const tables: AnyCockroachTable[] = [];
	const enums: CockroachEnum<any>[] = [];
	const schemas: CockroachSchema[] = [];
	const sequences: CockroachSequence[] = [];
	const roles: CockroachRole[] = [];
	const policies: CockroachPolicy[] = [];
	const views: CockroachView[] = [];
	const matViews: CockroachMaterializedView[] = [];
	const relations: Relations[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (isCockroachEnum(t)) {
			enums.push(t);
			return;
		}
		if (is(t, CockroachTable)) {
			tables.push(t);
		}

		if (is(t, CockroachSchema)) {
			schemas.push(t);
		}

		if (isCockroachView(t)) {
			views.push(t);
		}

		if (isCockroachMaterializedView(t)) {
			matViews.push(t);
		}

		if (isCockroachSequence(t)) {
			sequences.push(t);
		}

		if (is(t, CockroachRole)) {
			roles.push(t);
		}

		if (is(t, CockroachPolicy)) {
			policies.push(t);
		}

		if (is(t, Relations)) {
			relations.push(t);
		}
	});

	return {
		tables,
		enums,
		schemas,
		sequences,
		views,
		matViews,
		roles,
		policies,
		relations,
	};
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnyCockroachTable[] = [];
	const enums: CockroachEnum<any>[] = [];
	const schemas: CockroachSchema[] = [];
	const sequences: CockroachSequence[] = [];
	const views: CockroachView[] = [];
	const roles: CockroachRole[] = [];
	const policies: CockroachPolicy[] = [];
	const matViews: CockroachMaterializedView[] = [];
	const relations: Relations[] = [];

	await safeRegister(async () => {
		for (let i = 0; i < imports.length; i++) {
			const it = imports[i];

			const i0: Record<string, unknown> = require(`${it}`);
			const prepared = fromExports(i0);

			tables.push(...prepared.tables);
			enums.push(...prepared.enums);
			schemas.push(...prepared.schemas);
			sequences.push(...prepared.sequences);
			views.push(...prepared.views);
			matViews.push(...prepared.matViews);
			roles.push(...prepared.roles);
			policies.push(...prepared.policies);
			relations.push(...prepared.relations);
		}
	});

	return {
		tables,
		enums,
		schemas,
		sequences,
		views,
		matViews,
		roles,
		policies,
		relations,
	};
};
