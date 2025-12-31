import chalk from 'chalk';
import fs from 'fs';
import { render } from 'hanji';
import path, { join } from 'path';
import type { CockroachSnapshot } from 'src/dialects/cockroach/snapshot';
import type { MssqlSnapshot } from 'src/dialects/mssql/snapshot';
import type { PostgresSnapshot } from 'src/dialects/postgres/snapshot';
import type { SingleStoreSnapshot } from 'src/dialects/singlestore/snapshot';
import type { MysqlSnapshot } from '../../dialects/mysql/snapshot';
import type { SqliteSnapshot } from '../../dialects/sqlite/snapshot';
import { BREAKPOINT } from '../../utils';
import { prepareMigrationMetadata } from '../../utils/words';
import type { Driver } from '../validations/common';

export const writeResult = (config: {
	snapshot: SqliteSnapshot | PostgresSnapshot | MysqlSnapshot | MssqlSnapshot | CockroachSnapshot | SingleStoreSnapshot;
	sqlStatements: string[];
	outFolder: string;
	breakpoints: boolean;
	name?: string;
	bundle?: boolean;
	type?: 'introspect' | 'custom' | 'none';
	driver?: Driver;
	renames: string[];
	snapshots: string[];
}) => {
	const {
		snapshot,
		sqlStatements,
		outFolder,
		breakpoints,
		name,
		renames,
		bundle = false,
		type = 'none',
		driver,
		snapshots,
	} = config;

	if (type === 'none') {
		if (sqlStatements.length === 0) {
			console.log('No schema changes, nothing to migrate 😴');
			return;
		}
	}

	const { tag } = prepareMigrationMetadata(name);

	snapshot.renames = renames;

	fs.mkdirSync(join(outFolder, tag));
	fs.writeFileSync(
		join(outFolder, `${tag}/snapshot.json`),
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

	fs.writeFileSync(join(outFolder, `${tag}/migration.sql`), sql);

	// js file with .sql imports for React Native / Expo and Durable Sqlite Objects
	if (bundle) {
		// adding new migration to the list of all migrations
		const js = embeddedMigrations([...snapshots || [], join(outFolder, `${tag}/snapshot.json`)], driver);
		fs.writeFileSync(`${outFolder}/migrations.js`, js);
	}

	render(
		`[${
			chalk.green(
				'✓',
			)
		}] Your SQL migration ➜ ${
			chalk.bold.underline.blue(
				path.join(`${outFolder}/${tag}`),
			)
		} 🚀`,
	);
};

export const embeddedMigrations = (snapshots: string[], driver?: Driver) => {
	let content = driver === 'expo'
		? '// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo\n\n'
		: '';

	const migrations: Record<string, string> = {};

	snapshots.forEach((entry, idx) => {
		const prefix = entry.split('/')[entry.split('/').length - 2];
		const importName = idx.toString().padStart(4, '0');
		content += `import m${importName} from './${prefix}/migration.sql';\n`;
		migrations[prefix] = importName;
	});

	content += `
  export default {
    migrations: {
      ${Object.entries(migrations).map(([key, query]) => `"${key}": m${query}`).join(',\n')}
}
  }
  `;

	return content;
};

export const prepareSnapshotFolderName = (ms?: number) => {
	const now = ms ? new Date(ms) : new Date();
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
