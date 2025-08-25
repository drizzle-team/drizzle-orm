import { detectNonCommutative } from 'src/utils/commutativity';
import { Dialect } from '../../utils/schemaValidator';
import { prepareOutFolder, validateWithReport } from '../../utils/utils-node';

export const checkHandler = async (out: string, dialect: Dialect) => {
	const { snapshots } = prepareOutFolder(out, dialect);
	const report = validateWithReport(snapshots, dialect);

	if (report.nonLatest.length > 0) {
		console.log(
			report.nonLatest
				.map((it) => {
					return `${it} is not of the latest version, please run "drizzle-kit up"`;
				})
				.join('\n'),
		);
		process.exit(1);
	}

	if (report.malformed.length) {
		const message = report.malformed
			.map((it) => {
				return `${it} data is malformed`;
			})
			.join('\n');
		console.log(message);
	}

	const collisionEntries = Object.entries(report.idsMap).filter(
		(it) => it[1].snapshots.length > 1,
	);

	const message = collisionEntries
		.map((it) => {
			const data = it[1];
			return `[${
				data.snapshots.join(
					', ',
				)
			}] are pointing to a parent snapshot: ${data.parent}/snapshot.json which is a collision.`;
		})
		.join('\n');

	if (message) {
		console.log(message);
	}

	// Non-commutative detection for branching
	try {
		const nc = await detectNonCommutative(snapshots, dialect);
		if (nc.conflicts.length > 0) {
			console.log('\nNon-commutative migration branches detected:');
			for (const c of nc.conflicts) {
				console.log(`- Parent ${c.parentId}${c.parentPath ? ` (${c.parentPath})` : ''}`);
				console.log(`  A: ${c.branchA.headId} (${c.branchA.path})`);
				console.log(`  B: ${c.branchB.headId} (${c.branchB.path})`);
				for (const r of c.reasons) console.log(`    • ${r}`);
			}
		}
	} catch (e) {
		
	}

	const abort = report.malformed.length!! || collisionEntries.length > 0;

	if (abort) {
		process.exit(1);
	}
};
