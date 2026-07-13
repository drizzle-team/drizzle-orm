import chalk from 'chalk';
import fs from 'fs';
import { render } from 'hanji';
import path, { join } from 'path';
import type { CockroachSnapshot } from '../../dialects/cockroach/snapshot';
import type { MssqlSnapshot } from '../../dialects/mssql/snapshot';
import type { MysqlSnapshot } from '../../dialects/mysql/snapshot';
import type { PostgresSnapshot } from '../../dialects/postgres/snapshot';
import type { SingleStoreSnapshot } from '../../dialects/singlestore/snapshot';
import type { SqliteSnapshot } from '../../dialects/sqlite/snapshot';
import { BREAKPOINT } from '../../utils';
import { prepareMigrationMetadata } from '../../utils/words';
import { outputFormat } from '../context';
import type { Driver } from '../validations/common';
import { humanLog } from '../views';

type WriteResultConfigBase = {
	snapshot: SqliteSnapshot | PostgresSnapshot | MysqlSnapshot | MssqlSnapshot | CockroachSnapshot | SingleStoreSnapshot;
	sqlStatements: string[];
	outFolder: string;
	breakpoints: boolean;
	name?: string;
	bundle?: boolean;
	dialect?: string;
	driver?: Driver;
	renames: string[];
	snapshots: string[];
};

export function writeResult(
	config: WriteResultConfigBase & { type: 'introspect' },
): { snapshotPath: string; migrationPath: string };
export function writeResult(
	config: WriteResultConfigBase & { type?: 'custom' | 'none' },
):
	| { status: 'no_changes'; dialect: string | undefined }
	| { status: 'ok'; dialect: string | undefined; migration_path: string };
export function writeResult(
	config: WriteResultConfigBase & { type?: 'introspect' | 'custom' | 'none' },
) {
	const {
		snapshot,
		sqlStatements,
		outFolder,
		breakpoints,
		name,
		renames,
		bundle = false,
		type = 'none',
		dialect,
		driver,
		snapshots,
	} = config;
	const json = outputFormat() === 'json';

	if (type === 'none') {
		if (sqlStatements.length === 0) {
			humanLog('No schema changes, nothing to migrate 😴');
			return { status: 'no_changes' as const, dialect };
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
		humanLog('Prepared empty file for your custom SQL migration!');
		sql = '-- Custom SQL migration file, put your code below! --';
	}

	fs.writeFileSync(join(outFolder, `${tag}/migration.sql`), sql);
	const migrationPath = path.join(`${outFolder}/${tag}/migration.sql`);

	// js file with .sql imports for React Native / Expo and Durable Sqlite Objects
	if (bundle) {
		// adding new migration to the list of all migrations
		const js = embeddedMigrations([...snapshots || [], join(outFolder, `${tag}/snapshot.json`)], driver);
		fs.writeFileSync(`${outFolder}/migrations.js`, js);
	}

	if (!json) {
		render(
			`[${
				chalk.green(
					'✓',
				)
			}] Your SQL migration ➜ ${
				chalk.bold.underline.blue(
					migrationPath,
				)
			} 🚀`,
		);
	}

	if (type === 'introspect') {
		return { snapshotPath: join(outFolder, `${tag}/snapshot.json`), migrationPath };
	}

	return { status: 'ok' as const, dialect, migration_path: migrationPath };
}

export const embeddedMigrations = (snapshots: string[], driver?: Driver) => {
	let content = driver === 'expo'
		? '// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo\n\n'
		: '';

	const migrations: Record<string, string> = {};

	snapshots.forEach((entry, idx) => {
		const prefix = entry.split(path.sep)[entry.split(path.sep).length - 2];
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
