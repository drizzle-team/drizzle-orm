import { DrizzleError } from './errors.ts';
import type { MigrationMeta, RollbackOptions, RollbackStep } from './migrator.ts';

export function formatToMillis(dateStr: string): number {
	const year = parseInt(dateStr.slice(0, 4), 10);
	const month = parseInt(dateStr.slice(4, 6), 10) - 1;
	const day = parseInt(dateStr.slice(6, 8), 10);
	const hour = parseInt(dateStr.slice(8, 10), 10);
	const minute = parseInt(dateStr.slice(10, 12), 10);
	const second = parseInt(dateStr.slice(12, 14), 10);

	return Date.UTC(year, month, day, hour, minute, second);
}

export function getMigrationsToRun(params: {
	localMigrations: MigrationMeta[];
	dbMigrations: { id: number; hash: string; created_at: string; name: string | null }[];
}): MigrationMeta[] {
	const { localMigrations, dbMigrations } = params;

	const dbNamesSet = new Set(
		dbMigrations.map((m) => m.name).filter((n): n is string => n !== null),
	);
	return localMigrations.filter((lm) => !lm.name || !dbNamesSet.has(lm.name));
}

export interface JournalRow {
	id: number | string;
	hash: string;
	created_at?: string | number | null;
	name: string | null;
}

function hasStatement(chunk: string): boolean {
	return chunk.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '').trim() !== '';
}

/**
 * Resolves which applied migrations to roll back and their down SQL. Every problem in the range is
 * reported before anything runs, so drivers that can't roll back atomically never start a partial rollback.
 */
export function planRollback(params: {
	localMigrations: MigrationMeta[];
	dbMigrations: JournalRow[];
	options?: RollbackOptions;
}): RollbackStep[] {
	const { localMigrations, options = {} } = params;
	const { steps, to } = options;

	if (steps !== undefined && to !== undefined) {
		throw new DrizzleError({ message: 'Rollback accepts either `steps` or `to`, not both' });
	}
	if (steps !== undefined && (!Number.isSafeInteger(steps) || steps < 1)) {
		throw new DrizzleError({ message: `Rollback \`steps\` must be a positive integer, received ${String(steps)}` });
	}

	const applied = params.dbMigrations
		.map((row) => ({ ...row, id: Number(row.id) }))
		.sort((a, b) => b.id - a.id);

	let selected: typeof applied;
	if (to === undefined) {
		selected = applied.slice(0, steps ?? 1);
	} else {
		const index = applied.findIndex((row) => row.name === to);
		if (index === -1) {
			throw new DrizzleError({ message: `Cannot rollback to "${to}": no applied migration has that name` });
		}
		selected = applied.slice(0, index);
	}

	const problems: string[] = [];
	const plan: RollbackStep[] = [];
	for (const row of selected) {
		const local = row.name !== null
			? localMigrations.find((m) => m.name === row.name)
			: row.hash
			? localMigrations.find((m) => m.hash === row.hash)
			: localMigrations.find((m) => m.folderMillis === Number(row.created_at));
		const label = row.name ?? `with hash ${row.hash}`;

		if (!local) {
			problems.push(`migration ${label} is applied but its migration folder was not found`);
			continue;
		}

		const downSql = (local.downSql ?? []).filter(hasStatement);
		if (downSql.length === 0) {
			problems.push(`migration ${local.name} has no down SQL; add statements to its down.sql`);
			continue;
		}

		plan.push({ id: row.id, name: local.name, hash: local.hash, downSql });
	}

	if (problems.length) {
		throw new DrizzleError({ message: `Cannot rollback:\n${problems.map((p) => `- ${p}`).join('\n')}` });
	}

	return plan;
}

export function journalReadError(table: string, cause: unknown): DrizzleError {
	return new DrizzleError({
		message:
			`Cannot read the migrations journal ${table}. Rollback needs a journal written by migrate() from this drizzle-orm version; run migrate() first.`,
		cause,
	});
}
