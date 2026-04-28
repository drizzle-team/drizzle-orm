import chalk from 'chalk';
import { readFileSync } from 'fs';
import { getCommutativityDialect } from 'src/commutativity';
import type { MigrationNode, NonCommutativityReport, UnifiedBranchConflict } from 'src/commutativity/types';
import type { Dialect } from '../../utils/schemaValidator';
import { prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { CheckCliError } from '../errors';
import { humanLog, info } from '../views';

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
	const candidates = branches.filter(
		(branch) =>
			branch.leafs.length > 1
			&& branch.leafs.length === leafSet.size
			&& branch.leafs.every((leaf) => leafSet.has(leaf.id)),
	);

	if (candidates.length === 0) return null;

	// When multiple commutative branches match (e.g. both a root-level fork and a
	// deeper fork resolve to the same set of leaves), pick the one closest to the
	// leaves — i.e. the branch whose combined leaf statements are fewest, meaning
	// the parent is the most recent common ancestor of the open leaves.
	if (candidates.length > 1) {
		let best = candidates[0];
		let bestTotal = best.leafs.reduce((sum, l) => sum + l.statements.length, 0);

		for (let i = 1; i < candidates.length; i++) {
			const total = candidates[i].leafs.reduce(
				(sum, l) => sum + l.statements.length,
				0,
			);
			if (total < bestTotal) {
				best = candidates[i];
				bestTotal = total;
			}
		}
		return best;
	}

	return candidates[0];
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

	for (const snapshot of snapshots) {
		const raw = JSON.parse(readFileSync(snapshot).toString());

		const res = validator(raw);
		switch (res.status) {
			case 'valid':
				break;
			case 'unsupported':
				throw new CheckCliError(
					'unsupported',
					info(`${snapshot} snapshot is of unsupported version, please update drizzle-kit`),
					{ snapshot },
				);
			case 'malformed':
				throw new CheckCliError('malformed', `${snapshot} data is malformed`, { snapshot });
			case 'nonLatest':
				throw new CheckCliError(
					'non_latest',
					`${snapshot} is not of the latest version, please run "drizzle-kit up"`,
					{ snapshot },
				);
		}
	}

	const commutativity = getCommutativityDialect(dialect);
	if (!commutativity) {
		return emptyResult();
	}

	const response = await commutativity.detectNonCommutative(snapshots);
	if (response.conflicts.length > 0) {
		const nonCommutativityMessage = generateReportDirectory(response);
		if (!ignoreConflicts) {
			humanLog(nonCommutativityMessage);
			if (shouldExitOnConflict) {
				throw new CheckCliError('conflicts', nonCommutativityMessage, {
					conflicts: response.conflicts.length,
				});
			}
			return emptyResult(nonCommutativityMessage);
		}
	}

	const selectedBranch = selectOpenCommutativeBranch(response);
	if (selectedBranch) {
		const sortedLeafs = [...selectedBranch.leafs].sort((left, right) => left.id.localeCompare(right.id));
		return {
			statements: sortedLeafs.flatMap((leaf) => leaf.statements),
			parentSnapshot: selectedBranch.parentSnapshot,
			parentId: selectedBranch.parentId,
			leafIds: sortedLeafs.map((leaf) => leaf.id),
		};
	}

	if (ignoreConflicts && response.leafNodes.length > 1) {
		return {
			statements: [],
			parentSnapshot: null,
			leafIds: [...response.leafNodes].sort((left, right) => left.localeCompare(right)),
		};
	}

	return emptyResult();
};
