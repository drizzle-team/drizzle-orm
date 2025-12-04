import chalk from 'chalk';
import { readFileSync, rmSync, writeFileSync } from 'fs';
import fs from 'fs';
import { render } from 'hanji';
import { join } from 'path';
import { Journal } from '../../utils';
import { DropMigrationView } from '../views';
import { embeddedMigrations } from './migrate';

export const dropMigration = async ({
	out,
	bundle,
	name,
}: {
	out: string;
	bundle: boolean;
	name?: string;
}) => {
	const metaFilePath = join(out, 'meta', '_journal.json');
	const journal = JSON.parse(readFileSync(metaFilePath, 'utf-8')) as Journal;

	if (journal.entries.length === 0) {
		console.log(
			`[${chalk.blue('i')}] no migration entries found in ${metaFilePath}`,
		);
		return;
	}

	const result = await (async () => {
		if (name) {
			const entry = journal.entries.find((item) => item.tag === name);

			if (!entry) {
				console.log(
					`[${chalk.red('✗')}] migration ${name} not found`,
				);
				return;
			}

			return entry;
		}

		const renderResult = await render(new DropMigrationView(journal.entries));

		if (renderResult.status === 'aborted') return;

		return renderResult.data;
	})();

	if (!result) return;

	delete journal.entries[journal.entries.indexOf(result)];

	const resultJournal: Journal = {
		...journal,
		entries: journal.entries.filter(Boolean),
	};
	const sqlFilePath = join(out, `${result.tag}.sql`);
	const snapshotFilePath = join(
		out,
		'meta',
		`${result.tag.split('_')[0]}_snapshot.json`,
	);
	rmSync(sqlFilePath);
	rmSync(snapshotFilePath);
	writeFileSync(metaFilePath, JSON.stringify(resultJournal, null, 2));

	if (bundle) {
		fs.writeFileSync(
			join(out, `migrations.js`),
			embeddedMigrations(resultJournal),
		);
	}

	console.log(
		`[${chalk.green('✓')}] ${
			chalk.bold(
				result.tag,
			)
		} migration successfully dropped`,
	);
};
