import chalk from 'chalk';
import fs from 'fs';
import { render } from 'hanji';
import path, { join } from 'path';
import { CockroachSnapshot } from 'src/dialects/cockroach/snapshot';
import { MssqlSnapshot } from 'src/dialects/mssql/snapshot';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { MysqlSnapshot } from '../../dialects/mysql/snapshot';
import type { SqliteSnapshot } from '../../dialects/sqlite/snapshot';
import { BREAKPOINT, type Journal } from '../../utils';
import { prepareMigrationMetadata } from '../../utils/words';
import type { Driver, Prefix } from '../validations/common';

export const writeResult = (config: {
	snapshot: SqliteSnapshot | PostgresSnapshot | MysqlSnapshot | MssqlSnapshot | CockroachSnapshot;
	sqlStatements: string[];
	journal: Journal;
	outFolder: string;
	breakpoints: boolean;
	prefixMode: Prefix;
	name?: string;
	bundle?: boolean;
	type?: 'introspect' | 'custom' | 'none';
	driver?: Driver;
	renames: string[];
}) => {
	const {
		snapshot,
		sqlStatements,
		journal,
		outFolder,
		breakpoints,
		name,
		renames,
		bundle = false,
		type = 'none',
		prefixMode,
		driver,
	} = config;

	if (type === 'none') {
		// TODO: handle
		// console.log(schema(cur));

		if (sqlStatements.length === 0) {
			console.log('No schema changes, nothing to migrate 😴');
			return;
		}
	}

	// append entry to _migrations.json
	// append entry to _journal.json->entries
	// dialect in _journal.json
	// append sql file to out folder
	// append snapshot file to meta folder
	const lastEntryInJournal = journal.entries[journal.entries.length - 1];
	const idx = typeof lastEntryInJournal === 'undefined' ? 0 : lastEntryInJournal.idx + 1;

	const { prefix, tag } = prepareMigrationMetadata(idx, prefixMode, name);

	snapshot.renames = renames;

	// todo: save results to a new migration folder
	const metaFolderPath = join(outFolder, 'meta');
	const metaJournal = join(metaFolderPath, '_journal.json');

	fs.writeFileSync(
		join(metaFolderPath, `${prefix}_snapshot.json`),
		JSON.stringify(JSON.parse(JSON.stringify(snapshot)), null, 2),
	);

	const sqlDelimiter = breakpoints ? BREAKPOINT : '\n';
	let sql = sqlStatements.join(sqlDelimiter);

	if (type === 'introspect') {
		sql =
			`-- Current sql file was generated after introspecting the database\n-- If you want to run this migration please uncomment this code before executing migrations\n/*\n${sql}\n*/`;
	}

	if (type === 'custom') {
		console.log('Prepared empty file for your custom SQL migration!');
		sql = '-- Custom SQL migration file, put your code below! --';
	}

	journal.entries.push({
		idx,
		version: snapshot.version,
		when: +new Date(),
		tag,
		breakpoints: breakpoints,
	});

	fs.writeFileSync(metaJournal, JSON.stringify(journal, null, 2));

	fs.writeFileSync(`${outFolder}/${tag}.sql`, sql);

	// js file with .sql imports for React Native / Expo and Durable Sqlite Objects
	if (bundle) {
		const js = embeddedMigrations(journal, driver);
		fs.writeFileSync(`${outFolder}/migrations.js`, js);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your SQL migration file ➜ ${
			chalk.bold.underline.blue(
				path.join(`${outFolder}/${tag}.sql`),
			)
		} 🚀`,
	);
};

export const embeddedMigrations = (journal: Journal, driver?: Driver) => {
	let content = driver === 'expo'
		? '// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo\n\n'
		: '';

	content += "import journal from './meta/_journal.json';\n";
	journal.entries.forEach((entry) => {
		content += `import m${entry.idx.toString().padStart(4, '0')} from './${entry.tag}.sql';\n`;
	});

	content += `
  export default {
    journal,
    migrations: {
      ${
		journal.entries
			.map((it) => `m${it.idx.toString().padStart(4, '0')}`)
			.join(',\n')
	}
    }
  }
  `;
	return content;
};

export const prepareSnapshotFolderName = () => {
	const now = new Date();
	return `${now.getFullYear()}${two(now.getUTCMonth() + 1)}${
		two(
			now.getUTCDate(),
		)
	}${two(now.getUTCHours())}${two(now.getUTCMinutes())}${
		two(
			now.getUTCSeconds(),
		)
	}`;
};

const two = (input: number): string => {
	return input.toString().padStart(2, '0');
};
