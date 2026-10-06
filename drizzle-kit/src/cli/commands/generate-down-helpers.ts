import type { JsonStatement as CockroachJsonStatement } from '../../dialects/cockroach/statements';
import type { Resolver } from '../../dialects/common';
import type { JsonStatement as MssqlJsonStatement } from '../../dialects/mssql/statements';
import type { JsonStatement as MysqlJsonStatement } from '../../dialects/mysql/statements';
import type { JsonStatement as PostgresJsonStatement } from '../../dialects/postgres/statements';
import type { JsonStatement as SqliteJsonStatement } from '../../dialects/sqlite/statements';
import type { RenameCreateHintKind } from '../hints';

type Named = { name: string; schema?: string; table?: string };
export type Renames<T extends Named = Named> = { from: T; to: T }[];

export type ResolverFor = <T extends Named>(kind: RenameCreateHintKind) => Resolver<T>;

export type RenameScope = { schemas?: Renames; tables?: Renames };

function entityKey(e: Named): string {
	const schema = e.schema ? `${e.schema}.` : '';
	const table = e.table ? `${e.table}.` : '';
	return `${schema}${table}${e.name}`;
}

// Forward captures carry post-rename schema/table names, but the reverse diff restores those before resolving dependents.
function toPreviousNames(e: Named, { schemas = [], tables = [] }: RenameScope): Named {
	let { schema, table } = e;
	if (table !== undefined) {
		const tableRename = tables.find((r) => r.to.name === table && r.to.schema === schema);
		if (tableRename) {
			table = tableRename.from.name;
			schema = tableRename.from.schema;
		}
	}
	const schemaRename = schemas.find((r) => r.to.name === schema);
	if (schemaRename) schema = schemaRename.from.name;
	return { name: e.name, schema, table };
}

function invertRenames<T extends Named>(
	forwardRenames: Renames,
	scope: RenameScope,
	inputCreated: T[],
	inputDeleted: T[],
): { renamedOrMoved: { from: T; to: T }[]; created: T[]; deleted: T[] } {
	const created = [...inputCreated];
	const deleted = [...inputDeleted];
	const renamedOrMoved: { from: T; to: T }[] = [];
	for (const { from, to } of forwardRenames) {
		const toKey = entityKey(toPreviousNames(to, scope));
		const fromKey = entityKey(toPreviousNames(from, scope));
		const delIdx = deleted.findIndex((d) => entityKey(d) === toKey);
		const creIdx = created.findIndex((c) => entityKey(c) === fromKey);
		if (delIdx !== -1 && creIdx !== -1) {
			renamedOrMoved.push({ from: deleted[delIdx]!, to: created[creIdx]! });
			deleted.splice(delIdx, 1);
			created.splice(creIdx, 1);
		}
	}
	return { renamedOrMoved, created, deleted };
}

export function withCapture<T extends Named>(resolver: Resolver<T>, store: Renames): Resolver<T> {
	return async (input) => {
		const result = await resolver(input);
		store.push(...result.renamedOrMoved);
		return result;
	};
}

export function makeInverseResolver<T extends Named>(renames: Renames, scope: RenameScope = {}): Resolver<T> {
	return async (input) => invertRenames(renames, scope, input.created, input.deleted);
}

// Inverse resolvers read the captured renames lazily, so the reverse diff must run after the forward one finishes.
export function captureRenames(resolverFor: ResolverFor): { forward: ResolverFor; inverse: ResolverFor } {
	const store = new Map<RenameCreateHintKind, Renames>();
	const renamesOf = (kind: RenameCreateHintKind) => {
		let renames = store.get(kind);
		if (!renames) {
			renames = [];
			store.set(kind, renames);
		}
		return renames;
	};
	const scope: RenameScope = { schemas: renamesOf('schema'), tables: renamesOf('table') };
	return {
		forward: (kind) => withCapture(resolverFor(kind), renamesOf(kind)),
		inverse: (kind) => makeInverseResolver(renamesOf(kind), scope),
	};
}

type DDLLike<E> = { entities: { list: () => E[]; push: (entity: E) => unknown } };

// ddlDiff mutates both of its inputs (applies renames in place), so the reverse diff needs its own copies.
export function cloneDDL<E, D extends DDLLike<E>>(ddl: D, create: () => D): D {
	const copy = create();
	for (const entity of structuredClone(ddl.entities.list())) {
		copy.entities.push(entity);
	}
	return copy;
}

export async function diffWithDown<E, D extends DDLLike<E>, R>(
	prev: D,
	cur: D,
	createDDL: () => D,
	resolverFor: ResolverFor,
	run: (from: D, to: D, resolverFor: ResolverFor) => Promise<R>,
): Promise<R & { down: () => Promise<R> }> {
	const { forward, inverse } = captureRenames(resolverFor);
	const downFrom = cloneDDL(cur, createDDL);
	const downTo = cloneDDL(prev, createDDL);
	const result = await run(prev, cur, forward);
	return { ...result, down: () => run(downFrom, downTo, inverse) };
}

export type DownJsonStatement =
	| PostgresJsonStatement
	| CockroachJsonStatement
	| MysqlJsonStatement
	| SqliteJsonStatement
	| MssqlJsonStatement;

export type DownStatement = { jsonStatement: DownJsonStatement; sqlStatements: string[] };

export type DownResult = { sqlStatements: string[]; statements: DownStatement[] } | { error: unknown };

export async function computeDown(
	down: () => Promise<{ sqlStatements: string[]; groupedStatements: DownStatement[] }>,
): Promise<DownResult> {
	try {
		const { sqlStatements, groupedStatements } = await down();
		return { sqlStatements, statements: groupedStatements };
	} catch (error) {
		return { error };
	}
}

export type DownWarningKind = 'data_loss' | 'may_fail';

export type IrreversibleDownWarning = { sql: string; reason: string; kind: DownWarningKind };

type StatementType = DownJsonStatement['type'];

// Undoing a create (drop_table, drop_column, drop_schema) is the expected rollback, so only re-creates are flagged.
const DATA_LOSS_DOWN_TYPES: Partial<Record<StatementType, string>> = {
	create_table: 'recreates a table the migration dropped; its original rows cannot be restored',
	add_column: 're-adds a column the migration dropped; its original values cannot be restored',
	create_schema: 'recreates a schema the migration dropped; its original contents cannot be restored',
};

const CONSTRAINT_REASONS = {
	unique: 're-adds a unique constraint; fails if existing rows contain duplicates',
	fk: 're-adds a foreign key; fails if existing rows reference missing keys',
	check: 're-adds a check constraint; fails if existing rows violate it',
	pk: 're-adds a primary key; fails if existing rows contain duplicates or NULLs',
} as const;

const SET_NOT_NULL_REASON = 'sets NOT NULL; fails if the column contains NULLs';

const quoteValues = (values: string[]) => values.map((v) => `'${v}'`).join(', ');

const INTEGER_RANKS: Record<string, number> = {
	tinyint: 1,
	smallint: 2,
	int2: 2,
	mediumint: 3,
	int: 4,
	integer: 4,
	int4: 4,
	bigint: 5,
	int8: 5,
};
const FLOAT_RANKS: Record<string, number> = { real: 1, float4: 1, double: 2, 'double precision': 2, float8: 2 };
const BOUNDED_TEXT = new Set(['char', 'character', 'varchar', 'character varying', 'nchar', 'nvarchar']);
const UNBOUNDED_TEXT = new Set(['text', 'string', 'longtext']);

function parseType(type: string) {
	const match = /^([a-z][a-z0-9 ]*?)\s*(?:\(([^)]*)\))?((?:\[\])*)$/.exec(type.trim().toLowerCase());
	if (!match) return null;
	const args = match[2] === undefined
		? []
		: match[2].split(',').map((arg) => arg.trim() === 'max' ? Infinity : Number(arg));
	if (args.some(Number.isNaN)) return null;
	return { base: match[1]!, args, array: match[3]! };
}

// Anything not provably widening counts as narrowing, so an unknown type change is flagged rather than passed.
function isWideningTypeChange(from: string, to: string): boolean {
	const a = parseType(from);
	const b = parseType(to);
	if (!a || !b || a.array !== b.array) return false;
	for (const ranks of [INTEGER_RANKS, FLOAT_RANKS]) {
		if (ranks[a.base] && ranks[b.base]) return !a.args.length && !b.args.length && ranks[b.base]! >= ranks[a.base]!;
	}
	if (a.base === b.base && a.args.length > 0 && a.args.length === b.args.length) {
		if (a.base === 'numeric' || a.base === 'decimal') {
			const [p1, s1 = 0] = a.args as [number, number?];
			const [p2, s2 = 0] = b.args as [number, number?];
			return s2 >= s1 && p2 - s2 >= p1 - s1;
		}
		return a.args.length === 1 && b.args[0]! >= a.args[0]!;
	}
	return BOUNDED_TEXT.has(a.base) && UNBOUNDED_TEXT.has(b.base) && b.args.length === 0;
}

type ColumnAlter = { notNull?: { from: boolean; to: boolean }; type?: { from: string; to: string } };

function columnAlterReasons({ notNull, type }: ColumnAlter): string[] {
	const reasons: string[] = [];
	if (notNull && !notNull.from && notNull.to) reasons.push(SET_NOT_NULL_REASON);
	if (type && !isWideningTypeChange(type.from, type.to)) {
		reasons.push(`changes type ${type.from} to ${type.to}; fails if existing values do not convert`);
	}
	return reasons;
}

type AddedColumn = {
	notNull: boolean;
	type: string;
	default?: unknown;
	generated?: unknown;
	identity?: unknown;
	autoIncrement?: boolean;
	autoincrement?: boolean | null;
};

function isFilledByDatabase(column: AddedColumn, defaults: unknown[] = []): boolean {
	return (column.default !== null && column.default !== undefined)
		|| !!column.generated
		|| !!column.identity
		|| !!column.autoIncrement
		|| !!column.autoincrement
		|| defaults.length > 0
		|| /serial$/i.test(column.type);
}

const tableKey = (table: { schema?: string | null; table?: string; name?: string }) =>
	`${table.schema ?? ''}.${table.table ?? table.name}`;

function mayFailReasons(statement: DownJsonStatement, createdTables: Set<string>): string[] {
	const onExistingTable = (table: { schema?: string | null; table: string }) => !createdTables.has(tableKey(table));
	switch (statement.type) {
		case 'add_column': {
			const defaults = 'defaults' in statement ? statement.defaults : [];
			const column: AddedColumn = statement.column;
			return column.notNull && !isFilledByDatabase(column, defaults)
				? ['re-adds a NOT NULL column without a default; fails if the table has rows']
				: [];
		}
		case 'alter_column':
		case 'recreate_column':
			return 'diff' in statement ? columnAlterReasons(statement.diff) : [];
		case 'alter_add_column_not_null':
			return [SET_NOT_NULL_REASON];
		case 'recreate_table': {
			const fromColumns = new Set(statement.from.columns.map((c) => c.name));
			const reasons = statement.columnAlters.flatMap(columnAlterReasons);
			if (statement.to.columns.some((c) => !fromColumns.has(c.name) && c.notNull && !isFilledByDatabase(c))) {
				reasons.push('re-adds a NOT NULL column without a default; fails if the table has rows');
			}
			const added = <T extends { $diffType: string }>(diffs: T[]) => diffs.some((d) => d.$diffType === 'create');
			if (added(statement.uniquesDiff) || statement.uniquesAlters.length > 0) reasons.push(CONSTRAINT_REASONS.unique);
			if (added(statement.fksDiff) || statement.fksAlters.length > 0) reasons.push(CONSTRAINT_REASONS.fk);
			if (added(statement.checkDiffs) || statement.checksAlters.length > 0) reasons.push(CONSTRAINT_REASONS.check);
			if (added(statement.pksDiff) || statement.pksAlters.length > 0) reasons.push(CONSTRAINT_REASONS.pk);
			if (statement.indexesDiff.some((i) => i.$diffType === 'create' && i.isUnique)) {
				reasons.push(CONSTRAINT_REASONS.unique);
			}
			return [...new Set(reasons)];
		}
		case 'create_index':
		case 'recreate_index': {
			const index = 'index' in statement ? statement.index : statement.diff.$right;
			return index.isUnique && onExistingTable(index) ? [CONSTRAINT_REASONS.unique] : [];
		}
		case 'add_unique':
			return onExistingTable(statement.unique) ? [CONSTRAINT_REASONS.unique] : [];
		case 'alter_unique':
			return [CONSTRAINT_REASONS.unique];
		case 'create_fk':
		case 'recreate_fk':
			return onExistingTable(statement.fk) ? [CONSTRAINT_REASONS.fk] : [];
		case 'add_check':
		case 'create_check':
			return onExistingTable(statement.check) ? [CONSTRAINT_REASONS.check] : [];
		case 'alter_check':
			return [CONSTRAINT_REASONS.check];
		case 'add_pk':
		case 'create_pk':
			return onExistingTable(statement.pk) ? [CONSTRAINT_REASONS.pk] : [];
		case 'alter_pk':
		case 'recreate_pk':
			return [CONSTRAINT_REASONS.pk];
		case 'recreate_enum': {
			const kept = new Set(statement.to.values);
			const removed = statement.from.values.filter((v) => !kept.has(v));
			return removed.length > 0
				? [`removes enum value(s) ${quoteValues(removed)}; fails if any row still uses them`]
				: [];
		}
		case 'alter_type_drop_value':
			return statement.deletedValues.length > 0
				? [`removes enum value(s) ${quoteValues(statement.deletedValues)}; fails if any row still uses them`]
				: [];
		default:
			return [];
	}
}

export function collectIrreversibleDownWarnings(statements: DownStatement[]): IrreversibleDownWarning[] {
	const createdTables = new Set(
		statements.flatMap(({ jsonStatement: s }) => s.type === 'create_table' ? [tableKey(s.table)] : []),
	);
	const warnings: IrreversibleDownWarning[] = [];
	for (const { jsonStatement, sqlStatements } of statements) {
		const problems: [DownWarningKind, string][] = [];
		const dataLoss = DATA_LOSS_DOWN_TYPES[jsonStatement.type];
		if (dataLoss) problems.push(['data_loss', dataLoss]);
		for (const reason of mayFailReasons(jsonStatement, createdTables)) problems.push(['may_fail', reason]);
		for (const [kind, reason] of problems) {
			for (const sql of sqlStatements) {
				warnings.push({ sql: sql.replace(/\s+/g, ' ').trim(), reason, kind });
			}
		}
	}
	return warnings;
}

const WARNING_SECTIONS: [DownWarningKind, string][] = [
	['data_loss', 'These operations cannot bring back data the migration dropped:'],
	['may_fail', 'These operations may fail on a populated table:'],
];

export function describeIrreversibleWarnings(warnings: IrreversibleDownWarning[]): string[] {
	const lines: string[] = [];
	for (const [kind, title] of WARNING_SECTIONS) {
		const ofKind = warnings.filter((w) => w.kind === kind);
		if (ofKind.length === 0) continue;
		lines.push(title, ...ofKind.map(({ sql, reason }) => `  • ${sql} — ${reason}`));
	}
	return lines;
}

export function formatIrreversibleBanner(warnings: IrreversibleDownWarning[]): string {
	if (warnings.length === 0) return '';
	return [
		'⚠ REVIEW: best-effort checks flagged operations in this rollback.',
		...describeIrreversibleWarnings(warnings),
	].map((line) => `-- ${line}`).join('\n');
}
