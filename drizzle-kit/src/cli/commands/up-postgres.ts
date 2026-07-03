import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { upToV8 } from '../../dialects/postgres/versions';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { outputFormat } from '../context';
import { migrateToFoldersV3 } from './utils';

export const upPgHandler = (out: string): string[] => {
	migrateToFoldersV3(out);

	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'postgresql');

	const upgraded: string[] = [];
	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			const { snapshot } = upToV8(it.raw);

			if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(snapshot, null, 2));

			upgraded.push(path);
		});

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return upgraded;
};
