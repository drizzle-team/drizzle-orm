import { Dialect } from '../../schemaValidator';
import { type Journal, prepareOutFolder, validateWithReport } from '../../utils';

export const checkHandler = (out: string, dialect: Dialect) => {
	const { snapshots, journal } = prepareOutFolder(out, dialect);
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

	let latest: Journal['entries'][number] | undefined;
	for (const entry of (journal as Journal).entries) {
		if (latest && entry.when <= latest.when) {
			console.warn(
				`Warning: ${entry.tag} (idx: ${entry.idx}, when: ${entry.when}) follows `
					+ `${latest.tag} (idx: ${latest.idx}, when: ${latest.when}) in the journal, `
					+ 'but its timestamp is not greater. If the earlier entry has already been applied, '
					+ 'the migrator will skip this entry. Journal timestamps must strictly increase in entry order.',
			);
		} else {
			latest = entry;
		}
	}

	const abort = report.malformed.length!! || collisionEntries.length > 0;

	if (abort) {
		process.exit(1);
	}
};
