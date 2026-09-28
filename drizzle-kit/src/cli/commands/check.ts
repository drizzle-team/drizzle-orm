import chalk from 'chalk';
import { readFileSync } from 'fs';
import { getCommutativityDialect } from '../../commutativity';
import type { MigrationNode, NonCommutativityReport, UnifiedBranchConflict } from '../../commutativity/types';
import type { Dialect } from '../../utils/schemaValidator';
import { assertSnapshotStatus, prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { CheckCliError } from '../errors';
import { humanLog } from '../views';

export type CheckHandlerResult = {
	statements: unknown[];
	parentSnapshot: unknown | null;
	parentId?: string;
	leafIds?: string[];
	// True when the branches conflict and the caller ignores the conflicts.
	hasConflicts?: boolean;
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
		`${chalk.white.bgRed(' Non-commutative migrations detected ')} `
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

export const checkHandler = async (
	out: string,
	dialect: Dialect,
	ignoreConflicts?: boolean,
	shouldExitOnConflict = true,
): Promise<CheckHandlerResult> => {
	const { snapshots } = prepareOutFolder(out);
	const validator = validatorForDialect(dialect);

	// const parsedInputs: ParsedSnapshotInput[] = [];
	for (const snapshot of snapshots) {
		let raw: unknown = null;
		try {
			raw = JSON.parse(readFileSync(snapshot).toString());
		} catch {}
		assertSnapshotStatus(snapshot, typeof raw === 'object' && raw !== null ? validator(raw).status : 'malformed');
	}

	const commutativity = getCommutativityDialect(dialect);
	if (!commutativity) {
		return emptyResult();
	}

	const response = await commutativity.detectNonCommutative(snapshots);
	if (response.conflicts.length > 0) {
		const nonCommutativityMessage = generateReportDirectory(response);
		if (!ignoreConflicts) {
			if (shouldExitOnConflict) {
				const leafOf = (chain: MigrationNode[]) => chain[chain.length - 1];
				const details = response.conflicts.map((conflict) => ({
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
				throw new CheckCliError('conflicts', nonCommutativityMessage, {
					conflicts: response.conflicts.length,
					details,
				});
			}
			humanLog(nonCommutativityMessage);
			return emptyResult(nonCommutativityMessage);
		}
	}

	const selectedBranch = selectOpenCommutativeBranch(response);
	if (selectedBranch) {
		return {
			statements: selectedBranch.statements,
			parentSnapshot: selectedBranch.parentSnapshot,
			parentId: selectedBranch.parentId,
			leafIds: selectedBranch.leafs.map((leaf) => leaf.id),
		};
	}

	// No commutative branch covers all open leaves, so generate merges the leaves by id.
	if (response.leafNodes.length > 1) {
		return {
			statements: [],
			parentSnapshot: null,
			leafIds: [...response.leafNodes].sort((left, right) => left.localeCompare(right)),
			...(response.conflicts.length > 0 && { hasConflicts: true }),
		};
	}

	return emptyResult();
};
