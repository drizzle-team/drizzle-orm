import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { defaults } from 'src/dialects/postgres/grammar';
import { getOrNull } from 'src/dialects/utils';
import { createDDL } from '../../dialects/postgres/ddl';
import {
	Column,
	Index,
	PgSchema,
	PgSchemaV4,
	PgSchemaV5,
	pgSchemaV5,
	PgSchemaV6,
	pgSchemaV6,
	PostgresSnapshot,
	TableV5,
} from '../../dialects/postgres/snapshot';
import { prepareOutFolder, validateWithReport } from '../../utils-node';

export const upPgHandler = (out: string) => {
	const { snapshots } = prepareOutFolder(out, 'postgresql');
	const report = validateWithReport(snapshots, 'postgresql');

	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]!! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			let resultV6 = it.raw;
			if (it.raw.version === '5') {
				resultV6 = updateUpToV6(it.raw);
			}

			const resultV7 = updateUpToV7(resultV6);
			const result = console.log(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(result, null, 2));
		});

	console.log("Everything's fine 🐶🔥");
};

// TODO: handle unique name _unique vs _key
// TODO: handle pk name table_columns_pk vs table_pkey
// TODO: handle all entities!
export const updateToV8 = (json: PgSchema): PostgresSnapshot => {
	const ddl = createDDL();

	for (const schema of Object.values(json.schemas)) {
		ddl.schemas.insert({ name: schema });
	}

	for (const en of Object.values(json.enums)) {
		ddl.enums.insert({ schema: en.schema, name: en.name, values: en.values });
	}

	for (const role of Object.values(json.roles)) {
		ddl.roles.insert({
			name: role.name,
			createRole: role.createRole,
			createDb: role.createDb,
			inherit: role.inherit,
		});
	}

	for (const policy of Object.values(json.policies)) {
		ddl.policies.insert({
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
		const opt = v.with;
		ddl.views.insert({
			schema: v.schema,
			name: v.name,
			definition: v.definition ?? null,
			tablespace: v.tablespace ?? null,
			withNoData: v.withNoData ?? null,
			using: v.using ? { name: v.using, default: false } : null,
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
			materialized: v.materialized,
			isExisting: v.isExisting,
		});
	}

	const renames = [
		...Object.entries(json._meta.tables).map(([k, v]) => `${v}->${k}`),
		...Object.entries(json._meta.schemas).map(([k, v]) => `${v}->${k}`),
		...Object.entries(json._meta.columns).map(([k, v]) => `${v}->${k}`),
	];

	return {
		id: json.id,
		prevId: json.prevId,
		version: '8',
		dialect: 'postgres',
		ddl: ddl.entities.list(),
		renames,
	};
};

// Changed index format stored in snapshot for PostgreSQL in 0.22.0
export const updateUpToV7 = (json: Record<string, any>): PgSchema => {
	const schema = pgSchemaV6.parse(json);
	const tables = Object.fromEntries(
		Object.entries(schema.tables).map((it) => {
			const table = it[1];
			const mappedIndexes = Object.fromEntries(
				Object.entries(table.indexes).map((idx) => {
					const { columns, ...rest } = idx[1];
					const mappedColumns = columns.map<Index['columns'][number]>((it) => {
						return {
							expression: it,
							isExpression: false,
							asc: true,
							nulls: 'last',
							opClass: undefined,
						};
					});
					return [idx[0], { columns: mappedColumns, with: {}, ...rest }];
				}),
			);
			return [it[0], { ...table, indexes: mappedIndexes, policies: {}, isRLSEnabled: false, checkConstraints: {} }];
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

export const updateUpToV6 = (json: Record<string, any>): PgSchemaV6 => {
	const schema = pgSchemaV5.parse(json);
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
export const upPgHandlerV4toV5 = (obj: PgSchemaV4): PgSchemaV5 => {
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
		prevId: obj.prevId,
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
