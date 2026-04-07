import chalk from 'chalk';
import { writeFileSync } from 'fs';
import { upToV8 } from 'src/dialects/postgres/versions';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';
import { humanLog } from '../views';
import type { UpJsonState } from './up-state';
import { migrateToFoldersV3 } from './utils';

export const upPgHandler = (out: string, jsonState?: UpJsonState) => {
	migrateToFoldersV3(out);

	const { snapshots } = prepareOutFolder(out);
	const report = validateWithReport(snapshots, 'postgresql');

	report.nonLatest
		.map((it) => ({
			path: it,
			raw: report.rawMap[it]! as Record<string, any>,
		}))
		.forEach((it) => {
			const path = it.path;

			const { snapshot } = upToV8(it.raw);

			if (jsonState) {
				jsonState.addUpgradedFile(path);
			}

			humanLog(`[${chalk.green('✓')}] ${path}`);

			writeFileSync(path, JSON.stringify(snapshot, null, 2));
		});

	humanLog("Everything's fine 🐶🔥");
};
