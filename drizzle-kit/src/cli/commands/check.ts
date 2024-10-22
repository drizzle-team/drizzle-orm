import { Dialect } from '../../schemaValidator';
import { prepareOutFolder, validateWithReport } from '../../utils';

export const checkHandler = (out: string, dialect: Dialect) => {
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

	const abort = report.malformed.length!! || collisionEntries.length > 0;

	if (abort) {
		process.exit(1);
	}
};
