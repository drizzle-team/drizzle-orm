import chalk from 'chalk';
import { rmSync } from 'fs';
import { dirname } from 'path';
import type { ParsedSnapshotInput } from '../../commutativity/engine';
import type { NonCommutativityReport } from '../../commutativity/types';
import { postgresCommutativity } from '../../dialects/postgres/commutativity';
import type { PostgresSnapshot } from '../../dialects/postgres/snapshot';

// The migration folders that the conflict fix deletes, in folder-name order. `customMigrations` lists the
// deleted custom migrations, that is the diff snapshots with no deltas, because the fix loses their SQL.
export type ConflictFix = { migrations: string[]; customMigrations: string[] };

// Plans the migrations to delete, so that the rest of `inputs` has no conflict. `report` is the check of all
// `inputs`. The check reports one conflict for each pair of leaves, so the loop deletes the migrations of the
// reported statements with all their children, and then checks the rest again.
export const planConflictFix = async (
	inputs: ParsedSnapshotInput<PostgresSnapshot>[],
	report: NonCommutativityReport,
): Promise<ConflictFix> => {
	const children = new Map<string, string[]>();
	for (const { snapshot } of inputs) {
		for (const parentId of snapshot.prevIds) children.set(parentId, [...(children.get(parentId) ?? []), snapshot.id]);
	}

	const removed = new Set<string>();
	let { conflicts } = report;
	while (conflicts.length > 0) {
		const stack = conflicts.flatMap((it) => [it.branchA.source!.id, it.branchB.source!.id]);
		while (stack.length) {
			const id = stack.pop()!;
			if (removed.has(id)) continue;
			removed.add(id);
			stack.push(...(children.get(id) ?? []));
		}
		({ conflicts } = await postgresCommutativity.detectNonCommutative(
			inputs.filter((it) => !removed.has(it.snapshot.id)),
		));
	}

	const deleted = inputs.filter((it) => removed.has(it.snapshot.id));
	return {
		migrations: deleted.map((it) => dirname(it.path)),
		customMigrations: deleted
			.filter(({ snapshot }) => snapshot.type === 'diff' && snapshot.deltas.length === 0)
			.map((it) => dirname(it.path)),
	};
};

const folderList = (folders: string[]) => folders.map((it) => `  ${it}`);

const migrations = (count: number) => `${count} migration${count === 1 ? '' : 's'}`;

export const describeConflictFix = (fix: ConflictFix, hasSchemaChanges = true) =>
	[
		'',
		'To fix the conflicts, drizzle-kit can delete the conflicting migration branches, '
		+ `which is ${migrations(fix.migrations.length)} in total`
		+ (hasSchemaChanges
			? ', and generate one new migration from your schema.'
			: '. The remaining migrations already match your schema, so the fix writes no new migration.')
		+ ' It deletes these folders:',
		...folderList(fix.migrations),
		...(fix.customMigrations.length > 0
			? [
				chalk.yellow(
					'These migrations are custom migrations. Their SQL does not come from the schema, so the fix loses it. '
						+ 'Copy the SQL that you still need before you run the fix:',
				),
				...folderList(fix.customMigrations),
			]
			: []),
		'Every database that already ran a deleted migration must be reset.',
		'To apply this fix, run:',
		'  drizzle-kit generate --fix-conflicts',
	].join('\n');

export const describeAppliedFix = (fix: ConflictFix) =>
	[
		`Deleted ${migrations(fix.migrations.length)}:`,
		...folderList(fix.migrations),
		...(fix.customMigrations.length > 0
			? [
				chalk.yellow(
					'These deleted migrations were custom migrations. Add their SQL again by hand if you still need it:',
				),
				...folderList(fix.customMigrations),
			]
			: []),
	].join('\n');

export const applyConflictFix = (fix: ConflictFix) => {
	for (const folder of fix.migrations) rmSync(folder, { recursive: true, force: true });
};
