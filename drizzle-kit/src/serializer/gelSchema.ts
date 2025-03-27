import { mapValues, originUUID, snapshotVersion } from '../global';

import { any, array, boolean, enum as enumType, literal, number, object, record, string, TypeOf, union } from 'zod';

const enumSchema = object({
	name: string(),
	schema: string(),
	values: string().array(),
}).strict();

const enumSchemaV1 = object({
	name: string(),
	values: record(string(), string()),
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

export const gelSchemaExternal = object({
	version: literal('1'),
	dialect: literal('gel'),
	tables: array(table),
	enums: array(enumSchemaV1),
	schemas: array(object({ name: string() })),
	_meta: object({
		schemas: record(string(), string()),
		tables: record(string(), string()),
		columns: record(string(), string()),
	}),
}).strict();

export const gelSchemaInternal = object({
	version: literal('1'),
	dialect: literal('gel'),
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

export const gelSchemaSquashed = object({
	version: literal('1'),
	dialect: literal('gel'),
	tables: record(string(), tableSquashed),
	enums: record(string(), enumSchema),
	schemas: record(string(), string()),
	views: record(string(), view),
	sequences: record(string(), sequenceSquashed),
	roles: record(string(), roleSchema).default({}),
	policies: record(string(), policySquashed).default({}),
}).strict();

export const gelSchema = gelSchemaInternal.merge(schemaHash);

export type Enum = TypeOf<typeof enumSchema>;
export type Sequence = TypeOf<typeof sequenceSchema>;
export type Role = TypeOf<typeof roleSchema>;
export type Column = TypeOf<typeof column>;
export type Table = TypeOf<typeof table>;
export type GelSchema = TypeOf<typeof gelSchema>;
export type GelSchemaInternal = TypeOf<typeof gelSchemaInternal>;
export type GelSchemaExternal = TypeOf<typeof gelSchemaExternal>;
export type GelSchemaSquashed = TypeOf<typeof gelSchemaSquashed>;
export type Index = TypeOf<typeof index>;
export type ForeignKey = TypeOf<typeof fk>;
export type PrimaryKey = TypeOf<typeof compositePK>;
export type UniqueConstraint = TypeOf<typeof uniqueConstraint>;
export type Policy = TypeOf<typeof policy>;
export type View = TypeOf<typeof view>;
export type MatViewWithOption = TypeOf<typeof matViewWithOption>;
export type ViewWithOption = TypeOf<typeof viewWithOption>;

export type GelKitInternals = TypeOf<typeof kitInternals>;
export type CheckConstraint = TypeOf<typeof checkConstraint>;

// no prev version
export const backwardCompatibleGelSchema = gelSchema;

export const GelSquasher = {
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

export const squashGelScheme = (
	json: GelSchema,
	action?: 'push' | undefined,
): GelSchemaSquashed => {
	const mappedTables = Object.fromEntries(
		Object.entries(json.tables).map((it) => {
			const squashedIndexes = mapValues(it[1].indexes, (index) => {
				return action === 'push'
					? GelSquasher.squashIdxPush(index)
					: GelSquasher.squashIdx(index);
			});

			const squashedFKs = mapValues(it[1].foreignKeys, (fk) => {
				return GelSquasher.squashFK(fk);
			});

			const squashedPKs = mapValues(it[1].compositePrimaryKeys, (pk) => {
				return GelSquasher.squashPK(pk);
			});

			const mappedColumns = Object.fromEntries(
				Object.entries(it[1].columns).map((it) => {
					const mappedIdentity = it[1].identity
						? GelSquasher.squashIdentity(it[1].identity)
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
					return GelSquasher.squashUnique(unq);
				},
			);

			const squashedPolicies = mapValues(it[1].policies, (policy) => {
				return action === 'push'
					? GelSquasher.squashPolicyPush(policy)
					: GelSquasher.squashPolicy(policy);
			});
			const squashedChecksContraints = mapValues(
				it[1].checkConstraints,
				(check) => {
					return GelSquasher.squashCheck(check);
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
					values: GelSquasher.squashSequence(it[1]),
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
						? GelSquasher.squashPolicyPush(it[1])
						: GelSquasher.squashPolicy(it[1]),
				},
			];
		}),
	);

	return {
		version: '1',
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

export const dryGel = gelSchema.parse({
	version: '1',
	dialect: 'gel',
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
