import { getTableName, is, SQL } from 'drizzle-orm';
import { AnyGelColumn, GelDialect, GelPolicy } from 'drizzle-orm/gel-core';
import {
	AnyPgColumn,
	AnyPgTable,
	getMaterializedViewConfig,
	getTableConfig,
	getViewConfig,
	IndexedColumn,
	isPgEnum,
	isPgMaterializedView,
	isPgSequence,
	isPgView,
	PgArray,
	PgDialect,
	PgEnum,
	PgEnumColumn,
	PgLineABC,
	PgLineTuple,
	PgMaterializedView,
	PgMaterializedViewWithConfig,
	PgPointObject,
	PgPointTuple,
	PgPolicy,
	PgRole,
	PgSchema,
	PgSequence,
	PgTable,
	PgView,
	uniqueKeyName,
	UpdateDeleteAction,
	ViewWithConfig,
} from 'drizzle-orm/pg-core';
import { CasingType } from 'src/cli/validations/common';
import { safeRegister } from 'src/utils/utils-node';
import { assertUnreachable, stringifyArray, stringifyTuplesArray } from '../../utils';
import { getColumnCasing } from '../drizzle';
import { getOrNull } from '../utils';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	InterimColumn,
	InterimIndex,
	InterimSchema,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Schema,
	SchemaError,
	SchemaWarning,
	UniqueConstraint,
} from './ddl';
import {
	buildArrayString,
	defaultNameForFK,
	defaultNameForPK,
	indexName,
	maxRangeForIdentityBasedOn,
	minRangeForIdentityBasedOn,
	splitSqlType,
	stringFromIdentityProperty,
	trimChar,
} from './grammar';

export const policyFrom = (policy: PgPolicy | GelPolicy, dialect: PgDialect | GelDialect) => {
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
		: ('' as never); // unreachable unless error in types

	const policyAs = (policy.as?.toUpperCase() as Policy['as']) ?? 'PERMISSIVE';
	const policyFor = (policy.for?.toUpperCase() as Policy['for']) ?? 'ALL';
	const policyTo = mappedTo.sort(); // TODO: ??
	const policyUsing = is(policy.using, SQL)
		? dialect.sqlToQuery(policy.using).sql
		: null;
	const withCheck = is(policy.withCheck, SQL)
		? dialect.sqlToQuery(policy.withCheck).sql
		: null;

	return {
		name: policy.name,
		as: policyAs,
		for: policyFor,
		roles: policyTo,
		using: policyUsing,
		withCheck,
	};
};

export const unwrapColumn = (column: AnyPgColumn) => {
	const { baseColumn, dimensions } = is(column, PgArray)
		? unwrapArray(column)
		: { baseColumn: column, dimensions: 0 };

	const isEnum = is(baseColumn, PgEnumColumn);
	const typeSchema = isEnum
		? baseColumn.enum.schema || 'public'
		: null;

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
	column: PgArray<any, any>,
	dimensions: number = 1,
): { baseColumn: AnyPgColumn; dimensions: number } => {
	const baseColumn = column.baseColumn;
	if (is(baseColumn, PgArray)) return unwrapArray(baseColumn, dimensions + 1);

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

type JsonValue = string | number | boolean | null | JsonObject | JsonArray;
type JsonObject = { [key: string]: JsonValue };
type JsonArray = JsonValue[];

type MapperFunction<T = any> = (value: JsonValue, key?: string | number, parent?: JsonObject | JsonArray) => T;

function mapJsonValues<T = any>(
	obj: JsonValue,
	mapper: MapperFunction<T>,
): any {
	function recurse(value: JsonValue, key?: string | number, parent?: JsonObject | JsonArray): any {
		// Apply mapper to current value first
		const mappedValue = mapper(value, key, parent);

		// If the mapped value is an object or array, recurse into it
		if (Array.isArray(mappedValue)) {
			return mappedValue.map((item, index) => recurse(item, index, mappedValue));
		} else if (mappedValue !== null && typeof mappedValue === 'object') {
			const result: any = {};
			for (const [k, v] of Object.entries(mappedValue)) {
				result[k] = recurse(v, k, mappedValue as any);
			}
			return result;
		}

		// Return scalar values as-is
		return mappedValue;
	}

	return recurse(obj);
}

export const defaultFromColumn = (
	base: AnyPgColumn | AnyGelColumn,
	def: unknown,
	dimensions: number,
	dialect: PgDialect | GelDialect,
): Column['default'] => {
	if (typeof def === 'undefined') return null;

	if (is(def, SQL)) {
		let sql = dialect.sqlToQuery(def).sql;

		const isText = /^'(?:[^']|'')*'$/.test(sql);
		sql = isText ? trimChar(sql, "'") : sql;

		return {
			value: sql,
			type: isText ? 'string' : 'unknown',
		};
	}

	if (is(base, PgLineABC)) {
		return {
			value: stringifyArray(def, 'sql', (x: { a: number; b: number; c: number }, depth: number) => {
				const res = `{${x.a},${x.b},${x.c}}`;
				return depth === 0 ? res : `"${res}"`;
			}),
			type: 'string',
		};
	}

	if (is(base, PgLineTuple)) {
		return {
			value: stringifyTuplesArray(def as any, 'sql', (x: number[], depth: number) => {
				const res = x.length > 0 ? `{${x[0]},${x[1]},${x[2]}}` : '{}';
				return depth === 0 ? res : `"${res}"`;
			}),
			type: 'string',
		};
	}

	if (is(base, PgPointTuple)) {
		return {
			value: stringifyTuplesArray(def as any, 'sql', (x: number[], depth: number) => {
				const res = x.length > 0 ? `(${x[0]},${x[1]})` : '{}';
				return depth === 0 ? res : `"${res}"`;
			}),
			type: 'string',
		};
	}

	if (is(base, PgPointObject)) {
		return {
			value: stringifyArray(def, 'sql', (x: { x: number; y: number }, depth: number) => {
				const res = `(${x.x},${x.y})`;
				return depth === 0 ? res : `"${res}"`;
			}),
			type: 'string',
		};
	}

	const sqlTypeLowered = base.getSQLType().toLowerCase();
	if (sqlTypeLowered === 'jsonb' || sqlTypeLowered === 'json') {
		const value = dimensions > 0 && Array.isArray(def) ? buildArrayString(def, sqlTypeLowered) : JSON.stringify(def);
		return {
			value: value,
			type: 'json',
		};
	}

	if (typeof def === 'string') {
		const value = dimensions > 0 && Array.isArray(def)
			? buildArrayString(def, sqlTypeLowered)
			: def.replaceAll("'", "''");
		return {
			value: value,
			type: 'string',
		};
	}

	if (typeof def === 'boolean') {
		const value = dimensions > 0 && Array.isArray(def)
			? buildArrayString(def, sqlTypeLowered)
			: (def ? 'true' : 'false');
		return {
			value: value,
			type: 'boolean',
		};
	}

	if (typeof def === 'number') {
		const value = dimensions > 0 && Array.isArray(def) ? buildArrayString(def, sqlTypeLowered) : String(def);
		return {
			value: value,
			type: 'number',
		};
	}

	if (def instanceof Date) {
		if (sqlTypeLowered === 'date') {
			const value = dimensions > 0 && Array.isArray(def)
				? buildArrayString(def, sqlTypeLowered)
				: def.toISOString().split('T')[0];
			return {
				value: value,
				type: 'string',
			};
		}
		if (sqlTypeLowered === 'timestamp') {
			const value = dimensions > 0 && Array.isArray(def)
				? buildArrayString(def, sqlTypeLowered)
				: def.toISOString().replace('T', ' ').replace('Z', ' ').slice(0, 23);
			return {
				value: value,
				type: 'string',
			};
		}
		const value = dimensions > 0 && Array.isArray(def)
			? buildArrayString(def, sqlTypeLowered)
			: def.toISOString().replace('T', ' ').replace('Z', '');
		return {
			value: value,
			type: 'string',
		};
	}

	const value = dimensions > 0 && Array.isArray(def)
		? buildArrayString(def, sqlTypeLowered)
		: String(def);
	return {
		value: value,
		type: 'string',
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
	schema: {
		schemas: PgSchema[];
		tables: AnyPgTable[];
		enums: PgEnum<any>[];
		sequences: PgSequence[];
		roles: PgRole[];
		policies: PgPolicy[];
		views: PgView[];
		matViews: PgMaterializedView[];
	},
	casing: CasingType | undefined,
	schemaFilter?: string[],
): {
	schema: InterimSchema;
	errors: SchemaError[];
	warnings: SchemaWarning[];
} => {
	const dialect = new PgDialect({ casing });
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
		schemas: [],
		sequences: [],
		tables: [],
		viewColumns: [],
		views: [],
	};

	res.schemas = schema.schemas
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

	const tableConfigPairs = schema.tables.map((it) => {
		return { config: getTableConfig(it), table: it };
	});

	for (const policy of schema.policies) {
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
		} satisfies PostgresEntities['tables'];
	});

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

		res.columns.push(
			...drizzleColumns.map<InterimColumn>((column) => {
				const name = getColumnCasing(column, casing);
				const notNull = column.notNull;

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

				const { baseColumn, dimensions, sqlType, baseType, options, typeSchema } = unwrapColumn(column);
				const columnDefault = defaultFromColumn(baseColumn, column.default, dimensions, dialect);
				return {
					entityType: 'columns',
					schema: schema,
					table: tableName,
					name,
					type: baseType,
					options,
					typeSchema: typeSchema ?? null,
					dimensions: dimensions,
					pk: column.primary,
					pkName: null,
					notNull: notNull,
					default: columnDefault,
					generated: generatedValue,
					unique: column.isUnique,
					uniqueName: column.uniqueNameExplicit ? column.uniqueName ?? null : null,
					uniqueNullsNotDistinct: column.uniqueType === 'not distinct',
					identity: identityValue,
				} satisfies InterimColumn;
			}),
		);

		res.pks.push(
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

		res.uniques.push(
			...drizzleUniques.map<UniqueConstraint>((unq) => {
				const columnNames = unq.columns.map((c) => getColumnCasing(c, casing));
				const name = unq.name || uniqueKeyName(table, columnNames);
				return {
					entityType: 'uniques',
					schema: schema,
					table: tableName,
					name,
					nameExplicit: !!unq.isNameExplicit(),
					nullsNotDistinct: unq.nullsNotDistinct,
					columns: columnNames,
				} satisfies UniqueConstraint;
			}),
		);

		res.fks.push(
			...drizzleFKs.map<ForeignKey>((fk) => {
				const onDelete = fk.onDelete;
				const onUpdate = fk.onUpdate;
				const reference = fk.reference();

				const tableTo = getTableName(reference.foreignTable);

				// TODO: resolve issue with schema undefined/public for db push(or squasher)
				// getTableConfig(reference.foreignTable).schema || "public";

				const schemaTo = getTableConfig(reference.foreignTable).schema || 'public';
				const columnsFrom = reference.columns.map((it) => getColumnCasing(it, casing));
				const columnsTo = reference.foreignColumns.map((it) => getColumnCasing(it, casing));

				const name = fk.isNameExplicit() ? fk.getName() : defaultNameForFK(tableName, columnsFrom, tableTo, columnsTo);

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

		res.indexes.push(
			...drizzleIndexes.map<InterimIndex>((value) => {
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
					forPK: false,
					forUnique: false,
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

	for (const _role of schema.roles) {
		const role = _role as any;
		if (role._existing) continue;

		res.roles.push({
			entityType: 'roles',
			name: role.name,
			createDb: role.createDb ?? false,
			createRole: role.createRole ?? false,
			inherit: role.inherit ?? true,
		});
	}

	const combinedViews = [...schema.views, ...schema.matViews].map((it) => {
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
		if (view.isExisting) continue;

		const {
			name: viewName,
			schema,
			query,
			tablespace,
			using,
			withNoData,
			materialized,
		} = view;

		const viewSchema = schema ?? 'public';

		type MergerWithConfig = keyof (
			& ViewWithConfig
			& PgMaterializedViewWithConfig
		);
		const opt = view.with as
			| {
				[K in MergerWithConfig]: (
					& ViewWithConfig
					& PgMaterializedViewWithConfig
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

		res.views.push({
			entityType: 'views',
			definition: dialect.sqlToQuery(query!).sql,
			name: viewName,
			schema: viewSchema,
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
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const roles: PgRole[] = [];
	const policies: PgPolicy[] = [];
	const views: PgView[] = [];
	const matViews: PgMaterializedView[] = [];

	const i0values = Object.values(exports);
	i0values.forEach((t) => {
		if (isPgEnum(t)) {
			enums.push(t);
			return;
		}
		if (is(t, PgTable)) {
			tables.push(t);
		}

		if (is(t, PgSchema)) {
			schemas.push(t);
		}

		if (isPgView(t)) {
			views.push(t);
		}

		if (isPgMaterializedView(t)) {
			matViews.push(t);
		}

		if (isPgSequence(t)) {
			sequences.push(t);
		}

		if (is(t, PgRole)) {
			roles.push(t);
		}

		if (is(t, PgPolicy)) {
			policies.push(t);
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
	};
};

export const prepareFromSchemaFiles = async (imports: string[]) => {
	const tables: AnyPgTable[] = [];
	const enums: PgEnum<any>[] = [];
	const schemas: PgSchema[] = [];
	const sequences: PgSequence[] = [];
	const views: PgView[] = [];
	const roles: PgRole[] = [];
	const policies: PgPolicy[] = [];
	const matViews: PgMaterializedView[] = [];

	const { unregister } = await safeRegister();
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
	}
	unregister();

	return {
		tables,
		enums,
		schemas,
		sequences,
		views,
		matViews,
		roles,
		policies,
	};
};
