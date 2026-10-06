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
import { upHashStamp } from '../../utils/utils-node';
import { prepareMigrationMetadata } from '../../utils/words';
import { outputFormat } from '../context';
import type { Driver } from '../validations/common';
import { withStyle } from '../validations/outputs';
import { humanLog } from '../views';
import {
	collectIrreversibleDownWarnings,
	describeIrreversibleWarnings,
	type DownResult,
	formatIrreversibleBanner,
} from './generate-down-helpers';

export const DOWN_SQL_HEADER =
	'-- Auto-generated rollback for the migration above, produced from the reverse schema diff.\n'
	+ '-- It reverses structural (DDL) changes only. Custom or data statements you add to\n'
	+ '-- migration.sql are NOT reversed automatically — add their inverse here by hand.\n'
	+ '-- Review before relying on it in production. The up-hash line lets `drizzle-kit check`\n'
	+ '-- warn when migration.sql changes after this file was generated.';

export const CUSTOM_DOWN_SQL_SCAFFOLD = '-- Custom SQL rollback file, put your reverse statements below! --';

type WriteResultConfigBase = {
	snapshot: SqliteSnapshot | PostgresSnapshot | MysqlSnapshot | MssqlSnapshot | CockroachSnapshot | SingleStoreSnapshot;
	sqlStatements: string[];
	down?: DownResult;
	outFolder: string;
	breakpoints: boolean;
	generateDownMigrations: boolean;
	name?: string;
	bundle?: boolean;
	dialect?: string;
	driver?: Driver;
	renames: string[];
	snapshots: string[];
};

export function writeResult(
	config: WriteResultConfigBase & { type: 'introspect'; init: boolean },
): { snapshotPath: string; migrationPath: string };
export function writeResult(
	config: WriteResultConfigBase & { type?: 'custom' | 'none' },
):
	| { status: 'no_changes'; dialect: string | undefined }
	| { status: 'ok'; dialect: string | undefined; migration_path: string };
export function writeResult(
	config:
		& WriteResultConfigBase
		& (
			| { type: 'introspect'; init: boolean }
			| { type?: 'custom' | 'none'; init?: never }
		),
) {
	const {
		snapshot,
		sqlStatements,
		down,
		outFolder,
		breakpoints,
		generateDownMigrations,
		name,
		renames,
		bundle = false,
		type = 'none',
		init,
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

	if (type === 'introspect' && !init) {
		sql =
			`-- Current sql file was generated after introspecting the database\n-- If you want to run this migration please uncomment this code before executing migrations\n/*\n${sql}\n*/`;
	}

	if (type === 'custom') {
		humanLog('Prepared empty file for your custom SQL migration!');
		sql = '-- Custom SQL migration file, put your code below! --';
	}

	fs.writeFileSync(join(outFolder, `${tag}/migration.sql`), sql);
	const migrationPath = path.join(`${outFolder}/${tag}/migration.sql`);

	if (generateDownMigrations) {
		const downPath = join(outFolder, `${tag}/down.sql`);
		if (type === 'custom') {
			fs.writeFileSync(downPath, CUSTOM_DOWN_SQL_SCAFFOLD);
		} else if (down && 'error' in down) {
			const reason = down.error instanceof Error ? down.error.message : String(down.error);
			humanLog(
				withStyle.warning(
					`Could not generate a rollback for ${tag}, so no down.sql was written: ${reason}`,
				),
			);
		} else if (down && down.sqlStatements.length > 0) {
			const stamp = upHashStamp(sql);
			const warnings = collectIrreversibleDownWarnings(down.statements);
			const banner = formatIrreversibleBanner(warnings);
			const header = banner ? `${DOWN_SQL_HEADER}\n${banner}` : DOWN_SQL_HEADER;
			fs.writeFileSync(downPath, `${stamp}\n${header}\n${down.sqlStatements.join(sqlDelimiter)}`);
			if (warnings.length > 0) {
				humanLog(
					withStyle.warning(
						`${downPath} needs review; best-effort checks flagged:\n${
							describeIrreversibleWarnings(warnings).join('\n')
						}`,
					),
				);
			}
		}
	}

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
	const downMigrations: Record<string, string> = {};

	snapshots.forEach((entry, idx) => {
		const folder = path.dirname(entry);
		const tag = path.basename(folder);
		const importName = idx.toString().padStart(4, '0');
		content += `import m${importName} from './${tag}/migration.sql';\n`;
		migrations[tag] = importName;
		if (fs.existsSync(join(folder, 'down.sql'))) {
			content += `import d${importName} from './${tag}/down.sql';\n`;
			downMigrations[tag] = importName;
		}
	});

	const hasDown = Object.keys(downMigrations).length > 0;
	const downBlock = hasDown
		? `,\n    downMigrations: {\n      ${
			Object.entries(downMigrations).map(([key, query]) => `"${key}": d${query}`).join(',\n      ')
		}\n    }`
		: '';

	content += `
  export default {
    migrations: {
      ${Object.entries(migrations).map(([key, query]) => `"${key}": m${query}`).join(',\n      ')}
    }${downBlock}
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
