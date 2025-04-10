import { mapValues, originUUID, snapshotVersion } from '../global';

import { any, array, boolean, enum as enumType, literal, number, object, record, string, TypeOf, union } from 'zod';

const indexV2 = object({
	name: string(),
	columns: record(
		string(),
		object({
			name: string(),
		}),
	),
	isUnique: boolean(),
}).strict();

const columnV2 = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	references: string().optional(),
}).strict();

const tableV2 = object({
	name: string(),
	columns: record(string(), columnV2),
	indexes: record(string(), indexV2),
}).strict();

const enumSchemaV1 = object({
	name: string(),
	values: record(string(), string()),
}).strict();

const enumSchema = object({
	name: string(),
	schema: string(),
	values: string().array(),
}).strict();

export const pgSchemaV2 = object({
	version: literal('2'),
	tables: record(string(), tableV2),
	enums: record(string(), enumSchemaV1),
}).strict();

// ------- V1 --------
const references = object({
	foreignKeyName: string(),
	table: string(),
	column: string(),
	onDelete: string().optional(),
	onUpdate: string().optional(),
}).strict();

const columnV1 = object({
	name: string(),
	type: string(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	references: references.optional(),
}).strict();

const tableV1 = object({
	name: string(),
	columns: record(string(), columnV1),
	indexes: record(string(), indexV2),
}).strict();

export const pgSchemaV1 = object({
	version: literal('1'),
	tables: record(string(), tableV1),
	enums: record(string(), enumSchemaV1),
}).strict();

const indexColumn = object({
	expression: string(),
	isExpression: boolean(),
	asc: boolean(),
	nulls: string().optional(),
	opclass: string().optional(),
});

export type IndexColumnType = TypeOf<typeof indexColumn>;

const index = object({
	name: string(),
	columns: indexColumn.array(),
	isUnique: boolean(),
	with: record(string(), any()).optional(),
	method: string().default('btree'),
	where: string().optional(),
	concurrently: boolean().default(false),
}).strict();

const indexV4 = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	with: record(string(), string()).optional(),
	method: string().default('btree'),
	where: string().optional(),
	concurrently: boolean().default(false),
}).strict();

const indexV5 = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	with: record(string(), string()).optional(),
	method: string().default('btree'),
	where: string().optional(),
	concurrently: boolean().default(false),
}).strict();

const indexV6 = object({
	name: string(),
	columns: string().array(),
	isUnique: boolean(),
	with: record(string(), string()).optional(),
	method: string().default('btree'),
	where: string().optional(),
	concurrently: boolean().default(false),
}).strict();

const fk = object({
	name: string(),
	tableFrom: string(),
	columnsFrom: string().array(),
	tableTo: string(),
	schemaTo: string().optional(),
	columnsTo: string().array(),
	onUpdate: string().optional(),
	onDelete: string().optional(),
}).strict();

export const sequenceSchema = object({
	name: string(),
	increment: string().optional(),
	minValue: string().optional(),
	maxValue: string().optional(),
	startWith: string().optional(),
	cache: string().optional(),
	cycle: boolean().optional(),
	schema: string(),
}).strict();

export const roleSchema = object({
	name: string(),
	createDb: boolean().optional(),
	createRole: boolean().optional(),
	inherit: boolean().optional(),
}).strict();

export const sequenceSquashed = object({
	name: string(),
	schema: string(),
	values: string(),
}).strict();

const columnV7 = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	isUnique: any().optional(),
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
}).strict();

const column = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	isUnique: any().optional(),
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
	generated: object({
		type: literal('stored'),
		as: string(),
	}).optional(),
	identity: sequenceSchema
		.merge(object({ type: enumType(['always', 'byDefault']) }))
		.optional(),
}).strict();

const checkConstraint = object({
	name: string(),
	value: string(),
}).strict();

const columnSquashed = object({
	name: string(),
	type: string(),
	typeSchema: string().optional(),
	primaryKey: boolean(),
	notNull: boolean(),
	default: any().optional(),
	isUnique: any().optional(),
	uniqueName: string().optional(),
	nullsNotDistinct: boolean().optional(),
	generated: object({
		type: literal('stored'),
		as: string(),
	}).optional(),
	identity: string().optional(),
}).strict();

const tableV3 = object({
	name: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
}).strict();

const compositePK = object({
	name: string(),
	columns: string().array(),
}).strict();

const uniqueConstraint = object({
	name: string(),
	columns: string().array(),
	nullsNotDistinct: boolean(),
}).strict();

export const policy = object({
	name: string(),
	as: enumType(['PERMISSIVE', 'RESTRICTIVE']).optional(),
	for: enumType(['ALL', 'SELECT', 'INSERT', 'UPDATE', 'DELETE']).optional(),
	to: string().array().optional(),
	using: string().optional(),
	withCheck: string().optional(),
	on: string().optional(),
	schema: string().optional(),
}).strict();

export const policySquashed = object({
	name: string(),
	values: string(),
}).strict();

const viewWithOption = object({
	checkOption: enumType(['local', 'cascaded']).optional(),
	securityBarrier: boolean().optional(),
	securityInvoker: boolean().optional(),
}).strict();

const matViewWithOption = object({
	fillfactor: number().optional(),
	toastTupleTarget: number().optional(),
	parallelWorkers: number().optional(),
	autovacuumEnabled: boolean().optional(),
	vacuumIndexCleanup: enumType(['auto', 'off', 'on']).optional(),
	vacuumTruncate: boolean().optional(),
	autovacuumVacuumThreshold: number().optional(),
	autovacuumVacuumScaleFactor: number().optional(),
	autovacuumVacuumCostDelay: number().optional(),
	autovacuumVacuumCostLimit: number().optional(),
	autovacuumFreezeMinAge: number().optional(),
	autovacuumFreezeMaxAge: number().optional(),
	autovacuumFreezeTableAge: number().optional(),
	autovacuumMultixactFreezeMinAge: number().optional(),
	autovacuumMultixactFreezeMaxAge: number().optional(),
	autovacuumMultixactFreezeTableAge: number().optional(),
	logAutovacuumMinDuration: number().optional(),
	userCatalogTable: boolean().optional(),
}).strict();

export const mergedViewWithOption = viewWithOption.merge(matViewWithOption).strict();

export const view = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	definition: string().optional(),
	materialized: boolean(),
	with: mergedViewWithOption.optional(),
	isExisting: boolean(),
	withNoData: boolean().optional(),
	using: string().optional(),
	tablespace: string().optional(),
}).strict();

const tableV4 = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	indexes: record(string(), indexV4),
	foreignKeys: record(string(), fk),
}).strict();

const tableV5 = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	indexes: record(string(), indexV5),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
}).strict();

const tableV6 = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	indexes: record(string(), indexV6),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
}).strict();

const tableV7 = object({
	name: string(),
	schema: string(),
	columns: record(string(), columnV7),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
}).strict();

const table = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	indexes: record(string(), index),
	foreignKeys: record(string(), fk),
	compositePrimaryKeys: record(string(), compositePK),
	uniqueConstraints: record(string(), uniqueConstraint).default({}),
	policies: record(string(), policy).default({}),
	checkConstraints: record(string(), checkConstraint).default({}),
	isRLSEnabled: boolean().default(false),
}).strict();

const schemaHash = object({
	id: string(),
	prevId: string(),
});

export const kitInternals = object({
	tables: record(
		string(),
		object({
			columns: record(
				string(),
				object({
					isArray: boolean().optional(),
					dimensions: number().optional(),
					rawType: string().optional(),
					isDefaultAnExpression: boolean().optional(),
				}).optional(),
			),
		}).optional(),
	),
}).optional();

export const pgSchemaInternalV3 = object({
	version: literal('3'),
	dialect: literal('pg'),
	tables: record(string(), tableV3),
	enums: record(string(), enumSchemaV1),
}).strict();

export const pgSchemaInternalV4 = object({
	version: literal('4'),
	dialect: literal('pg'),
	tables: record(string(), tableV4),
	enums: record(string(), enumSchemaV1),
	schemas: record(string(), string()),
}).strict();

// "table" -> "schema.table" for schema proper support
export const pgSchemaInternalV5 = object({
	version: literal('5'),
	dialect: literal('pg'),
	tables: record(string(), tableV5),
	enums: record(string(), enumSchemaV1),
	schemas: record(string(), string()),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const pgSchemaInternalV6 = object({
	version: literal('6'),
	dialect: literal('postgresql'),
	tables: record(string(), tableV6),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const pgSchemaExternal = object({
	version: literal('5'),
	dialect: literal('pg'),
	tables: array(table),
	enums: array(enumSchemaV1),
	schemas: array(object({ name: string() })),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
}).strict();

export const pgSchemaInternalV7 = object({
	version: literal('7'),
	dialect: literal('postgresql'),
	tables: record(string(), tableV7),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
	sequences: record(string(), sequenceSchema),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

export const pgSchemaInternal = object({
	version: literal('7'),
	dialect: literal('postgresql'),
	tables: record(string(), table),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
	views: record(string(), view).default({}),
	sequences: record(string(), sequenceSchema).default({}),
	roles: record(string(), roleSchema).default({}),
	policies: record(string(), policy).default({}),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
	internal: kitInternals,
}).strict();

const tableSquashed = object({
	name: string(),
	schema: string(),
	columns: record(string(), columnSquashed),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
	compositePrimaryKeys: record(string(), string()),
	uniqueConstraints: record(string(), string()),
	policies: record(string(), string()),
	checkConstraints: record(string(), string()),
	isRLSEnabled: boolean().default(false),
}).strict();

const tableSquashedV4 = object({
	name: string(),
	schema: string(),
	columns: record(string(), column),
	indexes: record(string(), string()),
	foreignKeys: record(string(), string()),
}).strict();

export const pgSchemaSquashedV4 = object({
	version: literal('4'),
	dialect: literal('pg'),
	tables: record(string(), tableSquashedV4),
	enums: record(string(), enumSchemaV1),
	schemas: record(string(), string()),
}).strict();

export const pgSchemaSquashedV6 = object({
	version: literal('6'),
	dialect: literal('postgresql'),
	tables: record(string(), tableSquashed),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
}).strict();

export const pgSchemaSquashed = object({
	version: literal('7'),
	dialect: literal('postgresql'),
	tables: record(string(), tableSquashed),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
	views: record(string(), view),
	sequences: record(string(), sequenceSquashed),
	roles: record(string(), roleSchema).default({}),
	policies: record(string(), policySquashed).default({}),
}).strict();

export const pgSchemaV3 = pgSchemaInternalV3.merge(schemaHash);
export const pgSchemaV4 = pgSchemaInternalV4.merge(schemaHash);
export const pgSchemaV5 = pgSchemaInternalV5.merge(schemaHash);
export const pgSchemaV6 = pgSchemaInternalV6.merge(schemaHash);
export const pgSchemaV7 = pgSchemaInternalV7.merge(schemaHash);
export const pgSchema = pgSchemaInternal.merge(schemaHash);

export type Enum = TypeOf<typeof enumSchema>;
export type Sequence = TypeOf<typeof sequenceSchema>;
export type Role = TypeOf<typeof roleSchema>;
export type Column = TypeOf<typeof column>;
export type TableV3 = TypeOf<typeof tableV3>;
export type TableV4 = TypeOf<typeof tableV4>;
export type TableV5 = TypeOf<typeof tableV5>;
export type Table = TypeOf<typeof table>;
export type PgSchema = TypeOf<typeof pgSchema>;
export type PgSchemaInternal = TypeOf<typeof pgSchemaInternal>;
export type PgSchemaV6Internal = TypeOf<typeof pgSchemaInternalV6>;
export type PgSchemaExternal = TypeOf<typeof pgSchemaExternal>;
export type PgSchemaSquashed = TypeOf<typeof pgSchemaSquashed>;
export type PgSchemaSquashedV4 = TypeOf<typeof pgSchemaSquashedV4>;
export type PgSchemaSquashedV6 = TypeOf<typeof pgSchemaSquashedV6>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;
export type Policy = TypeOf<typeof policy>;
export type View = TypeOf<typeof view>;
export type MatViewWithOption = TypeOf<typeof matViewWithOption>;
export type ViewWithOption = TypeOf<typeof viewWithOption>;

export type PgKitInternals = TypeOf<typeof kitInternals>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;

export type PgSchemaV1 = TypeOf<typeof pgSchemaV1>;
export type PgSchemaV2 = TypeOf<typeof pgSchemaV2>;
export type PgSchemaV3 = TypeOf<typeof pgSchemaV3>;
export type PgSchemaV4 = TypeOf<typeof pgSchemaV4>;
export type PgSchemaV5 = TypeOf<typeof pgSchemaV5>;
export type PgSchemaV6 = TypeOf<typeof pgSchemaV6>;

export const backwardCompatiblePgSchema = union([
	pgSchemaV5,
	pgSchemaV6,
	pgSchema,
]);

export const PgSquasher = {
	squashIdx: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${
			idx.columns
				.map(
					(c) => `${c.expression}--${c.isExpression}--${c.asc}--${c.nulls}--${c.opclass ? c.opclass : ''}`,
				)
				.join(',,')
		};${idx.isUnique};${idx.concurrently};${idx.method};${idx.where};${JSON.stringify(idx.with)}`;
	},
	unsquashIdx: (input: string): Index => {
		const [
			name,
			columnsString,
			isUnique,
			concurrently,
			method,
			where,
			idxWith,
		] = input.split(';');

		const columnString = columnsString.split(',,');
		const columns: IndexColumnType[] = [];

		for (const column of columnString) {
			const [expression, isExpression, asc, nulls, opclass] = column.split('--');
			columns.push({
				nulls: nulls as IndexColumnType['nulls'],
				isExpression: isExpression === 'true',
				asc: asc === 'true',
				expression: expression,
				opclass: opclass === 'undefined' ? undefined : opclass,
			});
		}

		const result: Index = index.parse({
			name,
			columns: columns,
			isUnique: isUnique === 'true',
			concurrently: concurrently === 'true',
			method,
			where: where === 'undefined' ? undefined : where,
			with: !idxWith || idxWith === 'undefined' ? undefined : JSON.parse(idxWith),
		});
		return result;
	},
	squashIdxPush: (idx: Index) => {
		index.parse(idx);
		return `${idx.name};${
			idx.columns
				.map((c) => `${c.isExpression ? '' : c.expression}--${c.asc}--${c.nulls}`)
				.join(',,')
		};${idx.isUnique};${idx.method};${JSON.stringify(idx.with)}`;
	},
	unsquashIdxPush: (input: string): Index => {
		const [name, columnsString, isUnique, method, idxWith] = input.split(';');

		const columnString = columnsString.split('--');
		const columns: IndexColumnType[] = [];

		for (const column of columnString) {
			const [expression, asc, nulls, opclass] = column.split(',');
			columns.push({
				nulls: nulls as IndexColumnType['nulls'],
				isExpression: expression === '',
				asc: asc === 'true',
				expression: expression,
			});
		}

		const result: Index = index.parse({
			name,
			columns: columns,
			isUnique: isUnique === 'true',
			concurrently: false,
			method,
			with: idxWith === 'undefined' ? undefined : JSON.parse(idxWith),
		});
		return result;
	},
	squashFK: (fk: ForeignKey) => {
		return `${fk.name};${fk.tableFrom};${fk.columnsFrom.join(',')};${fk.tableTo};${fk.columnsTo.join(',')};${
			fk.onUpdate ?? ''
		};${fk.onDelete ?? ''};${fk.schemaTo || 'public'}`;
	},
	squashPolicy: (policy: Policy) => {
		return `${policy.name}--${policy.as}--${policy.for}--${
			policy.to?.join(',')
		}--${policy.using}--${policy.withCheck}--${policy.on}`;
	},
	unsquashPolicy: (policy: string): Policy => {
		const splitted = policy.split('--');
		return {
			name: splitted[0],
			as: splitted[1] as Policy['as'],
			for: splitted[2] as Policy['for'],
			to: splitted[3].split(','),
			using: splitted[4] !== 'undefined' ? splitted[4] : undefined,
			withCheck: splitted[5] !== 'undefined' ? splitted[5] : undefined,
			on: splitted[6] !== 'undefined' ? splitted[6] : undefined,
		};
	},
	squashPolicyPush: (policy: Policy) => {
		return `${policy.name}--${policy.as}--${policy.for}--${policy.to?.join(',')}--${policy.on}`;
	},
	unsquashPolicyPush: (policy: string): Policy => {
		const splitted = policy.split('--');
		return {
			name: splitted[0],
			as: splitted[1] as Policy['as'],
			for: splitted[2] as Policy['for'],
			to: splitted[3].split(','),
			on: splitted[4] !== 'undefined' ? splitted[4] : undefined,
		};
	},
	squashPK: (pk: PrimaryKey) => {
		return `${pk.columns.join(',')};${pk.name}`;
	},
	unsquashPK: (pk: string): PrimaryKey => {
		const splitted = pk.split(';');
		return { name: splitted[1], columns: splitted[0].split(',') };
	},
	squashUnique: (unq: UniqueConstraint) => {
		return `${unq.name};${unq.columns.join(',')};${unq.nullsNotDistinct}`;
	},
	unsquashUnique: (unq: string): UniqueConstraint => {
		const [name, columns, nullsNotDistinct] = unq.split(';');
		return {
			name,
			columns: columns.split(','),
			nullsNotDistinct: nullsNotDistinct === 'true',
		};
	},
	unsquashFK: (input: string): ForeignKey => {
		const [
			name,
			tableFrom,
			columnsFromStr,
			tableTo,
			columnsToStr,
			onUpdate,
			onDelete,
			schemaTo,
		] = input.split(';');

		const result: ForeignKey = fk.parse({
			name,
			tableFrom,
			columnsFrom: columnsFromStr.split(','),
			schemaTo: schemaTo,
			tableTo,
			columnsTo: columnsToStr.split(','),
			onUpdate,
			onDelete,
		});
		return result;
	},
	squashSequence: (seq: Omit<Sequence, 'name' | 'schema'>) => {
		return `${seq.minValue};${seq.maxValue};${seq.increment};${seq.startWith};${seq.cache};${seq.cycle ?? ''}`;
	},
	unsquashSequence: (seq: string): Omit<Sequence, 'name' | 'schema'> => {
		const splitted = seq.split(';');
		return {
			minValue: splitted[0] !== 'undefined' ? splitted[0] : undefined,
			maxValue: splitted[1] !== 'undefined' ? splitted[1] : undefined,
			increment: splitted[2] !== 'undefined' ? splitted[2] : undefined,
			startWith: splitted[3] !== 'undefined' ? splitted[3] : undefined,
			cache: splitted[4] !== 'undefined' ? splitted[4] : undefined,
			cycle: splitted[5] === 'true',
		};
	},
	squashIdentity: (
		seq: Omit<Sequence, 'schema'> & { type: 'always' | 'byDefault' },
	) => {
		return `${seq.name};${seq.type};${seq.minValue};${seq.maxValue};${seq.increment};${seq.startWith};${seq.cache};${
			seq.cycle ?? ''
		}`;
	},
	unsquashIdentity: (
		seq: string,
	): Omit<Sequence, 'schema'> & { type: 'always' | 'byDefault' } => {
		const splitted = seq.split(';');
		return {
			name: splitted[0],
			type: splitted[1] as 'always' | 'byDefault',
			minValue: splitted[2] !== 'undefined' ? splitted[2] : undefined,
			maxValue: splitted[3] !== 'undefined' ? splitted[3] : undefined,
			increment: splitted[4] !== 'undefined' ? splitted[4] : undefined,
			startWith: splitted[5] !== 'undefined' ? splitted[5] : undefined,
			cache: splitted[6] !== 'undefined' ? splitted[6] : undefined,
			cycle: splitted[7] === 'true',
		};
	},
	squashCheck: (check: CheckConstraint) => {
		return `${check.name};${check.value}`;
	},
	unsquashCheck: (input: string): CheckConstraint => {
		const [
			name,
			value,
		] = input.split(';');

		return { name, value };
	},
};

export const squashPgScheme = (
	json: PgSchema,
	action?: 'push' | undefined,
): PgSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return action === 'push'
					? PgSquasher.squashIdxPush(index)
					: PgSquasher.squashIdx(index);
			});

			const squashedFKs = mapValues(it[1].foreignKeys, (fk) => {
				return PgSquasher.squashFK(fk);
			});

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return PgSquasher.squashPK(pk);
			});

			const mappedColumns = Object.fromEntries(
				Object.entries(it[1].columns).map((it) => {
					const mappedIdentity = it[1].identity
						? PgSquasher.squashIdentity(it[1].identity)
						: undefined;
					return [
						it[0],
						{
							...it[1],
							identity: mappedIdentity,
						},
					];
				}),
			);

			const squashedUniqueConstraints = mapValues(
				it[1].uniqueConstraints,
				(unq) => {
					return PgSquasher.squashUnique(unq);
				},
			);

			const squashedPolicies = mapValues(it[1].policies, (policy) => {
				return action === 'push'
					? PgSquasher.squashPolicyPush(policy)
					: PgSquasher.squashPolicy(policy);
			});
			const squashedChecksContraints = mapValues(
				it[1].checkConstraints,
				(check) => {
					return PgSquasher.squashCheck(check);
				},
			);

			return [
				it[0],
				{
					name: it[1].name,
					schema: it[1].schema,
					columns: mappedColumns,
					indexes: squashedIndexes,
					foreignKeys: squashedFKs,
					compositePrimaryKeys: squashedPKs,
					uniqueConstraints: squashedUniqueConstraints,
					policies: squashedPolicies,
					checkConstraints: squashedChecksContraints,
					isRLSEnabled: it[1].isRLSEnabled ?? false,
				},
			];
		}),
	);

	const mappedSequences = Object.fromEntries(
		Object.entries(json.sequences).map((it) => {
			return [
				it[0],
				{
					name: it[1].name,
					schema: it[1].schema,
					values: PgSquasher.squashSequence(it[1]),
				},
			];
		}),
	);

	const mappedPolicies = Object.fromEntries(
		Object.entries(json.policies).map((it) => {
			return [
				it[0],
				{
					name: it[1].name,
					values: action === 'push'
						? PgSquasher.squashPolicyPush(it[1])
						: PgSquasher.squashPolicy(it[1]),
				},
			];
		}),
	);

	return {
		version: '7',
		dialect: json.dialect,
		tables: mappedTables,
		enums: json.enums,
		schemas: json.schemas,
		views: json.views,
		policies: mappedPolicies,
		sequences: mappedSequences,
		roles: json.roles,
	};
};

export const dryPg = pgSchema.parse({
	version: snapshotVersion,
	dialect: 'postgresql',
	id: originUUID,
	prevId: '',
	tables: {},
	enums: {},
	schemas: {},
	policies: {},
	roles: {},
	sequences: {},
	_meta: {
		schemas: {},
		tables: {},
		columns: {},
	},
});
