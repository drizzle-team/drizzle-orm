import { createDDL, type Index } from '../../dialects/postgres/ddl';
import {
	defaultNameForIndex,
	defaultNameForPK,
	defaultNameForUnique,
	defaults,
	trimDefaultValueSuffix,
} from '../../dialects/postgres/grammar';
import type {
	Column,
	Index as LegacyIndex,
	PgSchema,
	PgSchemaV4,
	PgSchemaV5,
	PgSchemaV6,
	PgSchemaV7,
	PostgresSnapshot,
	TableV5,
} from '../../dialects/postgres/snapshot';
import { getOrNull } from '../../dialects/utils';

export const upToV8 = (
	it: Record<string, any>,
): { snapshot: PostgresSnapshot; hints: string[] } => {
	if (Number(it.version) < 7) return upToV8(updateUpToV7(it));
	const json = it as PgSchemaV7;

	const hints = [] as string[];

	const ddl = createDDL();

	for (const schema of Object.values(json.schemas)) {
		ddl.schemas.push({ name: schema });
	}

	if (json.sequences) {
		for (const seq of Object.values(json.sequences)) {
			ddl.sequences.push({
				schema: seq.schema!,
				name: seq.name,
				startWith: seq.startWith ?? null,
				incrementBy: seq.increment ?? null,
				minValue: seq.minValue ?? null,
				maxValue: seq.maxValue ?? null,
				cacheSize: seq.cache ? Number(seq.cache) : null,
				cycle: seq.cycle ?? null,
			});
		}
	}

	for (const table of Object.values(json.tables)) {
		const schema = table.schema || 'public';

		const isRlsEnabled = table.isRLSEnabled
			|| Object.keys(table.policies).length > 0
			|| Object.values(json.policies).some(
				(it) => it.on === table.name && (it.schema ?? 'public') === schema,
			);

		ddl.tables.push({
			schema,
			name: table.name,
			isRlsEnabled: isRlsEnabled,
		});

		for (const column of Object.values(table.columns)) {
			if (column.primaryKey) {
				ddl.pks.push({
					schema,
					table: table.name,
					columns: [column.name],
					name: defaultNameForPK(table.name),
					nameExplicit: false,
				});
			}

			const [baseType, dimensions] = extractBaseTypeAndDimensions(column.type);

			let fixedType = baseType.startsWith('numeric(')
				? baseType.replace(', ', ',')
				: baseType;

			ddl.columns.push({
				schema,
				table: table.name,
				name: column.name,
				type: fixedType,
				notNull: column.notNull,
				typeSchema: column.typeSchema ?? null, // TODO: if public - empty or missing?
				dimensions,
				generated: column.generated ?? null,
				identity: column.identity
					? {
						name: column.identity.name,
						type: column.identity.type,
						startWith: column.identity.startWith ?? null,
						minValue: column.identity.minValue ?? null,
						maxValue: column.identity.maxValue ?? null,
						increment: column.identity.increment ?? null,
						cache: column.identity.cache
							? Number(column.identity.cache)
							: null,
						cycle: column.identity.cycle ?? null,
					}
					: null,
				default: typeof column.default === 'undefined'
					? null
					: trimDefaultValueSuffix(String(column.default)),
			});
		}

		if (table.compositePrimaryKeys) {
			for (const pk of Object.values(table.compositePrimaryKeys)) {
				const nameExplicit = `${table.name}_${pk.columns.join('_')}_pk` !== pk.name;
				if (!nameExplicit) {
					hints.push(
						`update pk name: ${pk.name} -> ${defaultNameForPK(table.name)}`,
					);
				}
				ddl.pks.push({
					schema: schema,
					table: table.name,
					name: pk.name,
					columns: pk.columns,
					nameExplicit, // TODO: ??
				});
			}
		}

		if (table.uniqueConstraints) {
			for (const unique of Object.values(table.uniqueConstraints)) {
				const nameExplicit = `${table.name}_${unique.columns.join('_')}_unique` !== unique.name;
				if (!nameExplicit) {
					hints.push(
						`update unique name: ${unique.name} -> ${defaultNameForUnique(table.name, ...unique.columns)}`,
					);
				}

				ddl.uniques.push({
					schema,
					table: table.name,
					columns: unique.columns,
					name: unique.name,
					nameExplicit: nameExplicit,
					nullsNotDistinct: unique.nullsNotDistinct ?? defaults.nullsNotDistinct,
				});
			}
		}

		for (const check of Object.values(table.checkConstraints)) {
			ddl.checks.push({
				schema,
				table: table.name,
				name: check.name,
				value: check.value,
			});
		}

		for (const idx of Object.values(table.indexes)) {
			const columns: Index['columns'][number][] = idx.columns.map<
				Index['columns'][number]
			>((it) => {
				return {
					value: it.expression,
					isExpression: it.isExpression,
					asc: it.asc,
					nullsFirst: it.nulls ? it.nulls !== 'last' : false,
					opclass: it.opclass
						? {
							name: it.opclass,
							default: false,
						}
						: null,
				};
			});

			const nameExplicit = columns.some((it) => it.isExpression === true)
				|| `${table.name}_${columns.map((it) => it.value).join('_')}_index`
					!== idx.name;

			if (!nameExplicit) {
				hints.push(
					`rename index name: ${idx.name} -> ${
						defaultNameForIndex(
							table.name,
							idx.columns.map((x) => x.expression),
						)
					}`,
				);
			}

			ddl.indexes.push({
				schema,
				table: table.name,
				name: idx.name,
				columns,
				isUnique: idx.isUnique,
				method: idx.method,
				concurrently: idx.concurrently,
				where: idx.where ?? null,
				with: idx.with && Object.keys(idx.with).length > 0
					? Object.entries(idx.with)
						.map((it) => `${it[0]}=${it[1]}`)
						.join(',')
					: '',
				nameExplicit,
			});
		}

		for (const fk of Object.values(table.foreignKeys)) {
			const nameExplicit = `${fk.tableFrom}_${fk.columnsFrom.join('_')}_${fk.tableTo}_${fk.columnsTo.join('_')}_fk`
				!== fk.name;
			const name = fk.name.length < 63 ? fk.name : fk.name.slice(0, 63);
			ddl.fks.push({
				schema,
				name,
				nameExplicit,
				table: fk.tableFrom,
				columns: fk.columnsFrom,
				schemaTo: fk.schemaTo || 'public',
				tableTo: fk.tableTo,
				columnsTo: fk.columnsTo,
				onDelete: (fk.onDelete?.toUpperCase() as any) ?? 'NO ACTION',
				onUpdate: (fk.onUpdate?.toUpperCase() as any) ?? 'NO ACTION',
			});
		}

		for (const policy of Object.values(table.policies)) {
			ddl.policies.push({
				schema,
				table: table.name,
				name: policy.name,
				as: policy.as ?? 'PERMISSIVE',
				for: policy.for ?? 'ALL',
				roles: policy.to ?? [],
				using: policy.using ?? null,
				withCheck: policy.withCheck ?? null,
			});
		}
	}

	for (const en of Object.values(json.enums)) {
		ddl.enums.push({ schema: en.schema, name: en.name, values: en.values });
	}

	for (const role of Object.values(json.roles)) {
		ddl.roles.push({
			name: role.name,
			createRole: role.createRole,
			createDb: role.createDb,
			inherit: role.inherit,
			bypassRls: null,
			canLogin: null,
			connLimit: null,
			password: null,
			replication: null,
			superuser: null,
			validUntil: null,
		});
	}

	for (const policy of Object.values(json.policies)) {
		ddl.policies.push({
			schema: policy.schema ?? 'public',
			table: policy.on!,
			name: policy.name,
			as: policy.as ?? 'PERMISSIVE',
			roles: policy.to ?? [],
			for: policy.for ?? 'ALL',
			using: policy.using ?? null,
			withCheck: policy.withCheck ?? null,
		});
	}

	for (const v of Object.values(json.views)) {
		if (v.isExisting) continue;

		const opt = v.with;
		ddl.views.push({
			schema: v.schema,
			name: v.name,
			definition: v.definition ?? null,
			tablespace: v.tablespace ?? null,
			withNoData: v.withNoData ?? null,
			using: v.using ?? null,
			with: opt
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
				: null,
			materialized: v.materialized,
		});
	}

	const renames = [
		...Object.entries(json._meta.tables).map(([k, v]) => `${v}->${k}`),
		...Object.entries(json._meta.schemas).map(([k, v]) => `${v}->${k}`),
		...Object.entries(json._meta.columns).map(([k, v]) => `${v}->${k}`),
	];

	return {
		snapshot: {
			id: json.id,
			prevIds: [json.prevId],
			version: '8',
			dialect: 'postgres',
			ddl: ddl.entities.list(),
			renames,
		},
		hints,
	};
};

export const extractBaseTypeAndDimensions = (it: string): [string, number] => {
	const dimensionRegex = /\[[^\]]*\]/g; // matches any [something], including []
	const count = (it.match(dimensionRegex) || []).length;
	const baseType = it.replace(dimensionRegex, '');
	return [baseType, count];
};

// Changed index format stored in snapshot for PostgreSQL in 0.22.0
export const updateUpToV7 = (it: Record<string, any>): PgSchema => {
	if (Number(it.version) < 6) return updateUpToV7(updateUpToV6(it));
	const schema = it as PgSchemaV6;

	const tables = Object.fromEntries(
		Object.entries(schema.tables).map((it) => {
			const table = it[1];
			const mappedIndexes = Object.fromEntries(
				Object.entries(table.indexes).map((idx) => {
					const { columns, ...rest } = idx[1];
					const mappedColumns = columns.map<LegacyIndex['columns'][number]>(
						(it) => {
							return {
								expression: it,
								isExpression: false,
								asc: true,
								nulls: 'last',
								opClass: undefined,
							};
						},
					);
					return [idx[0], { columns: mappedColumns, with: {}, ...rest }];
				}),
			);
			return [
				it[0],
				{
					...table,
					indexes: mappedIndexes,
					policies: {},
					isRLSEnabled: false,
					checkConstraints: {},
				},
			];
		}),
	);

	return {
		...schema,
		version: '7',
		dialect: 'postgresql',
		sequences: {},
		tables: tables,
		policies: {},
		views: {},
		roles: {},
	};
};

export const updateUpToV6 = (it: Record<string, any>): PgSchemaV6 => {
	if (Number(it.version) < 5) return updateUpToV6(updateToV5(it));
	const schema = it as PgSchemaV5;

	const tables = Object.fromEntries(
		Object.entries(schema.tables).map((it) => {
			const table = it[1];
			const schema = table.schema || 'public';
			return [`${schema}.${table.name}`, table];
		}),
	);
	const enums = Object.fromEntries(
		Object.entries(schema.enums).map((it) => {
			const en = it[1];
			return [
				`public.${en.name}`,
				{
					name: en.name,
					schema: 'public',
					values: Object.values(en.values),
				},
			];
		}),
	);
	return {
		...schema,
		version: '6',
		dialect: 'postgresql',
		tables: tables,
		enums,
	};
};

// major migration with of folder structure, etc...
export const updateToV5 = (it: Record<string, any>): PgSchemaV5 => {
	if (Number(it.version) < 4) throw new Error('Snapshot version <4');
	const obj = it as PgSchemaV4;

	const mappedTables: Record<string, TableV5> = {};
	for (const [key, table] of Object.entries(obj.tables)) {
		const mappedColumns: Record<string, Column> = {};
		for (const [ckey, column] of Object.entries(table.columns)) {
			let newDefault: any = column.default;
			let newType: string = column.type;
			if (column.type.toLowerCase() === 'date') {
				if (typeof column.default !== 'undefined') {
					if (column.default.startsWith("'") && column.default.endsWith("'")) {
						newDefault = `'${
							column.default
								.substring(1, column.default.length - 1)
								.split('T')[0]
						}'`;
					} else {
						newDefault = column.default.split('T')[0];
					}
				}
			} else if (column.type.toLowerCase().startsWith('timestamp')) {
				if (typeof column.default !== 'undefined') {
					if (column.default.startsWith("'") && column.default.endsWith("'")) {
						newDefault = `'${
							column.default
								.substring(1, column.default.length - 1)
								.replace('T', ' ')
								.slice(0, 23)
						}'`;
					} else {
						newDefault = column.default.replace('T', ' ').slice(0, 23);
					}
				}
				newType = column.type
					.toLowerCase()
					.replace('timestamp (', 'timestamp(');
			} else if (column.type.toLowerCase().startsWith('time')) {
				newType = column.type.toLowerCase().replace('time (', 'time(');
			} else if (column.type.toLowerCase().startsWith('interval')) {
				newType = column.type.toLowerCase().replace(' (', '(');
			}
			mappedColumns[ckey] = { ...column, default: newDefault, type: newType };
		}

		mappedTables[key] = {
			...table,
			columns: mappedColumns,
			compositePrimaryKeys: {},
			uniqueConstraints: {},
		};
	}

	return {
		version: '5',
		dialect: obj.dialect,
		id: obj.id,
		prevIds: obj.prevIds,
		tables: mappedTables,
		enums: obj.enums,
		schemas: obj.schemas,
		_meta: {
			schemas: {} as Record<string, string>,
			tables: {} as Record<string, string>,
			columns: {} as Record<string, string>,
		},
	};
};
