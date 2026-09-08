import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { upToV2 } from '../../dialects/mssql/versions';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { outputFormat } from '../context';

export const upMssqlHandler = (out: string): string[] => {
	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'mssql');

	const upgraded: string[] = [];
	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			const { snapshot } = upToV2(it.raw);

			if (outputFormat() === 'text') console.log(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(snapshot, null, 2));

			upgraded.push(path);
		});

	if (outputFormat() === 'text') console.log("Everything's fine 🐶🔥");

	return upgraded;
};
