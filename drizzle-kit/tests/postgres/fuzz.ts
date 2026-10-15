// This file holds the generators and the runner for the property tests in `fuzz.test.ts`. `checkProperty` runs
// a check on cases from a seeded random generator and reduces the first failing case to a smaller one that still
// fails. `generateHistory` builds a random migration history with forks, merges and custom migrations over a
// model of postgres entities. `toSchema` turns a model into a drizzle schema, and `runHistory` drives a history
// through the real `generate` command with rename hints.
import { sql } from 'drizzle-orm';
import {
	boolean,
	check,
	foreignKey,
	index,
	integer,
	pgEnum,
	pgPolicy,
	pgRole,
	pgSchema,
	pgSequence,
	pgTable,
	pgView,
	primaryKey,
	text,
	unique,
	uniqueIndex,
	varchar,
} from 'drizzle-orm/pg-core';
import { basename, dirname } from 'path';
import { CheckCliError, InvalidHintsCliError } from 'src/cli/errors';
import type { Hint } from 'src/cli/hints';
import { interimToDDL, type PostgresDDL, type Privilege } from 'src/dialects/postgres/ddl';
import { fromDrizzleSchema, fromExports } from 'src/dialects/postgres/drizzle';
import { createFolderFlow, type FolderFlow, rename } from './folder-flow';
import type { PostgresSchema } from './mocks';

export type Random = {
	int: (max: number) => number;
	pick: <T>(items: readonly T[]) => T;
	chance: (probability: number) => boolean;
};

// A seeded random generator (mulberry32), so that one seed gives the same cases on every machine.
const createRandom = (seed: number): Random => {
	let state = seed >>> 0;
	const next = () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
	const int = (max: number) => Math.floor(next() * max);
	return { int, pick: (items) => items[int(items.length)]!, chance: (probability) => next() < probability };
};

const parseSeed = (value: string | undefined) => {
	if (!value) return 20260928;
	if (value === 'random') return Math.floor(Math.random() * 2 ** 32);
	const seed = Number(value);
	if (!Number.isInteger(seed) || seed < 0) {
		throw new Error(`FUZZ_SEED is "${value}". Set it to a non-negative integer or to "random".`);
	}
	return seed;
};

const parseRuns = (value: string | undefined) => {
	if (!value) return;
	const runs = Number(value);
	if (!Number.isInteger(runs) || runs < 1) throw new Error(`FUZZ_RUNS is "${value}". Set it to a positive integer.`);
	return runs;
};

const firstSeed = parseSeed(process.env['FUZZ_SEED']);
const runsFromEnv = parseRuns(process.env['FUZZ_RUNS']);
const maxShrinkAttempts = 200;

const failureOf = async <T>(check: (value: T) => Promise<void>, value: T): Promise<Error | undefined> => {
	try {
		await check(value);
	} catch (e) {
		return e instanceof Error ? e : new Error(String(e));
	}
};

// Adds the compared values to the failure message, because the message of an assertion error does not show
// them. For two arrays, it lists only the missing and the unexpected items.
const describeFailure = (error: Error & { actual?: unknown; expected?: unknown }) => {
	const { actual, expected } = error;
	if (!Array.isArray(actual) || !Array.isArray(expected)) {
		return 'actual' in error
			? `${error.message}\nActual: ${JSON.stringify(actual)}\nExpected: ${JSON.stringify(expected)}`
			: error.message;
	}
	const missing = expected.filter((it) => !actual.includes(it));
	const unexpected = actual.filter((it) => !expected.includes(it));
	return `${error.message}\nMissing: ${JSON.stringify(missing, null, 2)}\nUnexpected: ${
		JSON.stringify(unexpected, null, 2)
	}`;
};

// Runs `check` on generated cases and reduces the first failing case with `shrink` before it throws. Case
// number n uses seed firstSeed + n, so FUZZ_SEED=<that seed> FUZZ_RUNS=1 repeats one failing case.
export const checkProperty = async <T>(property: {
	runs: number;
	generate: (random: Random) => T;
	shrink: (value: T) => T[];
	check: (value: T) => Promise<void>;
}) => {
	for (let run = 0; run < (runsFromEnv ?? property.runs); run++) {
		const seed = (firstSeed + run) >>> 0;
		let value = property.generate(createRandom(seed));
		let error = await failureOf(property.check, value);
		if (!error) continue;
		// Replaces `value` with the first smaller candidate that still fails, until no candidate fails or the
		// attempts run out.
		let attempts = 0;
		for (let isReduced = true; isReduced && attempts < maxShrinkAttempts;) {
			isReduced = false;
			for (const candidate of property.shrink(value)) {
				if (attempts++ >= maxShrinkAttempts) break;
				const candidateError = await failureOf(property.check, candidate);
				if (!candidateError) continue;
				[value, error, isReduced] = [candidate, candidateError, true];
				break;
			}
		}
		throw new Error(
			`The property fails for seed ${seed}. Run FUZZ_SEED=${seed} FUZZ_RUNS=1 to repeat this case.\n`
				+ `Reduced case:\n${JSON.stringify(value, null, 2)}\n\n${describeFailure(error)}`,
		);
	}
};

export const withoutOne = <T>(items: T[]): T[][] => items.map((_, idx) => items.filter((__, other) => other !== idx));

const kinds = [
	'schemas',
	'roles',
	'enums',
	'sequences',
	'tables',
	'columns',
	'indexes',
	'pks',
	'uniques',
	'fks',
	'checks',
	'policies',
	'views',
	'privileges',
] as const;
export type Kind = (typeof kinds)[number];
const inSchema = new Set<Kind>(['enums', 'sequences', 'tables', 'views']);

// One entity of the fuzz model. Entities refer to each other by id, which starts at 1, so a rename changes
// one field. A null `schemaId` means the public schema, and a null `name` means that drizzle-kit generates
// the name. A privilege has no name and keeps its type in `value`.
export type Entity = {
	id: number;
	name: string | null;
	schemaId?: number | null;
	tableId?: number;
	type?: 'integer' | 'text' | 'varchar' | 'boolean' | 'enum';
	enumId?: number;
	notNull?: boolean;
	hasDefault?: boolean;
	values?: string[];
	increment?: number;
	columns?: number[];
	isUnique?: boolean;
	tableTo?: number;
	columnsTo?: number[];
	value?: string;
	roleId?: number;
	isGrantable?: boolean;
	canCreateDb?: boolean;
};

export type Model = Record<Kind, Entity[]>;

export type Op =
	| { type: 'add'; kind: Kind; entity: Entity }
	| { type: 'change'; kind: Kind; id: number; patch: Partial<Entity>; isDecision?: boolean }
	| { type: 'drop'; kind: Kind; id: number };

export const emptyModel = (): Model => Object.fromEntries(kinds.map((kind) => [kind, []])) as unknown as Model;

const isEmptyModel = (model: Model) => kinds.every((kind) => model[kind].length === 0);

const find = (model: Model, kind: Kind, id: number | undefined) => model[kind].find((it) => it.id === id);

const applyOp = (model: Model, op: Op): Model => {
	const rows = model[op.kind];
	if (op.type === 'add') {
		return rows.some((it) => it.id === op.entity.id)
			? model
			: { ...model, [op.kind]: [...rows, op.entity] };
	}
	if (op.type === 'drop') return { ...model, [op.kind]: rows.filter((it) => it.id !== op.id) };
	return { ...model, [op.kind]: rows.map((it) => (it.id === op.id ? { ...it, ...op.patch } : it)) };
};

const firstByKey = (rows: Entity[], key: (it: Entity) => string) => {
	const seen = new Set<string>();
	return rows.filter((it) => {
		if (seen.has(key(it))) return false;
		seen.add(key(it));
		return true;
	});
};

// Makes a model valid after an op. It removes the entities that lost their schema, table or columns, and
// keeps only the first of two entities with one identity.
const sanitize = (model: Model): Model => {
	const schemas = firstByKey(model.schemas, (it) => it.name!);
	const schemaIds = new Set(schemas.map((it) => it.id));
	const isPlaced = (it: Entity) => !it.schemaId || schemaIds.has(it.schemaId);
	const bySchema = (it: Entity) => `${it.schemaId}.${it.name}`;
	const enums = firstByKey(model.enums.filter(isPlaced), bySchema);
	const tables = firstByKey(model.tables.filter(isPlaced), bySchema);
	const enumIds = new Set(enums.map((it) => it.id));
	const tableIds = new Set(tables.map((it) => it.id));
	const byTable = (it: Entity) => (it.name === null ? `${it.id}` : `${it.tableId}.${it.name}`);
	const columns = firstByKey(model.columns.filter((it) => tableIds.has(it.tableId!)), byTable).map((it) => {
		if (it.type !== 'enum' || enumIds.has(it.enumId!)) return it;
		const { enumId: _, ...rest } = it;
		return { ...rest, type: 'text' as const };
	});
	const tableOf = new Map(columns.map((it) => [it.id, it.tableId]));
	const isOn = (tableId: number | undefined, ids: number[] | undefined) =>
		!!ids?.length && ids.every((id) => tableOf.get(id) === tableId);
	const onColumns = (it: Entity) => isOn(it.tableId, it.columns);
	const onTable = (it: Entity) => tableIds.has(it.tableId!);
	return {
		schemas,
		enums,
		sequences: firstByKey(model.sequences.filter(isPlaced), bySchema),
		tables,
		columns,
		indexes: firstByKey(model.indexes.filter(onColumns), byTable),
		pks: firstByKey(model.pks.filter(onColumns), (it) => `${it.tableId}`),
		uniques: firstByKey(model.uniques.filter(onColumns), byTable),
		fks: firstByKey(
			model.fks.filter((it) =>
				onColumns(it) && isOn(it.tableTo, it.columnsTo) && it.columns!.length === it.columnsTo!.length
			),
			byTable,
		),
		checks: firstByKey(model.checks.filter(onTable), byTable),
		policies: firstByKey(model.policies.filter(onTable), byTable),
		roles: firstByKey(model.roles, (it) => it.name!),
		views: firstByKey(model.views.filter((it) => isPlaced(it) && onTable(it)), bySchema),
		privileges: firstByKey(
			model.privileges.filter((it) => onTable(it) && model.roles.some((role) => role.id === it.roleId)),
			(it) => `${it.tableId}.${it.roleId}.${it.value}`,
		),
	};
};

const defaults = { integer: 1, text: 'a', varchar: 'a', boolean: true } as const;
const builders = { integer, text, varchar, boolean } as const;

export const toSchema = (model: Model): PostgresSchema => {
	const exports: PostgresSchema = {};
	const schemas = new Map(model.schemas.map((it) => [it.id, pgSchema(it.name!)]));
	for (const [id, it] of schemas) exports[`schema${id}`] = it;
	const namespace = (schemaId?: number | null) => (schemaId ? schemas.get(schemaId) : undefined);

	const enums = new Map<number, any>();
	for (const it of model.enums) {
		const values = it.values as [string, ...string[]];
		const enumType = namespace(it.schemaId)?.enum(it.name!, values) ?? pgEnum(it.name!, values);
		enums.set(it.id, enumType);
		exports[`enum${it.id}`] = enumType;
	}
	for (const it of model.sequences) {
		const config = { increment: it.increment };
		exports[`sequence${it.id}`] = namespace(it.schemaId)?.sequence(it.name!, config) ?? pgSequence(it.name!, config);
	}

	const columnName = new Map(model.columns.map((it) => [it.id, it.name!]));
	const tables = new Map<number, any>();
	const columnsOf = (tableId: number, ids: number[]) => ids.map((id) => tables.get(tableId)[columnName.get(id)!]);
	for (const table of model.tables) {
		const own = (kind: Kind) => model[kind].filter((it) => it.tableId === table.id);
		const columns = Object.fromEntries(
			own('columns').map((it) => {
				let column: any = it.type === 'enum' ? enums.get(it.enumId!)(it.name) : builders[it.type!](it.name!);
				if (it.notNull) column = column.notNull();
				if (it.hasDefault) {
					column = column.default(
						it.type === 'enum' ? find(model, 'enums', it.enumId)!.values![0] : defaults[it.type!],
					);
				}
				return [it.name!, column];
			}),
		);
		// `extra` is a function because drizzle calls it after every table exists, so a foreign key can reach any
		// table in `tables`.
		const extra = (): any[] => [
			...own('pks').map((it) =>
				primaryKey({ name: it.name ?? undefined, columns: columnsOf(table.id, it.columns!) as [any] })
			),
			...own('indexes').map((it) =>
				(it.isUnique ? uniqueIndex : index)(it.name!).on(...(columnsOf(table.id, it.columns!) as [any]))
			),
			...own('uniques').map((it) => unique(it.name ?? undefined).on(...(columnsOf(table.id, it.columns!) as [any]))),
			...own('fks').map((it) =>
				foreignKey({
					name: it.name ?? undefined,
					columns: columnsOf(table.id, it.columns!) as [any],
					foreignColumns: columnsOf(it.tableTo!, it.columnsTo!) as [any],
				})
			),
			...own('checks').map((it) => check(it.name!, sql.raw(it.value!))),
			...own('policies').map((it) => pgPolicy(it.name!, { as: 'permissive', using: sql.raw(it.value!) })),
		];
		const built = namespace(table.schemaId)?.table(table.name!, columns, extra) ?? pgTable(table.name!, columns, extra);
		tables.set(table.id, built);
		exports[`table${table.id}`] = built;
	}
	for (const it of model.roles) exports[`role${it.id}`] = pgRole(it.name!, { createDb: it.canCreateDb });
	for (const it of model.views) {
		const query = sql`select ${sql.raw(it.value!)} as "a" from ${tables.get(it.tableId!)}`;
		const columns = { a: integer() };
		exports[`view${it.id}`] = (namespace(it.schemaId)?.view(it.name!, columns) ?? pgView(it.name!, columns)).as(query);
	}
	return exports;
};

// Adds the privileges of the model to the DDL, because a drizzle schema cannot declare grants.
const addPrivileges = (ddl: PostgresDDL, model: Model) => {
	for (const it of model.privileges) {
		const [schema, table] = identityOf(model, 'tables', find(model, 'tables', it.tableId)!);
		ddl.privileges.push({
			grantor: 'postgres',
			grantee: find(model, 'roles', it.roleId)!.name!,
			schema: schema!,
			table: table!,
			type: it.value as Privilege['type'],
			isGrantable: !!it.isGrantable,
		});
	}
	return ddl;
};

// Builds the DDL of a model, or returns null when drizzle-kit rejects its schema, so that the generators skip
// that change.
export const toDDL = (model: Model): PostgresDDL | null => {
	try {
		const { schema, errors } = fromDrizzleSchema(fromExports(toSchema(model)), () => true);
		const { ddl, errors: ddlErrors } = interimToDDL(schema);
		return errors.length === 0 && ddlErrors.length === 0 ? addPrivileges(ddl, model) : null;
	} catch {
		return null;
	}
};

// Applies `ops` to a model and skips an op that leaves an invalid schema, so that a shrunk case stays valid.
export const applyOps = (model: Model, ops: Op[]): Model =>
	ops.reduce((current, op) => {
		const next = sanitize(applyOp(current, op));
		return toDDL(next) ? next : current;
	}, model);

// The model that a merge starts from. It keeps the version of each entity from the first model, which belongs
// to the first parent, and adds what only the other models have.
const unionOf = ([primary, ...others]: Model[]): Model => {
	const union = Object.fromEntries(kinds.map((kind) => {
		const rows = [...primary![kind]];
		const ids = new Set(rows.map((it) => it.id));
		for (const it of others.flatMap((other) => other[kind])) {
			if (ids.has(it.id)) continue;
			rows.push(it);
			ids.add(it.id);
		}
		return [kind, rows];
	})) as unknown as Model;
	const sane = sanitize(union);
	return toDDL(sane) ? sane : primary!;
};

const identityOf = (model: Model, kind: Kind, entity: Entity): string[] => {
	if (kind === 'schemas' || kind === 'roles') return [entity.name!];
	if (inSchema.has(kind)) {
		return [entity.schemaId ? find(model, 'schemas', entity.schemaId)!.name! : 'public', entity.name!];
	}
	return [...identityOf(model, 'tables', find(model, 'tables', entity.tableId)!), entity.name!];
};

const isSame = (a: string[], b: string[]) => a.length === b.length && a.every((it, idx) => it === b[idx]);

// A rename that the test resolves with a hint. `oldIdentity` is the identity in `before`, with the old names
// of the parents.
type RenameDecision = { kind: Kind; from: string[]; to: string[]; oldIdentity: string[] };

// Lists the renames in `ops` that get a rename hint. ddlDiff resolves the renames of the parents first, so
// `from` holds the new names of the parents. An entity whose parent was dropped, or renamed without a
// decision, gets no decision.
export const renameDecisions = (before: Model, after: Model, ops: Op[]): RenameDecision[] => {
	const decided = new Map<string, [Kind, number]>();
	for (const op of ops) {
		if (op.type !== 'change' || !('name' in op.patch || 'schemaId' in op.patch)) continue;
		if (op.isDecision) decided.set(`${op.kind}:${op.id}`, [op.kind, op.id]);
		else decided.delete(`${op.kind}:${op.id}`);
	}
	const parentPrefix = (kind: Kind, entity: Entity): string[] | null => {
		if (kind === 'schemas' || kind === 'roles') return [];
		if (!inSchema.has(kind)) return settled('tables', entity.tableId!);
		return entity.schemaId ? settled('schemas', entity.schemaId) : ['public'];
	};
	// The identity of a parent in `after`, or null when ddlDiff does not resolve the parent to that identity.
	const settled = (kind: Kind, id: number): string[] | null => {
		const old = find(before, kind, id);
		const later = find(after, kind, id);
		const prefix = old && later ? parentPrefix(kind, old) : null;
		if (!prefix) return null;
		const target = identityOf(after, kind, later!);
		return isSame([...prefix, old!.name!], target) || decided.has(`${kind}:${id}`) ? target : null;
	};
	return [...decided.values()].flatMap(([kind, id]) => {
		const old = find(before, kind, id);
		const later = find(after, kind, id);
		const prefix = old && later ? parentPrefix(kind, old) : null;
		if (!prefix) return [];
		const from = [...prefix, old!.name!];
		const to = identityOf(after, kind, later!);
		return isSame(from, to) ? [] : [{ kind, from, to, oldIdentity: identityOf(before, kind, old!) }];
	});
};

const hintKinds = {
	schemas: 'schema',
	enums: 'enum',
	sequences: 'sequence',
	tables: 'table',
	columns: 'column',
	indexes: 'index',
	pks: 'primary_key',
	uniques: 'unique',
	fks: 'foreign key',
	checks: 'check',
	policies: 'policy',
	roles: 'role',
	views: 'view',
} as const;

// Turns a decision into a rename hint. Privileges have no name, so they never get a decision, and no name of
// a model has a dot in it.
const toHint = ({ kind, from, to }: RenameDecision) =>
	rename(hintKinds[kind as keyof typeof hintKinds], from.join('.'), to.join('.'));

// Writes a decision in the format that mockResolver and the `renames` field of format 8 use.
export const toRenameString = ({ from, to }: RenameDecision) => `${from.join('.')}->${to.join('.')}`;

const prefixes: Record<Kind, string> = {
	schemas: 's',
	enums: 'e',
	sequences: 'q',
	tables: 't',
	columns: 'c',
	indexes: 'i',
	pks: 'p',
	uniques: 'u',
	fks: 'f',
	checks: 'k',
	policies: 'y',
	roles: 'r',
	views: 'v',
	privileges: 'g',
};

type Context = { random: Random; nextId: () => number; nextName: (kind: Kind) => string };

const columnTypes = ['integer', 'text', 'varchar', 'boolean'] as const;

const addOps = (ctx: Context, model: Model): Op[] => {
	const { random, nextId, nextName } = ctx;
	const add = (
		kind: Kind,
		entity: Omit<Entity, 'id' | 'name'>,
		name: string | null = nextName(kind),
	): Extract<Op, { type: 'add' }> => ({
		type: 'add',
		kind,
		entity: { id: nextId(), name, ...entity },
	});
	const schemaId = () => (model.schemas.length && random.chance(0.5) ? random.pick(model.schemas).id : null);
	const column = (tableId: number) => {
		const type = random.pick(model.enums.length ? [...columnTypes, 'enum' as const] : columnTypes);
		return add('columns', {
			tableId,
			type,
			...(type === 'enum' && { enumId: random.pick(model.enums).id }),
			notNull: random.chance(0.3),
			hasDefault: random.chance(0.3),
		});
	};
	const withColumns = model.tables.filter((table) => model.columns.some((it) => it.tableId === table.id));
	const someColumns = (tableId: number) => {
		const own = model.columns.filter((it) => it.tableId === tableId).map((it) => it.id);
		const first = random.pick(own);
		const second = random.pick(own);
		return random.chance(0.3) && second !== first ? [first, second] : [first];
	};
	// Tables and columns come more often, because most other entities need them.
	const kind = random.pick<Kind>(
		withColumns.length
			? [...kinds, 'tables', 'columns', 'columns']
			: ['schemas', 'roles', 'enums', 'sequences', 'tables', 'tables'],
	);
	if (kind === 'schemas') return [add('schemas', {})];
	if (kind === 'roles') return [add('roles', { canCreateDb: random.chance(0.3) })];
	if (kind === 'enums') return [add('enums', { schemaId: schemaId(), values: ['v1', 'v2'] })];
	if (kind === 'sequences') return [add('sequences', { schemaId: schemaId(), increment: 1 })];
	if (kind === 'tables') {
		const table = add('tables', { schemaId: schemaId() });
		return [table, column(table.entity.id), ...(random.chance(0.5) ? [column(table.entity.id)] : [])];
	}
	if (kind === 'columns') return model.tables.length ? [column(random.pick(model.tables).id)] : [];
	const tableId = random.pick(withColumns).id;
	const isNamed = random.chance(0.5);
	switch (kind) {
		case 'indexes':
			return [add('indexes', { tableId, columns: someColumns(tableId), isUnique: random.chance(0.3) })];
		case 'pks':
			return [add('pks', { tableId, columns: someColumns(tableId) }, isNamed ? nextName('pks') : null)];
		case 'uniques':
			return [add('uniques', { tableId, columns: someColumns(tableId) }, isNamed ? nextName('uniques') : null)];
		case 'fks': {
			const tableTo = random.pick(withColumns).id;
			const columnsTo = someColumns(tableTo).slice(0, 1);
			return [
				add(
					'fks',
					{ tableId, columns: someColumns(tableId).slice(0, 1), tableTo, columnsTo },
					isNamed ? nextName('fks') : null,
				),
			];
		}
		case 'checks':
			return [add('checks', { tableId, value: random.pick(['1 > 0', '2 > 1']) })];
		case 'views':
			return [add('views', { schemaId: schemaId(), tableId, value: random.pick(['1', '2']) })];
		case 'privileges': {
			const role = model.roles.length ? [] : [add('roles', {})];
			const roleId = role[0]?.entity.id ?? random.pick(model.roles).id;
			const type = random.pick(['SELECT', 'INSERT', 'UPDATE']);
			return [...role, add('privileges', { tableId, roleId, value: type, isGrantable: random.chance(0.3) }, null)];
		}
		default:
			return [add('policies', { tableId, value: random.pick(['true', 'false']) })];
	}
};

const renameOp = (ctx: Context, model: Model): Op[] => {
	const { random } = ctx;
	const renamable = kinds.filter((kind) => model[kind].some((it) => it.name !== null));
	if (!renamable.length) return [];
	const kind = random.pick(renamable);
	const entity = random.pick(model[kind].filter((it) => it.name !== null));
	const isDecision = random.chance(0.7);
	if ((kind === 'tables' || kind === 'views') && random.chance(0.3)) {
		const targets = [null, ...model.schemas.map((it) => it.id)].filter((it) => it !== (entity.schemaId ?? null));
		if (targets.length) {
			return [{ type: 'change', kind, id: entity.id, patch: { schemaId: random.pick(targets) }, isDecision }];
		}
	}
	return [{ type: 'change', kind, id: entity.id, patch: { name: ctx.nextName(kind) }, isDecision }];
};

const alterOp = ({ random }: Context, model: Model): Op[] => {
	const alterable: Kind[] = [
		'enums',
		'sequences',
		'columns',
		'indexes',
		'checks',
		'policies',
		'roles',
		'views',
		'privileges',
	];
	const choices = alterable.filter((kind) => model[kind].length);
	if (!choices.length) return [];
	const kind = random.pick(choices);
	const entity = random.pick(model[kind]);
	const change = (patch: Partial<Entity>): Op[] => [{ type: 'change', kind, id: entity.id, patch }];
	switch (kind) {
		case 'enums':
			return change({ values: [...entity.values!, `v${entity.values!.length + 1}`] });
		case 'sequences':
			return change({ increment: entity.increment! + 1 + random.int(3) });
		case 'indexes':
			return change({ isUnique: !entity.isUnique });
		case 'checks':
			return change({ value: entity.value === '1 > 0' ? '2 > 1' : '1 > 0' });
		case 'policies':
			return change({ value: entity.value === 'true' ? 'false' : 'true' });
		case 'roles':
			return change({ canCreateDb: !entity.canCreateDb });
		case 'views':
			return change({ value: entity.value === '1' ? '2' : '1' });
		case 'privileges':
			return change({ isGrantable: !entity.isGrantable });
		default: {
			const roll = random.int(3);
			if (roll === 0) return change({ notNull: !entity.notNull });
			if (roll === 1) return change({ hasDefault: !entity.hasDefault });
			const types = [...columnTypes, ...(model.enums.length ? ['enum' as const] : [])].filter((it) =>
				it !== entity.type
			);
			const type = random.pick(types);
			return change({ type, enumId: type === 'enum' ? random.pick(model.enums).id : undefined });
		}
	}
};

const dropOp = ({ random }: Context, model: Model): Op[] => {
	const choices = kinds.filter((kind) => model[kind].length);
	if (!choices.length) return [];
	const kind = random.pick(choices);
	return [{ type: 'drop', kind, id: random.pick(model[kind]).id }];
};

const nameNumbers = (model: Model) => kinds.flatMap((kind) => model[kind].map((it) => Number(it.name?.slice(1) ?? 0)));

export const createIds = () => {
	let id = 0;
	return () => ++id;
};

// Generates up to `count` valid ops from `start`. New names are larger than every name in `seen`, so a
// rename never takes the name of an entity that the same migration drops. Forked branches reuse numbers, so
// two branches can create the same name.
export const generateOps = (
	random: Random,
	nextId: () => number,
	seen: Model[],
	start: Model,
	count: number,
): { ops: Op[]; model: Model } => {
	let number = Math.max(0, ...seen.flatMap(nameNumbers)) + 1;
	const ctx: Context = { random, nextId, nextName: (kind) => `${prefixes[kind]}${number++}` };
	let model = start;
	const ops: Op[] = [];
	for (let tries = 0; ops.length < count && tries < count * 5; tries++) {
		const roll = random.int(100);
		const maker = roll < 40 ? addOps : roll < 70 ? renameOp : roll < 85 ? alterOp : dropOp;
		for (const op of maker(ctx, model)) {
			const next = sanitize(applyOp(model, op));
			if (JSON.stringify(next) === JSON.stringify(model) || !toDDL(next)) continue;
			ops.push(op);
			model = next;
		}
	}
	return { ops, model };
};

export type Step =
	| { type: 'fork'; branch: string; from: string }
	| { type: 'generate'; branch: string; ops: Op[] }
	| { type: 'custom'; branch: string }
	| { type: 'merge'; branch: string; sources: string[]; ops: Op[] };

// Tracks the model of each branch. `merged` puts the branch that changed last first, because generate
// takes the newest leaf as the first parent.
const createBranches = () => {
	const models = new Map<string, Model>([['main', emptyModel()]]);
	const changedAt = new Map<string, number>([['main', 0]]);
	let clock = 0;
	return {
		models,
		fork: (branch: string, from: string) => {
			models.set(branch, models.get(from)!);
			changedAt.set(branch, changedAt.get(from)!);
		},
		set: (branch: string, model: Model) => {
			models.set(branch, model);
			changedAt.set(branch, ++clock);
		},
		merged: (branches: string[]) =>
			[...branches].sort((a, b) => changedAt.get(b)! - changedAt.get(a)!).map((it) => models.get(it)!),
	};
};

export const generateHistory = (random: Random, length: number): Step[] => {
	const nextId = createIds();
	const { models, fork, set, merged } = createBranches();
	// `held` has the indexes of the steps that each branch holds. A merge takes only the sources that hold a
	// step that the target does not hold, so that most merges have more than one leaf.
	const held = new Map<string, Set<number>>([['main', new Set()]]);
	const isAhead = (source: string, target: string) => [...held.get(source)!].some((it) => !held.get(target)!.has(it));
	const steps: Step[] = [];
	while (steps.length < length) {
		const branches = [...models.keys()];
		const branch = random.pick(branches);
		const model = models.get(branch)!;
		const roll = random.int(100);
		// A fork needs a model that is not empty. An empty model can mean an empty folder, because a step with
		// no SQL writes no migration. A fork of an empty folder gives a second base snapshot, which every command
		// refuses.
		if (!isEmptyModel(model) && roll < 20 && branches.length < 3) {
			const name = `b${branches.length}`;
			steps.push({ type: 'fork', branch: name, from: branch });
			fork(name, branch);
			held.set(name, new Set(held.get(branch)));
			continue;
		}
		if (roll < 45 && branches.length > 1) {
			const sources = branches.filter((it) => it !== branch && isAhead(it, branch));
			if (!sources.length) continue;
			const parents = merged([branch, ...sources]);
			const { ops, model: next } = generateOps(random, nextId, parents, unionOf(parents), 1 + random.int(3));
			steps.push({ type: 'merge', branch, sources, ops });
			set(branch, next);
			for (const source of sources) for (const it of held.get(source)!) held.get(branch)!.add(it);
		} else if (roll < 50 && steps.length > 0) {
			steps.push({ type: 'custom', branch });
			set(branch, model);
		} else {
			const { ops, model: next } = generateOps(random, nextId, [model], model, 1 + random.int(4));
			steps.push({ type: 'generate', branch, ops });
			set(branch, next);
		}
		held.get(branch)!.add(steps.length - 1);
	}
	return steps;
};

// The smaller histories that `checkProperty` tries for a failing history. Whole steps come first, because
// removing a step reduces a history faster than removing one op.
export const shrinkHistory = (steps: Step[]): Step[][] => [
	...withoutOne(steps),
	...steps.flatMap((step, idx) =>
		'ops' in step
			? withoutOne(step.ops).map((ops) => steps.map((it, other) => (other === idx ? { ...step, ops } : it)))
			: []
	),
];

// Replays the models of a history and calls `onStep` for each step. A shrunk history can lose a branch or the
// model of a fork, so a step on a missing branch and a fork of an empty model are skipped.
export const replayHistory = async (
	steps: Step[],
	onStep: (step: Step, start: Model, next: Model, sources: string[]) => Promise<void>,
) => {
	const { models, fork, set, merged } = createBranches();
	for (const step of steps) {
		if (step.type === 'fork') {
			const source = models.get(step.from);
			if (!source || isEmptyModel(source) || models.has(step.branch)) continue;
			fork(step.branch, step.from);
			await onStep(step, models.get(step.from)!, models.get(step.from)!, []);
			continue;
		}
		const before = models.get(step.branch);
		if (!before) continue;
		const sources = step.type === 'merge' ? step.sources.filter((it) => it !== step.branch && models.has(it)) : [];
		const start = sources.length ? unionOf(merged([step.branch, ...sources])) : before;
		const next = step.type === 'custom' ? start : applyOps(start, step.ops);
		set(step.branch, next);
		await onStep(step, start, next, sources);
	}
	return models;
};

type Written = { branch: string; model: Model; isCustom: boolean };

// Runs generate the way a user answers it: rename hints for the decisions, create hints for whatever
// generate still asks about, and --fix-conflicts when check reports a conflict.
const generateWithHints = async (
	flow: FolderFlow,
	branch: string,
	schema: PostgresSchema,
	decisions: RenameDecision[],
	isMerge: boolean,
) => {
	// `canDropRenames` allows dropping a rename hint, because the combined state of a merge can differ from the
	// model that the decisions come from.
	const canDropRenames = isMerge || flow.leaves(branch).length > 1;
	let renames = decisions;
	let creates: Hint[] = [];
	let fixConflicts = false;
	// Drops the rename hints for entities that the starting state of generate lacks, because generate rejects
	// them. Any other rejection fails the run. `start.key` gives the same identity as `identityOf` for every
	// renamable kind.
	const withoutMissingRenames = async (error: InvalidHintsCliError) => {
		const start = await flow.stateBeforeGenerate(branch);
		const missing = renames.filter(({ kind, oldIdentity }) =>
			!start.entities.list().some((row) =>
				row.entityType === kind && start.key(kind, row) === JSON.stringify(oldIdentity)
			)
		);
		const isRejected = (it: RenameDecision) =>
			toHint(it).kind === error.meta?.kind && JSON.stringify(it.from) === JSON.stringify(error.meta?.from);
		if (!missing.some(isRejected)) throw error;
		return renames.filter((it) => !missing.includes(it));
	};
	for (let attempt = 0; attempt < 4; attempt++) {
		try {
			const result = await flow.tryGenerate(branch, schema, {
				hints: [...renames.map(toHint), ...creates],
				fixConflicts,
			});
			if (result.status !== 'missing_hints') {
				return 'migration_path' in result ? basename(dirname(result.migration_path)) : undefined;
			}
			creates = [
				...creates,
				...result.unresolved.map((it) => {
					if (it.type !== 'rename_or_create') {
						throw new Error(`generate asks for an unexpected hint: ${JSON.stringify(it)}`);
					}
					return { type: 'create', kind: it.kind, entity: it.entity } as Hint;
				}),
			];
		} catch (e) {
			if (e instanceof CheckCliError && e.meta?.kind === 'conflicts' && !fixConflicts) fixConflicts = true;
			else if (e instanceof InvalidHintsCliError && canDropRenames) renames = await withoutMissingRenames(e);
			else throw e;
		}
	}
	throw new Error(`generate on branch ${branch} still asks for hints after 4 attempts.`);
};

// Drives a history through the real generate handler. `written` maps every migration folder to the model
// that its generate call got.
export const runHistory = async (steps: Step[]) => {
	const flow = createFolderFlow();
	const written = new Map<string, Written>();
	const models = await replayHistory(steps, async (step, start, next, sources) => {
		if (step.type === 'fork') return flow.branch(step.branch, step.from);
		if (step.type === 'custom') {
			if (flow.leaves(step.branch).length !== 1) return;
			const { folder } = await flow.generate(step.branch, toSchema(start), { custom: true });
			written.set(folder, { branch: step.branch, model: start, isCustom: true });
			return;
		}
		flow.merge(step.branch, ...sources);
		const decisions = renameDecisions(start, next, step.ops);
		const isMerge = sources.length > 0;
		const folder = await generateWithHints(flow, step.branch, toSchema(next), decisions, isMerge);
		if (folder) written.set(folder, { branch: step.branch, model: next, isCustom: false });
	});
	return { flow, branches: [...models.keys()], written };
};
