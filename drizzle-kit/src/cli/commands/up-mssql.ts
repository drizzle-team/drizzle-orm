import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { upToV2 } from 'src/dialects/mssql/versions';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { humanLog } from '../views';
import type { UpJsonState } from './up-state';

export const upMssqlHandler = (out: string, jsonState?: UpJsonState) => {
	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'mssql');

	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			const { snapshot } = upToV2(it.raw);

			if (jsonState) {
				jsonState.addUpgradedFile(path);
			}

			humanLog(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(snapshot, null, 2));
		});

	humanLog("Everything's fine 🐶🔥");
};
