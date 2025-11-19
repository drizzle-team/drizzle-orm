import { randomUUID } from 'crypto';
import type { TypeOf } from 'zod';
import { any, array as zodArray, boolean, enum as enumType, literal, number, object, record, string } from 'zod';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { PostgresDDL, PostgresEntity } from './ddl';
import { createDDL } from './ddl';

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

export const identitySchema = sequenceSchema.omit({ schema: true }).merge(
	object({ type: enumType(['always', 'byDefault']) }),
);

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
	generated: object({
		type: literal('stored'),
		as: string(),
	}).optional(),
	identity: identitySchema.optional(),
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
	isRLSEnabled: boolean().default(false).optional(),
}).strict();

const schemaHash = object({
	id: string(),
	prevIds: zodArray(string()),
});

const schemaHashV7 = object({
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
	tables: zodArray(table),
	enums: zodArray(enumSchemaV1),
	schemas: zodArray(object({ name: string() })),
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
export const pgSchemaV7 = pgSchemaInternal.merge(schemaHashV7);
export const pgSchema = pgSchemaInternal.merge(schemaHash);

export type PgSchemaV1 = TypeOf<typeof pgSchemaV1>;
export type PgSchemaV2 = TypeOf<typeof pgSchemaV2>;
export type PgSchemaV3 = TypeOf<typeof pgSchemaV3>;
export type PgSchemaV4 = TypeOf<typeof pgSchemaV4>;
export type PgSchemaV5 = TypeOf<typeof pgSchemaV5>;
export type PgSchemaV6 = TypeOf<typeof pgSchemaV6>;
export type PgSchemaV7 = TypeOf<typeof pgSchemaV7>;
export type PgSchema = TypeOf<typeof pgSchema>;

export type Index = TypeOf<typeof index>;
export type TableV5 = TypeOf<typeof tableV5>;
export type Column = TypeOf<typeof column>;

export const toJsonSnapshot = (ddl: PostgresDDL, prevIds: string[], renames: string[]): PostgresSnapshot => {
	return { dialect: 'postgres', id: randomUUID(), prevIds, version: '8', ddl: ddl.entities.list(), renames };
};

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['8'],
	dialect: ['postgres'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<PostgresEntity>((it) => {
		const res = ddl.entities.validate(it);
		if (!res) {
			console.log(it);
		}
		return res;
	}),
	renames: array<string>((_) => true),
});

export type PostgresSnapshot = typeof snapshotValidator.shape;

export const drySnapshot = snapshotValidator.strict(
	{
		version: '8',
		dialect: 'postgres',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies PostgresSnapshot,
);
