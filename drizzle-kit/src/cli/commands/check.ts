import { readFileSync } from 'fs';
import type { Dialect } from '../../utils/schemaValidator';
import { prepareOutFolder, validatorForDialect } from '../../utils/utils-node';
import { info } from '../views';

export const checkHandler = async (out: string, dialect: Dialect) => {
	const { snapshots } = prepareOutFolder(out);
	const validator = validatorForDialect(dialect);

	// const snapshotsData: PostgresSnapshot[] = [];

	for (const snapshot of snapshots) {
		const raw = JSON.parse(readFileSync(`./${snapshot}`).toString());

		// snapshotsData.push(raw);

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
			// more explanation
			console.log(`${snapshot} data is malformed`);
			process.exit(1);
		}

		if (res.status === 'nonLatest') {
			console.log(`${snapshot} is not of the latest version, please run "drizzle-kit up"`);
			process.exit(1);
		}
	}

	// try {
	// 	const response = await detectNonCommutative(snapshots, dialect);
	// 	if (response!.conflicts.length > 0) {
	// 		console.log('\nNon-commutative migration branches detected:');
	// 		for (const c of response!.conflicts) {
	// 			console.log(`- Parent ${c.parentId}${c.parentPath ? ` (${c.parentPath})` : ''}`);
	// 			console.log(`  A: ${c.branchA.headId} (${c.branchA.path})`);
	// 			console.log(`  B: ${c.branchB.headId} (${c.branchB.path})`);
	// 			// for (const r of c.reasons) console.log(`    • ${r}`);
	// 		}
	// 	}
	// } catch (e) {
	// 	console.error(e);
	// }
};
