import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'url';
import { info } from './cli/views';
import { assertUnreachable } from './global';
import type { Dialect } from './schemaValidator';
import { mysqlSchemaV5 } from './serializer/mysqlSchema';
import { singlestoreSchema } from './serializer/singlestoreSchema';
import { dryJournal } from './utils';
import { snapshotValidator } from './dialects/postgres/snapshot';

export const assertV1OutFolder = (out: string) => {
	if (!existsSync(out)) return;

	const oldMigrationFolders = readdirSync(out).filter(
		(it) => it.length === 14 && /^\d+$/.test(it),
	);

	if (oldMigrationFolders.length > 0) {
		console.log(
			`Your migrations folder format is outdated, please run ${
				chalk.green.bold(
					`drizzle-kit up`,
				)
			}`,
		);
		process.exit(1);
	}
};

export const prepareOutFolder = (out: string, dialect: Dialect) => {
	const meta = join(out, 'meta');
	const journalPath = join(meta, '_journal.json');

	if (!existsSync(join(out, 'meta'))) {
		mkdirSync(meta, { recursive: true });
		writeFileSync(journalPath, JSON.stringify(dryJournal(dialect)));
	}

	const journal = JSON.parse(readFileSync(journalPath).toString());

	const snapshots = readdirSync(meta)
		.filter((it) => !it.startsWith('_'))
		.map((it) => join(meta, it));

	snapshots.sort();
	return { meta, snapshots, journal };
};

type ValidationResult = { status: 'valid' | 'unsupported' | 'nonLatest' } | { status: 'malformed'; errors: string[] };

const assertVersion = (obj: Object, current: number): 'unsupported' | 'nonLatest' | null => {
	const version = 'version' in obj ? Number(obj['version']) : undefined;
	if (!version) return 'unsupported';
	if (version > current) return 'unsupported';
	if (version < current) return 'nonLatest';

	return null;
};

const postgresValidator = (snapshot: Object): ValidationResult => {
	const versionError = assertVersion(snapshot, 7);
	if (versionError) return { status: versionError };

	const res = snapshotValidator.parse(snapshot);
	if (!res.success) return { status: 'malformed', errors: [] };

	return { status: 'valid' };
};

const mysqlSnapshotValidator = (
	snapshot: Object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 5);
	if (versionError) return { status: versionError };

	const { success } = mysqlSchemaV5.safeParse(snapshot);
	if (!success) return { status: 'malformed', errors: [] };

	return { status: 'valid' };
};

const sqliteSnapshotValidator = (
	snapshot: Object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 7);
	if (versionError) return { status: versionError };

	const { success } = snapshotValidator.parse(snapshot);
	if (!success) {
		return { status: 'malformed', errors: [] };
	}

	return { status: 'valid' };
};

const singlestoreSnapshotValidator = (
	snapshot: Object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 1);
	if (versionError) return { status: versionError };

	const { success } = singlestoreSchema.safeParse(snapshot);
	if (!success) return { status: 'malformed', errors: [] };

	return { status: 'valid' };
};

const validatorForDialect = (dialect: Dialect): (snapshot: Object) => ValidationResult => {
	switch (dialect) {
		case 'postgresql':
			return postgresValidator;
		case 'sqlite':
			return sqliteSnapshotValidator;
		case 'turso':
			return sqliteSnapshotValidator;
		case 'mysql':
			return mysqlSnapshotValidator;
		case 'singlestore':
			return singlestoreSnapshotValidator;
	}
};

export const validateWithReport = (snapshots: string[], dialect: Dialect) => {
	// ✅ check if drizzle-kit can handle snapshot version
	// ✅ check if snapshot is of the last version
	// ✅ check if id of the snapshot is valid
	// ✅ collect {} of prev id -> snapshotName[], if there's more than one - tell about collision
	const validator = validatorForDialect(dialect);

	const result = snapshots.reduce(
		(accum, it) => {
			const raw = JSON.parse(readFileSync(`./${it}`).toString());

			accum.rawMap[it] = raw;

			const res = validator(raw);
			if (res.status === 'unsupported') {
				console.log(
					info(
						`${it} snapshot is of unsupported version, please update drizzle-kit`,
					),
				);
				process.exit(0);
			}
			if (res.status === 'malformed') {
				accum.malformed.push(raw);
				return accum;
			}

			if (res.status === 'nonLatest') {
				accum.nonLatest.push(raw);
				return accum;
			}

			// only if latest version here
			const idEntry = accum.idsMap[raw['prevId']] ?? {
				parent: it,
				snapshots: [],
			};

			idEntry.snapshots.push(it);
			accum.idsMap[raw['prevId']] = idEntry;
			return accum;
		},
		{
			malformed: [],
			nonLatest: [],
			idToNameMap: {},
			idsMap: {},
			rawMap: {},
		} as {
			malformed: string[];
			nonLatest: string[];
			idsMap: Record<string, { parent: string; snapshots: string[] }>;
			rawMap: Record<string, any>;
		},
	);

	return result;
};

export const prepareMigrationFolder = (
	outFolder: string = 'drizzle',
	dialect: Dialect,
) => {
	const { snapshots, journal } = prepareOutFolder(outFolder, dialect);
	const report = validateWithReport(snapshots, dialect);
	if (report.nonLatest.length > 0) {
		console.log(
			report.nonLatest
				.map((it) => {
					return `${it}/snapshot.json is not of the latest version`;
				})
				.concat(`Run ${chalk.green.bold(`drizzle-kit up`)}`)
				.join('\n'),
		);
		process.exit(0);
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
		.join('\n')
		.trim();
	if (message) {
		console.log(chalk.red.bold('Error:'), message);
	}

	const abort = report.malformed.length!! || collisionEntries.length > 0;

	if (abort) {
		process.exit(0);
	}

	return { snapshots, journal };
};

export const normaliseSQLiteUrl = (
	it: string,
	type: 'libsql' | 'better-sqlite',
) => {
	if (type === 'libsql') {
		if (it.startsWith('file:')) {
			return it;
		}
		try {
			const url = parse(it);
			if (url.protocol === null) {
				return `file:${it}`;
			}
			return it;
		} catch (e) {
			return `file:${it}`;
		}
	}

	if (type === 'better-sqlite') {
		if (it.startsWith('file:')) {
			return it.substring(5);
		}

		return it;
	}

	assertUnreachable(type);
};
