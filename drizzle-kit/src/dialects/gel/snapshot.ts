import type { TypeOf } from 'zod';
import { any, array, boolean, enum as enumType, literal, number, object, record, string } from 'zod';
import { originUUID } from '../../utils';

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
	prevIds: array(string()),
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

export const dryGel = gelSchema.parse({
	version: '1',
	dialect: 'gel',
	id: originUUID,
	prevIds: [],
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
