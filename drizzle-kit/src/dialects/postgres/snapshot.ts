import { createHash, randomUUID } from 'crypto';
import type { TypeOf } from 'zod';
import { any, array as zodArray, boolean, enum as enumType, literal, number, object, record, string } from 'zod';
import { originUUID } from '../../utils';
import { normalizeDDL } from '../ddl-canonical';
import { type AnyDDL, apply, applyInPlace, type Delta, findRow, splitDeltaKey } from '../dialect';
import { array, validator } from '../simpleValidator';
import { statementTypes } from './convertor';
import type { PostgresDDL, PostgresEntity } from './ddl';
import { createDDL, fromEntities } from './ddl';
import { type SnapshotStatement, snapshotStatementSchemas } from './snapshot-statements';

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

export type PostgresSnapshotV8 = {
	version: '8';
	dialect: 'postgres';
	id: string;
	prevIds: string[];
	ddl: PostgresEntity[];
	renames: string[];
};

const ddl = createDDL();
const definitions = ddl._.defs;

const isScalar = (it: unknown) => it === null || ['string', 'number', 'boolean'].includes(typeof it);
// An object whose keys are fields of `def` and whose values are scalars, because the replay compares the
// values of `where` and `match` with ===, and an instruction only writes names.
const isFieldMap = (it: any, def: Record<string, unknown> | undefined): boolean =>
	!!def && typeof it === 'object' && it !== null && !Array.isArray(it)
	&& Object.entries(it).every(([field, value]) => Object.hasOwn(def, field) && isScalar(value));
const isFilled = (it: object) => Object.keys(it).length > 0;

const isInstruction = (it: any): boolean => {
	const def: Record<string, any> | undefined = Object.hasOwn(definitions, it.type) ? definitions[it.type] : undefined;
	if (!isFieldMap(it.where, def)) return false;
	if (it.op === 'update') return isFieldMap(it.set, def) && isFilled(it.set);
	const list = Object.hasOwn(def!, it.field) ? def![it.field] : undefined;
	if (it.op === 'replace_in_list') {
		return list === 'string[]' && typeof it.from === 'string' && typeof it.to === 'string';
	}
	const item = Array.isArray(list) && typeof list[0] === 'object' && list[0] !== null ? list[0] : undefined;
	return isFieldMap(it.match, item) && isFieldMap(it.set, item) && isFilled(it.set);
};

const isDelta = (it: any): boolean => {
	if (it?.op === 'create') return Object.hasOwn(definitions, it.row?.entityType) && ddl.entities.validate(it.row);
	if (['update', 'replace_in_list', 'update_list_items'].includes(it?.op)) return isInstruction(it);
	if (!['drop', 'alter', 'rename'].includes(it?.op)) return false;
	if (typeof it.key !== 'string' || !it.key.includes('\0')) return false;
	const [type] = splitDeltaKey(it.key);
	if (!Object.hasOwn(definitions, type)) return false;
	if (it.op === 'drop') return true;
	return typeof it.set === 'object' && it.set !== null
		&& Object.keys(it.set).every((field) => Object.hasOwn(definitions[type], field));
};

export const isSnapshotStatement = (it: unknown): it is SnapshotStatement => {
	const type = (it as { type?: unknown } | null)?.type;
	if (typeof type !== 'string') return false;
	if (Object.hasOwn(snapshotStatementSchemas, type)) {
		return snapshotStatementSchemas[type as keyof typeof snapshotStatementSchemas].safeParse(it).success;
	}
	return statementTypes.has(type);
};

// Every snapshot stores the statements of its own migration, in the order of the SQL.
const statements = array<SnapshotStatement>(isSnapshotStatement);

const baseValidator = validator({
	type: ['base'],
	version: ['9'],
	dialect: ['postgres'],
	id: 'string',
	prevIds: array<string>((it) => typeof it === 'string'),
	ddl: array<PostgresEntity>((it) => {
		const res = ddl.entities.validate(it);
		if (!res) {
			console.error(JSON.stringify(it));
		}
		return res;
	}),
	statements,
	stateHash: 'string',
});

const diffValidator = validator({
	type: ['diff'],
	version: ['9'],
	dialect: ['postgres'],
	id: 'string',
	prevIds: array<string>((it) => typeof it === 'string'),
	deltas: array<Delta>(isDelta),
	statements,
	stateHash: 'string',
});

export type PostgresBaseSnapshot = typeof baseValidator.shape;
export type PostgresDiffSnapshot = typeof diffValidator.shape;
export type PostgresSnapshot = PostgresBaseSnapshot | PostgresDiffSnapshot;

// The programmatic API returns a schema state: a full state with an id and parents. It is not a snapshot,
// and a migrations folder never holds one.
export type PostgresSchemaState = {
	version: '9';
	dialect: 'postgres';
	id: string;
	prevIds: string[];
	ddl: PostgresEntity[];
};

export const snapshotValidator = {
	parse: (it: unknown) => {
		if ((it as { type?: unknown } | null)?.type !== 'diff') {
			const res = baseValidator.parse(it);
			// A full state in the middle of a history would bring back rows that a merge replay already dropped.
			if (res.data?.prevIds.some((id) => id !== originUUID)) {
				return { success: false, data: null, errors: ["Field 'prevIds' of a base snapshot must not list a parent"] };
			}
			return res;
		}
		const res = diffValidator.parse(it);
		// A diff snapshot is rebuilt from its first parent, so it must have one.
		if (res.data?.prevIds.length === 0) {
			return {
				success: false,
				data: null,
				errors: ["Field 'prevIds' of a diff snapshot must list at least one parent"],
			};
		}
		return res;
	},
};

const canonical = (value: unknown): unknown => {
	if (Array.isArray(value)) return value.map(canonical);
	if (value === null || typeof value !== 'object') return value;
	return Object.fromEntries(
		Object.entries(value)
			.filter(([, it]) => it !== null && it !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([field, it]) => [field, canonical(it)]),
	);
};

// The hash of a state, as a snapshot stores it in `stateHash`. It reads the canonical form of the state: the
// rows in the order of their keys and the fields in the order of their names, both by code unit, with no null
// fields. A locale-aware order differs between machines. Without the null fields, a new optional field of an
// entity does not change the hash of a state that was written before that field existed.
export const stateHash = (state: AnyDDL): string => {
	const rows = state.entities.list()
		.map((row) => [`${row.entityType}\0${state.key(row.entityType, row)}`, row] as const)
		.sort(([a], [b]) => (a < b ? -1 : 1));
	const hash = createHash('sha256');
	for (const [, row] of rows) hash.update(`${JSON.stringify(canonical(row))}\n`);
	return hash.digest('hex');
};

const entityName = (json: string) => {
	const row = JSON.parse(json);
	return `${row.entityType} ${[row.schema, row.table, row.name].filter(Boolean).join('.')}`;
};

// The first entity that is in only one of the two states, or that differs between them.
export const stateDifference = (expected: PostgresDDL, rebuilt: PostgresDDL): string | undefined => {
	const [a, b] = [normalizeDDL(expected.entities.list()), normalizeDDL(rebuilt.entities.list())];
	const [inA, inB] = [new Set(a), new Set(b)];
	const differing = a.find((it) => !inB.has(it)) ?? b.find((it) => !inA.has(it));
	return differing === undefined ? undefined : entityName(differing);
};

// generate calls this before it writes a snapshot. A hash does not help here, because the same run would
// compute it from the same wrong data.
export const assertDeltasRebuildState = (start: PostgresDDL, deltas: Delta[], expected: PostgresDDL) => {
	const entity = stateDifference(expected, apply(start, deltas));
	if (entity === undefined) return;
	throw new Error(
		`The deltas of the new migration do not rebuild the schema: ${entity} differs. Nothing was written. `
			+ 'This is a bug in drizzle-kit. Report it at https://github.com/drizzle-team/drizzle-orm/issues.',
	);
};

export const toJsonSnapshot = (
	ddl: PostgresDDL,
	prevIds: string[],
	statements: SnapshotStatement[],
): PostgresBaseSnapshot => {
	return {
		type: 'base',
		version: '9',
		dialect: 'postgres',
		id: randomUUID(),
		prevIds,
		statements,
		ddl: ddl.entities.list(),
		stateHash: stateHash(ddl),
	};
};

export const drySnapshot: PostgresBaseSnapshot = {
	type: 'base',
	version: '9',
	dialect: 'postgres',
	id: originUUID,
	prevIds: [],
	statements: [],
	ddl: [],
	stateHash: stateHash(createDDL()),
};

// The folder loader and reconstruct report a broken history with the same messages.
export const missingParentMessage = (snapshot: string, parentId: string) =>
	`Cannot rebuild snapshot ${snapshot}: snapshot ${parentId} is missing from the migrations folder. `
	+ `Restore the missing migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

export const missingBaseMessage = (snapshot: string) =>
	`Cannot rebuild snapshot ${snapshot}: its history does not reach a base snapshot. `
	+ `Restore the first migration folder from git, or delete ${snapshot} and every later migration, then run generate again.`;

export const stateHashMessage = (snapshot: string) =>
	`Cannot rebuild snapshot ${snapshot}: the rebuilt state differs from the state that the snapshot recorded. `
	+ `A snapshot.json in the history of ${snapshot} was edited by hand, or this drizzle-kit version rebuilds the `
	+ 'history in another way than the version that wrote it. Restore the migration folders from git. If they are '
	+ 'unchanged, use the drizzle-kit version that wrote them, and report this issue at '
	+ 'https://github.com/drizzle-team/drizzle-orm/issues.';

export class StateHashError extends Error {
	constructor(readonly snapshotId: string) {
		super(stateHashMessage(snapshotId));
	}
}

// The replay code is part of the format. This check turns a rebuild that gives another state than the one
// that the snapshot recorded into an error. One hash reads the whole state, so only the snapshot that a
// command asks for and the first parent of each merge are checked, and no other snapshot of the history.
const assertStateHash = (state: PostgresDDL, snapshot: PostgresSnapshot) => {
	if (snapshot.stateHash !== stateHash(state)) throw new StateHashError(snapshot.id);
};

// `child` is the snapshot that lists `id` as a parent.
const lookup = (snapshots: Map<string, PostgresSnapshot>, id: string, child?: string): PostgresSnapshot => {
	const snapshot = snapshots.get(id);
	if (snapshot) return snapshot;
	throw new Error(
		child
			? missingParentMessage(child, id)
			: `Cannot rebuild snapshot ${id}: it is not in the migrations folder. Check the snapshot id, or restore the migration folder from git.`,
	);
};

// The walk stops at ids in `known`.
const historyOf = (
	snapshots: Map<string, PostgresSnapshot>,
	ids: string[],
	child?: string,
	known = new Set<string>(),
): Set<string> => {
	const found = new Set<string>();
	const stack = ids.map((id) => [id, child] as const);
	while (stack.length) {
		const [id, childId] = stack.pop()!;
		if (id === originUUID || found.has(id) || known.has(id)) continue;
		found.add(id);
		for (const parentId of lookup(snapshots, id, childId).prevIds) stack.push([parentId, id]);
	}
	return found;
};

// Adds to the first parent's state the snapshots that reach a merge only through its other parents.
// This replay skips a drop, alter or rename of a missing row, and applyInPlace alone would throw for it. An
// instruction always runs, and it changes the rows that match at that moment, so a rename of one branch also
// reaches the rows that another branch added or renamed. A create onto a taken key overwrites the row
// there. A rename or an instruction that moves a row onto a taken key throws, as in every applyInPlace
// call. A base adds its rows as creates, because two branches that each started from an empty folder share
// no ancestor.
const combineInPlace = (
	state: PostgresDDL,
	snapshots: Map<string, PostgresSnapshot>,
	prevIds: string[],
	child?: string,
) => {
	const [first, ...others] = prevIds;
	const replayed = historyOf(snapshots, others, child, historyOf(snapshots, [first], child));
	for (const [id, snapshot] of snapshots) {
		if (!replayed.has(id)) continue;
		const deltas: Delta[] = snapshot.type === 'diff'
			? snapshot.deltas
			: snapshot.ddl.map((row) => ({ op: 'create', row }));
		for (const it of deltas) {
			if (!('key' in it) || findRow(state, it.key)) applyInPlace(state, [it]);
		}
	}
};

// `snapshots` must iterate in folder-name order, because a merge replays the other branches in that order.
export const reconstruct = (snapshots: Map<string, PostgresSnapshot>, id: string): PostgresDDL => {
	const chain: PostgresDiffSnapshot[] = [];
	let snapshot = lookup(snapshots, id);
	while (snapshot.type === 'diff') {
		chain.push(snapshot);
		const parentId = snapshot.prevIds[0];
		// A chain longer than the history means the first parents form a cycle.
		if (!parentId || parentId === originUUID || chain.length > snapshots.size) {
			throw new Error(missingBaseMessage(snapshot.id));
		}
		snapshot = lookup(snapshots, parentId, snapshot.id);
	}
	const state = fromEntities(snapshot.ddl);
	for (let idx = chain.length - 1; idx >= 0; idx--) {
		const it = chain[idx];
		if (it.prevIds.length > 1) {
			// The merge replay skips deltas that do not fit, so a wrong state of the first parent would stay hidden.
			assertStateHash(state, chain[idx + 1] ?? snapshot);
			combineInPlace(state, snapshots, it.prevIds, it.id);
		}
		applyInPlace(state, it.deltas);
	}
	assertStateHash(state, chain[0] ?? snapshot);
	return state;
};

// The state that the deltas of a snapshot with these parents start from. `snapshots` must iterate in
// folder-name order, as for reconstruct.
export const startingState = (snapshots: Map<string, PostgresSnapshot>, prevIds: string[]): PostgresDDL => {
	if ((prevIds[0] ?? originUUID) === originUUID) return createDDL();
	const state = reconstruct(snapshots, prevIds[0]);
	if (prevIds.length > 1) combineInPlace(state, snapshots, prevIds);
	return state;
};
