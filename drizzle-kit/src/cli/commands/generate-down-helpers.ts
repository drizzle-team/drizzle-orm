import { createHash } from 'crypto';
import type { Resolver } from '../../dialects/common';
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

const UP_HASH_PREFIX = '-- drizzle:up-hash=';

/** Same digest drizzle-orm's readMigrationFiles computes over migration.sql. */
export function migrationHash(migrationSql: string): string {
	return createHash('sha256').update(migrationSql).digest('hex');
}

export function upHashStamp(migrationSql: string): string {
	return `${UP_HASH_PREFIX}${migrationHash(migrationSql)}`;
}

export function readUpHashStamp(downSql: string): string | null {
	const firstLine = downSql.split('\n', 1)[0]!.trim();
	if (!firstLine.startsWith(UP_HASH_PREFIX)) return null;
	return firstLine.slice(UP_HASH_PREFIX.length).trim() || null;
}

/** A single grouped statement from a diff: its typed JSON form and the SQL it produced. */
export type DownStatement = { jsonStatement: { type: string }; sqlStatements: string[] };

export type DownWarningKind = 'data_loss' | 'may_fail';

export type IrreversibleDownWarning = { sql: string; reason: string; kind: DownWarningKind };

// SQLite implements most alters as table rebuilds that copy rows across, so recreate_table is deliberately absent.
const DATA_LOSS_DOWN_TYPES: Record<string, string> = {
	create_table: 'recreates a table the migration dropped; original rows cannot be restored',
	add_column: 're-adds a column the migration dropped; original values cannot be restored',
	create_schema: 'recreates a schema the migration dropped; its original contents cannot be restored',
	drop_table: 'drops a table the migration created; rows written since the migration are lost',
	drop_column: 'drops a column the migration added; data written since the migration is lost',
	drop_schema: 'drops a schema the migration created; its contents are lost',
};

type LooseColumn = {
	type?: string;
	notNull?: boolean;
	default?: unknown;
	generated?: unknown;
	identity?: unknown;
	autoIncrement?: boolean;
};

type LooseStatement = {
	type: string;
	column?: LooseColumn;
	defaults?: unknown[];
	from?: { values?: string[] };
	to?: { values?: string[] };
	deletedValues?: string[];
};

const quoteValues = (values: string[]) => values.map((v) => `'${v}'`).join(', ');

function mayFailReason(jsonStatement: DownStatement['jsonStatement']): string | null {
	const statement = jsonStatement as LooseStatement;
	if (statement.type === 'add_column' && statement.column) {
		const { column } = statement;
		const filledByDatabase = (column.default !== null && column.default !== undefined)
			|| !!column.generated
			|| !!column.identity
			|| !!column.autoIncrement
			|| (statement.defaults?.length ?? 0) > 0
			|| /serial$/i.test(column.type ?? '');
		if (column.notNull && !filledByDatabase) {
			return 're-adds a NOT NULL column without a default; fails if the table has rows';
		}
	}
	if (statement.type === 'recreate_enum' && statement.from?.values && statement.to?.values) {
		const kept = new Set(statement.to.values);
		const removed = statement.from.values.filter((v) => !kept.has(v));
		if (removed.length > 0) {
			return `removes enum value(s) ${quoteValues(removed)}; fails if any row still uses them`;
		}
	}
	if (statement.type === 'alter_type_drop_value' && statement.deletedValues?.length) {
		return `removes enum value(s) ${quoteValues(statement.deletedValues)}; fails if any row still uses them`;
	}
	return null;
}

export function collectIrreversibleDownWarnings(statements: DownStatement[]): IrreversibleDownWarning[] {
	const warnings: IrreversibleDownWarning[] = [];
	for (const { jsonStatement, sqlStatements } of statements) {
		const problems: [DownWarningKind, string][] = [];
		const dataLoss = DATA_LOSS_DOWN_TYPES[jsonStatement.type];
		if (dataLoss) problems.push(['data_loss', dataLoss]);
		const mayFail = mayFailReason(jsonStatement);
		if (mayFail) problems.push(['may_fail', mayFail]);
		for (const [kind, reason] of problems) {
			for (const sql of sqlStatements) {
				warnings.push({ sql: sql.replace(/\s+/g, ' ').trim(), reason, kind });
			}
		}
	}
	return warnings;
}

const WARNING_SECTIONS: [DownWarningKind, string][] = [
	['data_loss', 'These operations lose data:'],
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
		'⚠ REVIEW: this rollback cannot fully restore the previous database state.',
		...describeIrreversibleWarnings(warnings),
	].map((line) => `-- ${line}`).join('\n');
}
