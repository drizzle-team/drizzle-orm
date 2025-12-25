import chalk from 'chalk';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { sync as globSync } from 'glob';
import { join, resolve } from 'path';
import { snapshotValidator as mysqlSnapshotValidator } from 'src/dialects/mysql/snapshot';
import { snapshotValidator as singlestoreSnapshotValidator } from 'src/dialects/singlestore/snapshot';
import { parse } from 'url';
import { error, info } from '../cli/views';
import { snapshotValidator as cockroachValidator } from '../dialects/cockroach/snapshot';
import { snapshotValidator as mssqlValidatorSnapshot } from '../dialects/mssql/snapshot';
import { snapshotValidator as pgSnapshotValidator } from '../dialects/postgres/snapshot';
import { snapshotValidator as sqliteStapshotValidator } from '../dialects/sqlite/snapshot';
import { assertUnreachable } from '.';
import type { Journal } from '.';
import type { Dialect } from './schemaValidator';

export const prepareFilenames = (path: string | string[]) => {
	if (typeof path === 'string') {
		path = [path];
	}

	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const result = path.reduce((result, cur) => {
		const globbed = globSync(`${prefix}${cur}`);

		for (const it of globbed) {
			const fileName = lstatSync(it).isDirectory() ? null : resolve(it);

			const filenames = fileName
				? [fileName!]
				: readdirSync(it).map((file) => join(resolve(it), file));

			for (const file of filenames.filter((file) => !lstatSync(file).isDirectory())) {
				result.add(file);
			}
		}

		return result;
	}, new Set<string>());
	const res = [...result];

	// TODO: properly handle and test
	// const errors = res.filter((it) => {
	// 	return !(
	// 		it.endsWith('.ts')
	// 		|| it.endsWith('.js')
	// 		|| it.endsWith('.cjs')
	// 		|| it.endsWith('.mjs')
	// 		|| it.endsWith('.mts')
	// 		|| it.endsWith('.cts')
	// 	);
	// });

	// when schema: "./schema" and not "./schema.ts"
	if (res.length === 0) {
		console.log(
			error(
				`No schema files found for path config [${
					path
						.map((it) => `'${it}'`)
						.join(', ')
				}]`,
			),
		);
		console.log(
			error(
				`If path represents a file - please make sure to use .ts or other extension in the path`,
			),
		);
		process.exit(1);
	}

	return res;
};

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

export const assertV3OutFolder = (out: string) => {
	if (!existsSync(out)) return;

	if (existsSync(join(out, 'meta/_journal.json'))) {
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

export const dryJournal = (dialect: Dialect): Journal => {
	return {
		version: '7',
		dialect,
		entries: [],
	};
};

export const prepareOutFolder = (out: string) => {
	if (!existsSync(out)) {
		mkdirSync(out, { recursive: true });
	}

	const snapshots = readdirSync(out)
		.map((subdir) => join(out, subdir, 'snapshot.json'))
		.filter((filePath) => existsSync(filePath));

	snapshots.sort();

	return { snapshots };
};

type ValidationResult = { status: 'valid' | 'unsupported' | 'nonLatest' } | { status: 'malformed'; errors: string[] };

const assertVersion = (obj: object, current: number): 'unsupported' | 'nonLatest' | null => {
	const version = 'version' in obj ? Number(obj['version']) : undefined;
	if (!version) return 'unsupported';
	if (version > current) return 'unsupported';
	if (version < current) return 'nonLatest';

	return null;
};

const postgresValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 8);
	if (versionError) return { status: versionError };

	const res = pgSnapshotValidator.parse(snapshot);
	if (!res.success) {
		return { status: 'malformed', errors: res.errors ?? [] };
	}

	return { status: 'valid' };
};

const cockroachSnapshotValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 1);
	if (versionError) return { status: versionError };

	const res = cockroachValidator.parse(snapshot);
	if (!res.success) {
		return { status: 'malformed', errors: res.errors ?? [] };
	}

	return { status: 'valid' };
};

const mysqlValidator = (
	snapshot: object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 6);
	if (versionError) return { status: versionError };

	const { success } = mysqlSnapshotValidator.parse(snapshot);
	if (!success) return { status: 'malformed', errors: [] };

	return { status: 'valid' };
};

const mssqlSnapshotValidator = (
	snapshot: object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 2);
	if (versionError) return { status: versionError };

	const res = mssqlValidatorSnapshot.parse(snapshot);
	if (!res.success) return { status: 'malformed', errors: res.errors ?? [] };

	return { status: 'valid' };
};

const sqliteValidator = (
	snapshot: object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 7);
	if (versionError) return { status: versionError };

	const { success } = sqliteStapshotValidator.parse(snapshot);
	if (!success) {
		return { status: 'malformed', errors: [] };
	}

	return { status: 'valid' };
};

const singlestoreValidator = (
	snapshot: object,
): ValidationResult => {
	const versionError = assertVersion(snapshot, 2);
	if (versionError) return { status: versionError };

	const { success } = singlestoreSnapshotValidator.parse(snapshot);
	if (!success) {
		return { status: 'malformed', errors: [] };
	}
	return { status: 'valid' };
};

export const validatorForDialect = (dialect: Dialect): (snapshot: object) => ValidationResult => {
	switch (dialect) {
		case 'postgresql':
			return postgresValidator;
		case 'sqlite':
			return sqliteValidator;
		case 'turso':
			return sqliteValidator;
		case 'mysql':
			return mysqlValidator;
		case 'singlestore':
			return singlestoreValidator;
		case 'mssql':
			return mssqlSnapshotValidator;
		case 'cockroach':
			return cockroachSnapshotValidator;
		case 'gel':
			throw Error('gel validator is not implemented yet'); // TODO
		case 'duckdb':
			throw Error('duckdb validator is not implemented yet'); // TODO
		default:
			assertUnreachable(dialect);
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
				accum.malformed.push(it);
				return accum;
			}

			if (res.status === 'nonLatest') {
				accum.nonLatest.push(it);
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

export const normaliseSQLiteUrl = (
	it: string,
	type: 'libsql' | 'better-sqlite' | '@tursodatabase/database' | 'bun',
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
		} catch {
			return `file:${it}`;
		}
	}

	if (type === 'better-sqlite' || type === '@tursodatabase/database' || type === 'bun') {
		if (it.startsWith('file:')) {
			return it.substring(5);
		}

		return it;
	}

	assertUnreachable(type);
};

// NextJs default config is target: es5, which esbuild-register can't consume
const assertES5 = async () => {
	try {
		await import('./_es5');
	} catch (e: any) {
		if ('errors' in e && Array.isArray(e.errors) && e.errors.length > 0) {
			const es5Error = (e.errors as any[]).filter((it) => it.text?.includes(`("es5") is not supported yet`)).length > 0;
			if (es5Error) {
				console.log(
					error(
						`Please change compilerOptions.target from 'es5' to 'es6' or above in your tsconfig.json`,
					),
				);
				process.exit(1);
			}
		}
		console.error(e);
		process.exit(1);
	}
};

export class InMemoryMutex {
	private lockPromise: Promise<void> | null = null;

	async withLock<T>(fn: () => Promise<T>): Promise<T> {
		// Wait for any existing lock
		while (this.lockPromise) {
			await this.lockPromise;
		}

		let resolveLock: (() => void) | undefined;
		this.lockPromise = new Promise<void>((resolve) => {
			resolveLock = resolve;
		});

		try {
			return await fn();
		} finally {
			this.lockPromise = null;
			resolveLock!(); // non-null assertion: TS now knows it's definitely assigned
		}
	}
}

const registerMutex = new InMemoryMutex();

let tsxRegistered = false;
const ensureTsxRegistered = () => {
	if (tsxRegistered) return;

	const isBun = typeof (globalThis as any).Bun !== 'undefined';
	const isDeno = typeof (globalThis as any).Deno !== 'undefined';
	if (isBun || isDeno) {
		tsxRegistered = true;
		return;
	}

	const tsx = require('tsx/cjs/api');
	tsx.register();
	tsxRegistered = true;
};

export const safeRegister = async <T>(fn: () => Promise<T>) => {
	return registerMutex.withLock(async () => {
		ensureTsxRegistered();
		await assertES5();
		return fn();
	});
};
