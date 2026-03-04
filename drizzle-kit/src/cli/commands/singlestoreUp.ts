import { existsSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Journal } from 'src/utils';

export const upSinglestoreHandler = (out: string) => {
	// if there is meta folder - and there is a journal - it's version <8
	const metaPath = join(out, 'meta');
	const journalPath = join(metaPath, '_journal.json');
	if (existsSync(metaPath) && existsSync(journalPath)) {
		const journal: Journal = JSON.parse(readFileSync(journalPath).toString());
		if (Number(journal.version) < 8) {
			for (const entry of journal.entries) {
				const snapshotPrefix = entry.tag.split('_')[0];
				const oldSnapshot = readFileSync(join(metaPath, `${snapshotPrefix}_snapshot.json`));
				const oldSql = readFileSync(join(out, `${entry.tag}.sql`));

				writeFileSync(join(out, `${entry.tag}/snapshot.json`), oldSnapshot);
				writeFileSync(join(out, `${entry.tag}/migration.sql`), oldSql);

				unlinkSync(join(out, `${entry.tag}.sql`));
			}

			rmSync(metaPath);
		}
	}
};
