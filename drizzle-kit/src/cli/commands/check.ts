import chalk from 'chalk';
import { readFileSync } from 'fs';
import { render } from 'hanji';
import type { MigrationNode, NonCommutativityReport, UnifiedBranchConflict } from 'src/utils/commutativity';
import { detectNonCommutative } from 'src/utils/commutativity';
import type { Dialect } from '../../utils/schemaValidator';
import { prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { info } from '../views';

// ─── Shared helpers ──────────────────────────────────────────────────────────

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

export const renderReportDirectory = (
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

	lines.push(
		chalk.gray('\nPlease refer to our guide on how to resolve such conflicts:'),
		chalk.bold.underline.blue('https://orm.drizzle.team/docs/migrations'),
	);
	return lines.join('\n');
};

export const checkHandler = async (
	out: string,
	dialect: Dialect,
	ignoreConflicts?: boolean,
) => {
	const { snapshots } = prepareOutFolder(out);
	const validator = validatorForDialect(dialect);

	for (const snapshot of snapshots) {
		const raw = JSON.parse(readFileSync(`./${snapshot}`).toString());

		const res = validator(raw);
		if (res.status === 'unsupported') {
			console.log(
				info(
					`${snapshot} snapshot is of unsupported version, please update drizzle-kit`,
				),
			);
			process.exit(0);
		}
		if (res.status === 'malformed') {
			console.log(`${snapshot} data is malformed`);
			process.exit(1);
		}

		if (res.status === 'nonLatest') {
			console.log(
				`${snapshot} is not of the latest version, please run "drizzle-kit up"`,
			);
			process.exit(1);
		}
	}

	if (ignoreConflicts) {
		return;
	}

	try {
		const response = await detectNonCommutative(snapshots, dialect);
		if (response.conflicts.length === 0) {
			return;
		}

		render(renderReportDirectory(response));
		process.exit(1);
	} catch (e) {
		console.error(e);
	}
};
