import chalk from 'chalk';
import { readFileSync } from 'fs';
import { basename, dirname } from 'path';
import { getCommutativityDialect } from '../../commutativity';
import type { ParsedSnapshotInput, SnapshotHeader } from '../../commutativity/engine';
import type { MigrationNode, NonCommutativityReport, UnifiedBranchConflict } from '../../commutativity/types';
import { type PostgresSnapshot, reconstruct, StateHashError, stateHashMessage } from '../../dialects/postgres/snapshot';
import type { Dialect } from '../../utils/schemaValidator';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { CheckCliError, UnsupportedCommandCliError } from '../errors';
import { humanLog } from '../views';
import { type ConflictFix, describeConflictFix, planConflictFix } from './fix-conflicts';

export type CheckHandlerResult = {
	statements: unknown[];
	parentSnapshot: unknown | null;
	parentId?: string;
	leafIds?: string[];
	nonCommutativityMessage?: string;
};

const emptyResult = (nonCommutativityMessage?: string): CheckHandlerResult => ({
	statements: [],
	parentSnapshot: null,
	nonCommutativityMessage,
});

const selectOpenCommutativeBranch = (report: NonCommutativityReport) => {
	const branches = report.commutativeBranches ?? [];
	if (branches.length === 0) return null;

	const leafSet = new Set(report.leafNodes);
	return (
		branches.find(
			(branch) =>
				branch.leafs.length > 1
				&& branch.leafs.length === leafSet.size
				&& branch.leafs.every((leaf) => leafSet.has(leaf.id)),
		) ?? null
	);
};

const countLeafs = (conflicts: UnifiedBranchConflict[]): number => {
	const ids = new Set<string>();
	for (const c of conflicts) {
		const lastA = c.branchA.chain[c.branchA.chain.length - 1];
		const lastB = c.branchB.chain[c.branchB.chain.length - 1];
		if (lastA) ids.add(lastA.id);
		if (lastB) ids.add(lastB.id);
	}
	return ids.size;
};

const headerBadge = (conflicts: UnifiedBranchConflict[]): string => {
	const leafCount = countLeafs(conflicts);
	return (
		`${chalk.white.bgRed(' Conflicting migrations detected ')} `
		+ `Found ${chalk.bold(String(conflicts.length))} conflict${conflicts.length === 1 ? '' : 's'} `
		+ `across ${chalk.bold(String(leafCount))} migration${leafCount === 1 ? '' : 's'}`
	);
};

export const generateReportDirectory = (
	report: NonCommutativityReport,
): string => {
	const { conflicts } = report;
	const lines: string[] = ['', headerBadge(conflicts), ''];

	// Group conflicts by parentId
	const byParent: Record<string, UnifiedBranchConflict[]> = {};
	for (const c of conflicts) {
		(byParent[c.parentId] ??= []).push(c);
	}

	const parentEntries = Object.entries(byParent);

	for (let p = 0; p < parentEntries.length; p++) {
		const [parentId, parentConflicts] = parentEntries[p];
		const parentLabel = parentConflicts[0].parentPath ?? parentId;

		// Collect unique branches, dedupe by leaf id
		const branches: { chain: MigrationNode[]; descriptions: string[] }[] = [];
		const seenLeafs: Record<string, number> = {};

		for (const c of parentConflicts) {
			for (const branch of [c.branchA, c.branchB]) {
				const leafId = branch.chain[branch.chain.length - 1]?.id ?? '';
				if (leafId in seenLeafs) {
					const descs = branches[seenLeafs[leafId]].descriptions;
					if (!descs.includes(branch.statementDescription)) {
						descs.push(branch.statementDescription);
					}
				} else {
					seenLeafs[leafId] = branches.length;
					branches.push({
						chain: branch.chain,
						descriptions: [branch.statementDescription],
					});
				}
			}
		}

		lines.push(`  ${chalk.white(parentLabel)}`);

		for (let b = 0; b < branches.length; b++) {
			const { chain, descriptions } = branches[b];
			const isLast = b === branches.length - 1;
			const prefix = isLast ? '    ' : '│   ';

			for (let m = 0; m < chain.length; m++) {
				const label = m === chain.length - 1
					? chalk.red.bold(chain[m].path)
					: chalk.green(chain[m].path);

				lines.push(
					m === 0
						? `  ${chalk.gray(isLast ? '└──' : '├──')} ${label}`
						: `  ${chalk.gray(prefix)}${label}`,
				);
			}

			for (let d = 0; d < descriptions.length; d++) {
				const connector = d === descriptions.length - 1 ? '└─' : '├─';
				lines.push(
					`  ${chalk.gray(prefix)}${chalk.gray(connector)} ${chalk.yellow('⚠')} ${chalk.yellow(descriptions[d])}`,
				);
			}
		}

		if (p < parentEntries.length - 1) lines.push('');
	}

	// Need to add a proper guide to uncomment
	// lines.push(
	// 	chalk.gray('\nPlease refer to our guide on how to resolve such conflicts:'),
	// 	chalk.bold.underline.blue('https://orm.drizzle.team/docs/migrations'),
	// );
	return lines.join('\n');
};

export const assertConflictOptions = (
	command: string,
	dialect: Dialect,
	options: { ignoreConflicts?: boolean; fixConflicts?: boolean },
) => {
	if (dialect === 'postgresql' && options.ignoreConflicts) {
		throw new UnsupportedCommandCliError(
			command,
			'--ignore-conflicts is not supported for postgresql. '
				+ 'To delete the conflicting migrations and generate one new migration, run:\n'
				+ '  drizzle-kit generate --fix-conflicts',
			{ dialect, option: 'ignore-conflicts' },
		);
	}
	if (dialect !== 'postgresql' && options.fixConflicts) {
		throw new UnsupportedCommandCliError(
			command,
			`--fix-conflicts is supported only for postgresql. For ${dialect}, resolve the conflicts by hand, `
				+ 'or run generate with --ignore-conflicts to write the merge anyway.',
			{ dialect, option: 'fix-conflicts' },
		);
	}
};

export const checkHandler = async (
	out: string,
	dialect: Dialect,
	ignoreConflicts?: boolean,
	shouldExitOnConflict = true,
	stored = prepareOutFolder(out),
): Promise<CheckHandlerResult> => {
	const { report, fix } = await checkSnapshots(stored.snapshots, dialect);
	if (report.conflicts.length > 0 && !ignoreConflicts) {
		if (shouldExitOnConflict) throw conflictError(report, fix);
		const nonCommutativityMessage = generateReportDirectory(report);
		humanLog(nonCommutativityMessage);
		return emptyResult(nonCommutativityMessage);
	}

	const selectedBranch = selectOpenCommutativeBranch(report);
	if (selectedBranch) {
		return {
			statements: selectedBranch.statements,
			parentSnapshot: selectedBranch.parentSnapshot,
			parentId: selectedBranch.parentId,
			leafIds: selectedBranch.leafs.map((leaf) => leaf.id),
		};
	}

	if (ignoreConflicts && report.leafNodes.length > 1) {
		return {
			statements: [],
			parentSnapshot: null,
			leafIds: [...report.leafNodes].sort((left, right) => left.localeCompare(right)),
		};
	}

	return emptyResult();
};

// `fix` is set only for postgresql, and only when the report has conflicts.
export type SnapshotCheck = { report: NonCommutativityReport; fix?: ConflictFix };

export const checkSnapshots = async (snapshots: string[], dialect: Dialect): Promise<SnapshotCheck> => {
	const validator = validatorForDialect(dialect);

	const inputs: ParsedSnapshotInput[] = [];
	for (const path of snapshots) {
		let raw: unknown = null;
		try {
			raw = JSON.parse(readFileSync(path).toString());
		} catch {}
		assertSnapshotStatus(path, typeof raw === 'object' && raw !== null ? validator(raw).status : 'malformed');
		inputs.push({ path, snapshot: raw as SnapshotHeader });
	}

	const commutativity = getCommutativityDialect(dialect);
	if (!commutativity) return { report: { conflicts: [], leafNodes: [] } };

	const report = await commutativity.detectNonCommutative(inputs);
	if (dialect !== 'postgresql') return { report };
	// The validator accepted every input as a postgres snapshot.
	const postgresInputs = inputs as ParsedSnapshotInput<PostgresSnapshot>[];
	assertLeafStates(postgresInputs, report.leafNodes);
	if (report.conflicts.length === 0) return { report };
	return { report, fix: await planConflictFix(postgresInputs, report) };
};

// Rebuilds every leaf once and compares its state with the hash that the snapshot recorded, so a snapshot
// that was edited by hand stops the command. The conflicts still come only from the stored statements.
// `inputs` must be in folder-name order.
const assertLeafStates = (inputs: ParsedSnapshotInput<PostgresSnapshot>[], leafIds: string[]) => {
	const history = new Map(inputs.map((it) => [it.snapshot.id, it.snapshot]));
	const pathOf = new Map(inputs.map((it) => [it.snapshot.id, it.path]));
	for (const leafId of leafIds) {
		try {
			reconstruct(history, leafId);
		} catch (e) {
			// A merge also checks the state of its first parent, so the snapshot that fails can be an ancestor.
			const path = pathOf.get(e instanceof StateHashError ? e.snapshotId : leafId)!;
			const folder = basename(dirname(path));
			const message = e instanceof StateHashError
				? stateHashMessage(folder)
				: `Cannot rebuild snapshot ${folder}: ${(e as Error).message}`;
			throw new CheckCliError('state_hash', message, { snapshot: path });
		}
	}
};

export const conflictError = (report: NonCommutativityReport, fix?: ConflictFix) => {
	const leafOf = (chain: MigrationNode[]) => chain[chain.length - 1];
	const details = report.conflicts.map((conflict) => ({
		parentId: conflict.parentId,
		...(conflict.parentPath !== undefined && { parentPath: conflict.parentPath }),
		branches: [conflict.branchA, conflict.branchB].map((branch) => ({
			leafId: leafOf(branch.chain)?.id ?? null,
			leafPath: leafOf(branch.chain)?.path ?? null,
			statementDescription: branch.statementDescription,
			target: branch.target,
			action: branch.action,
		})),
	}));
	const message = generateReportDirectory(report) + (fix ? `\n${describeConflictFix(fix)}` : '');
	return new CheckCliError('conflicts', message, {
		conflicts: report.conflicts.length,
		details,
		...(fix && { fix }),
	});
};
