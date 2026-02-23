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

const footer = (): string[] => {
	return [
		'',
		chalk.gray('Please refer to our guide on how to resolve such conflicts:'),
		chalk.bold.underline.blue('https://orm.drizzle.team/docs/migrations'),
		'',
	];
};

export const renderSuccess = (): string => {
	return `\n[${chalk.green('✓')}] All migrations are commutative. No conflicts detected.\n`;
};

export const renderReportDirectory = (
	report: NonCommutativityReport,
): string => {
	const { conflicts } = report;
	const lines: string[] = ['', headerBadge(conflicts), ''];

	// Group conflicts by parentId so we can render N branches per parent
	const byParent = new Map<string, UnifiedBranchConflict[]>();
	for (const c of conflicts) {
		const key = c.parentId;
		if (!byParent.has(key)) byParent.set(key, []);
		byParent.get(key)!.push(c);
	}

	const parentEntries = [...byParent.entries()];

	for (let p = 0; p < parentEntries.length; p++) {
		const [parentId, parentConflicts] = parentEntries[p];
		const parentLabel = parentConflicts[0].parentPath ?? parentId;

		// Collect all unique branches (dedupe by leaf id)
		const branches: { chain: MigrationNode[]; descriptions: string[] }[] = [];
		const seenLeafs = new Map<string, number>(); // leaf id -> index in branches

		for (const c of parentConflicts) {
			for (const branch of [c.branchA, c.branchB]) {
				const leafId = branch.chain[branch.chain.length - 1]?.id ?? '';
				if (seenLeafs.has(leafId)) {
					const idx = seenLeafs.get(leafId)!;
					if (
						!branches[idx].descriptions.includes(branch.statementDescription)
					) {
						branches[idx].descriptions.push(branch.statementDescription);
					}
				} else {
					seenLeafs.set(leafId, branches.length);
					branches.push({
						chain: branch.chain,
						descriptions: [branch.statementDescription],
					});
				}
			}
		}

		// Parent node (root of this group)
		lines.push(`  ${chalk.white(parentLabel)}`);

		for (let b = 0; b < branches.length; b++) {
			const branch = branches[b];
			const isLastBranch = b === branches.length - 1;
			const branchPrefix = isLastBranch ? '    ' : '│   ';

			// Render each migration in the chain on its own line
			for (let m = 0; m < branch.chain.length; m++) {
				const node = branch.chain[m];
				const isFirstInChain = m === 0;
				const isLeaf = m === branch.chain.length - 1;

				const label = isLeaf
					? chalk.red.bold(node.path)
					: chalk.green(node.path);

				if (isFirstInChain) {
					// First migration gets the branch connector (├── or └──)
					const connector = isLastBranch ? '└──' : '├──';
					lines.push(`  ${chalk.gray(connector)} ${label}`);
				} else {
					// Subsequent migrations: plain text under the branch prefix, no connector
					lines.push(`  ${chalk.gray(branchPrefix)}${label}`);
				}
			}

			// Conflict descriptions beneath the chain with single-dash connectors
			for (let d = 0; d < branch.descriptions.length; d++) {
				const isLastDesc = d === branch.descriptions.length - 1;
				const descConnector = isLastDesc ? '└─' : '├─';
				lines.push(
					`  ${chalk.gray(branchPrefix)}${chalk.gray(descConnector)} ${chalk.yellow('⚠')} ${
						chalk.yellow(
							branch.descriptions[d],
						)
					}`,
				);
			}
		}

		// Add spacing between parent groups
		if (p < parentEntries.length - 1) lines.push('');
	}

	lines.push(...footer());
	return lines.join('\n');
};

// ─── Handler ─────────────────────────────────────────────────────────────────

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
			// render(renderSuccess());
			return;
		}

		render(renderReportDirectory(response));
		process.exit(1);
	} catch (e) {
		console.error(e);
	}
};
