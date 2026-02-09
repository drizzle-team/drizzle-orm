import { prepareOutFolder } from '../../utils/utils-node';
import { migrateToFoldersV3 } from './utils';

export const upDsqlHandler = (out: string) => {
	migrateToFoldersV3(out);

	// DSQL snapshots are currently at version 1, no upgrades needed yet
	prepareOutFolder(out);

	console.log("Everything's fine 🐶🔥");
};
