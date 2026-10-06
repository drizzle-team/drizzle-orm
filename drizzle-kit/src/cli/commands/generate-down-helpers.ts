import type { Resolver } from '../../dialects/common';

/**
 * Given the list of renames from a forward diff (from -> to),
 * this constructs a resolver for the reverse diff that knows about those renames.
 * In the reverse diff, 'to' names appear in `deleted` and 'from' names in `created`.
 */
function entityKey(e: { name: string; schema?: string; table?: string }): string {
	const schema = e.schema ? `${e.schema}.` : '';
	const table = e.table ? `${e.table}.` : '';
	return `${schema}${table}${e.name}`;
}

function invertRenames<T extends { name: string; schema?: string; table?: string }>(
	forwardRenames: { from: T; to: T }[],
	inputCreated: T[],
	inputDeleted: T[],
): { renamedOrMoved: { from: T; to: T }[]; created: T[]; deleted: T[] } {
	const created = [...inputCreated];
	const deleted = [...inputDeleted];
	const renamedOrMoved: { from: T; to: T }[] = [];
	for (const { from, to } of forwardRenames) {
		const toKey = entityKey(to);
		const fromKey = entityKey(from);
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

/**
 * Wraps a resolver to capture renames during the forward diff.
 */
export function withCapture<T extends { name: string; schema?: string; table?: string }>(
	resolver: Resolver<T>,
	store: { from: T; to: T }[],
): Resolver<T> {
	return async (input) => {
		const result = await resolver(input);
		store.push(...result.renamedOrMoved);
		return result;
	};
}

/**
 * Creates a resolver for the reverse diff that inverts the captured forward renames.
 */
export function makeInverseResolver<T extends { name: string; schema?: string; table?: string }>(
	renames: { from: T; to: T }[],
): Resolver<T> {
	return async (input) => {
		return invertRenames(renames, input.created, input.deleted);
	};
}

/** A single grouped statement from a diff: its typed JSON form and the SQL it produced. */
export type DownStatement = { jsonStatement: { type: string }; sqlStatements: string[] };

export type IrreversibleDownWarning = { sql: string; reason: string };

/**
 * Down-migration statement types that cannot fully restore the prior database state.
 *
 * The rollback is generated from the reverse schema diff, so it always reproduces the
 * previous *structure*. It cannot reproduce *data*: each type below either recreates an
 * object the forward migration dropped (so the original rows/values are already gone), or
 * drops an object on rollback (destroying rows written since the migration). Only
 * unambiguous, dialect-independent cases are listed here to avoid false positives — note
 * that SQLite implements most alters via table rebuilds that copy data across, which are
 * intentionally not flagged.
 */
const IRREVERSIBLE_DOWN_TYPES: Record<string, string> = {
	create_table: 'recreates a table the migration dropped; original rows cannot be restored',
	add_column: 're-adds a column the migration dropped; original values cannot be restored',
	create_schema: 'recreates a schema the migration dropped; its original contents cannot be restored',
	drop_table: 'drops a table the migration created; rows written since the migration are lost',
	drop_column: 'drops a column the migration added; data written since the migration is lost',
	drop_schema: 'drops a schema the migration created; its contents are lost',
};

/**
 * Inspects the generated rollback statements and returns one entry per statement that
 * cannot fully restore the prior state. Returns an empty array when the rollback is fully
 * reversible (structure and data).
 */
export function collectIrreversibleDownWarnings(statements: DownStatement[]): IrreversibleDownWarning[] {
	const warnings: IrreversibleDownWarning[] = [];
	for (const { jsonStatement, sqlStatements } of statements) {
		const reason = IRREVERSIBLE_DOWN_TYPES[jsonStatement.type];
		if (!reason) continue;
		for (const sql of sqlStatements) {
			warnings.push({ sql: sql.replace(/\s+/g, ' ').trim(), reason });
		}
	}
	return warnings;
}

/**
 * Renders the irreversible-operation warnings as a comment banner for the top of down.sql.
 * Returns an empty string when there are no warnings.
 */
export function formatIrreversibleBanner(warnings: IrreversibleDownWarning[]): string {
	if (warnings.length === 0) return '';
	const lines = warnings.map(({ sql, reason }) => `--   • ${sql} — ${reason}`);
	return [
		'-- ⚠ REVIEW: this rollback cannot fully restore the previous database state.',
		'-- The statements below reverse the schema, but the listed operations lose data:',
		...lines,
	].join('\n');
}
