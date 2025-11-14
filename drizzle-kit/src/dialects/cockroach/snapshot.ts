import { randomUUID } from 'crypto';
import type { TypeOf } from 'zod';
import { any, boolean, enum as enumType, literal, number, object, record, string } from 'zod';
import { originUUID } from '../../utils';
import { array, validator } from '../simpleValidator';
import type { CockroachDDL, CockroachEntity } from './ddl';
import { createDDL } from './ddl';
import { defaults } from './grammar';

const enumSchema = object({
	name: string(),
	schema: string(),
	values: string().array(),
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
	method: string().default(defaults.index.method),
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
	isRLSEnabled: boolean().default(false).optional(),
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

export const cockroachSchemaInternal = object({
	version: literal('1'),
	dialect: literal('cockroach'),
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

export const cockroachSchema = cockroachSchemaInternal.merge(schemaHash);

export type CockroachSchema = TypeOf<typeof cockroachSchema>;

export type Index = TypeOf<typeof index>;
export type Column = TypeOf<typeof column>;

export const toJsonSnapshot = (ddl: CockroachDDL, prevIds: string[], renames: string[]): CockroachSnapshot => {
	return { dialect: 'cockroach', id: randomUUID(), prevIds, version: '1', ddl: ddl.entities.list(), renames };
};

const ddl = createDDL();
export const snapshotValidator = validator({
	version: ['1'],
	dialect: ['cockroach'],
	id: 'string',
	prevIds: array<string>((_) => true),
	ddl: array<CockroachEntity>((it) => {
		const res = ddl.entities.validate(it);
		if (!res) {
			console.log(it);
		}
		return res;
	}),
	renames: array<string>((_) => true),
});

export type CockroachSnapshot = typeof snapshotValidator.shape;

export const drySnapshot = snapshotValidator.strict(
	{
		version: '1',
		dialect: 'cockroach',
		id: originUUID,
		prevIds: [],
		ddl: [],
		renames: [],
	} satisfies CockroachSnapshot,
);
