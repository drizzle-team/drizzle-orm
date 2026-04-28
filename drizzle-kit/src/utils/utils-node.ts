import chalk from 'chalk';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { getTsconfig } from 'get-tsconfig';
import { sync as globSync } from 'glob';
import { dirname, join, resolve } from 'path';
import { snapshotValidator as mysqlSnapshotValidator } from 'src/dialects/mysql/snapshot';
import { snapshotValidator as singlestoreSnapshotValidator } from 'src/dialects/singlestore/snapshot';
import { parse, pathToFileURL } from 'url';
import { SchemaFilesNotFoundCliError, UnsupportedSnapshotVersionCliError } from '../cli/errors';
import { humanLog } from '../cli/views';
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

	const skippedFiles: string[] = [];

	const result = path.reduce((result, cur) => {
		const globbed = globSync(`${prefix}${cur}`);

		for (const it of globbed) {
			const stats = lstatSync(it);

			const fileName = stats.isDirectory() ? null : resolve(it);

			const filenames = fileName
				? [{ path: fileName, stat: stats }]
				: readdirSync(it).map((file) => {
					const fullPath = join(resolve(it), file);
					return { path: fullPath, stat: lstatSync(fullPath) };
				});

			for (const { path: file, stat } of filenames) {
				if (stat.isDirectory()) continue;

				if (
					file.endsWith('.js')
					|| file.endsWith('.mjs')
					|| file.endsWith('.cjs')
					|| file.endsWith('.jsx')
					|| file.endsWith('.ts')
					|| file.endsWith('.mts')
					|| file.endsWith('.cts')
					|| file.endsWith('.tsx')
				) {
					result.add(file);
				} else {
					skippedFiles.push(file);
				}
			}
		}

		return result;
	}, new Set<string>());
	const res = [...result];

	// TODO can be added. Need approve on this
	// if (skippedFiles.length > 0) {
	// 	console.log(info(` ⚠ Skipped ${chalk.blue(skippedFiles.join(', '))} file(s)`));
	// }

	// when schema: "./schema" and not "./schema.ts"
	if (res.length === 0) {
		throw new SchemaFilesNotFoundCliError(path);
	}

	return res;
};

export const assertV1OutFolder = (out: string) => {
	if (!existsSync(out)) return;

	const oldMigrationFolders = readdirSync(out).filter(
		(it) => it.length === 14 && /^\d+$/.test(it),
	);

	if (oldMigrationFolders.length > 0) {
		humanLog(
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
		humanLog(
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

const tsconfigAliasCache = new Map<string, Record<string, string> | undefined>();

const getAliasesForTsconfig = (baseDir: string): Record<string, string> | undefined => {
	const cached = tsconfigAliasCache.get(baseDir);
	if (cached !== undefined || tsconfigAliasCache.has(baseDir)) {
		return cached;
	}

	const tsconfig = getTsconfig(baseDir);
	const tsconfigPaths = tsconfig?.config?.compilerOptions?.paths as Record<string, string[]> | undefined;
	if (!tsconfigPaths || !tsconfig?.path) {
		tsconfigAliasCache.set(baseDir, undefined);
		return undefined;
	}

	const tsconfigBaseUrl = tsconfig.config.compilerOptions?.baseUrl ?? '.';
	const tsconfigDir = dirname(tsconfig.path);

	const aliases = Object.fromEntries(
		Object.entries(tsconfigPaths).flatMap(([key, values]) => {
			const targets = (values ?? []).filter((value): value is string => Boolean(value));
			if (targets.length === 0) return [];

			const hasWildcard = key.includes('*') || targets.some((target) => target.includes('*'));
			const supportsTrailingWildcard = key.endsWith('/*') && targets.every((target) => target.endsWith('/*'));
			if (hasWildcard && !supportsTrailingWildcard) {
				console.warn(
					chalk.yellow(
						`[drizzle-kit] Unsupported tsconfig "paths" mapping "${key}": [${
							targets
								.map((target) => `"${target}"`)
								.join(', ')
						}]. Only trailing "/*" patterns are supported; this mapping will be ignored.`,
					),
				);
				return [];
			}

			const aliasKey = key.endsWith('/*') ? key.slice(0, -1) : key;
			const resolvedTargets = targets.map((target) => {
				if (supportsTrailingWildcard) {
					const targetPrefix = target.slice(0, -1);
					return resolve(tsconfigDir, tsconfigBaseUrl, targetPrefix);
				}
				return resolve(tsconfigDir, tsconfigBaseUrl, target);
			});

			const selectedTarget = resolvedTargets.find((candidate) => existsSync(candidate)) ?? resolvedTargets[0]!;
			return [[aliasKey, selectedTarget]];
		}),
	);

	tsconfigAliasCache.set(baseDir, aliases);
	return aliases;
};

/**
 * Reads all snapshot files and returns the IDs of leaf nodes (nodes that are
 * not referenced as a parent by any other node). When generating a new migration,
 * these leaf IDs should be used as `prevIds` to merge all open branches.
 */
export const findLeafSnapshotIds = (snapshots: string[]): string[] => {
	if (snapshots.length === 0) return [];

	const allIds = new Set<string>();
	const referencedAsParent = new Set<string>();

	for (const file of snapshots) {
		const raw = JSON.parse(readFileSync(file, 'utf8')) as {
			id: string;
			prevIds: string[];
		};
		allIds.add(raw.id);
		for (const pid of raw.prevIds) {
			referencedAsParent.add(pid);
		}
	}

	const leafIds = [...allIds].filter((id) => !referencedAsParent.has(id));
	return leafIds.length > 0 ? leafIds : [Array.from(allIds).pop()!];
};

type ValidationResult =
	| { status: 'valid' | 'unsupported' | 'nonLatest' }
	| { status: 'malformed'; errors: string[] };

const assertVersion = (
	obj: object,
	current: number,
): 'unsupported' | 'nonLatest' | null => {
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

const mysqlValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 6);
	if (versionError) return { status: versionError };

	const { success } = mysqlSnapshotValidator.parse(snapshot);
	if (!success) return { status: 'malformed', errors: [] };

	return { status: 'valid' };
};

const mssqlSnapshotValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 2);
	if (versionError) return { status: versionError };

	const res = mssqlValidatorSnapshot.parse(snapshot);
	if (!res.success) return { status: 'malformed', errors: res.errors ?? [] };

	return { status: 'valid' };
};

const sqliteValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 7);
	if (versionError) return { status: versionError };

	const { success } = sqliteStapshotValidator.parse(snapshot);
	if (!success) {
		return { status: 'malformed', errors: [] };
	}

	return { status: 'valid' };
};

const singlestoreValidator = (snapshot: object): ValidationResult => {
	const versionError = assertVersion(snapshot, 2);
	if (versionError) return { status: versionError };

	const { success } = singlestoreSnapshotValidator.parse(snapshot);
	if (!success) {
		return { status: 'malformed', errors: [] };
	}
	return { status: 'valid' };
};

export const validatorForDialect = (
	dialect: Dialect,
): (snapshot: object) => ValidationResult => {
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
				throw new UnsupportedSnapshotVersionCliError(it);
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

	if (
		type === 'better-sqlite'
		|| type === '@tursodatabase/database'
		|| type === 'bun'
	) {
		if (it.startsWith('file:')) {
			return it.substring(5);
		}

		return it;
	}

	assertUnreachable(type);
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

const isBun = typeof (globalThis as any).Bun !== 'undefined';
const isDeno = typeof (globalThis as any).Deno !== 'undefined';

export const loadModule = async <T = unknown>(
	modulePath: string,
): Promise<T> => {
	if (isBun || isDeno) {
		const fileUrl = pathToFileURL(modulePath).href;
		const mod = await import(fileUrl);
		return mod.default ?? mod;
	}

	const [major, minor] = process.versions.node.split('.').map(Number);
	const supportsModuleRegister = (major === 18 && minor >= 19)
		|| (major === 20 && minor >= 6)
		|| major >= 21;

	if (!supportsModuleRegister) {
		console.error(
			`Node.js ${process.version} does not support the required module.register() API.`,
		);
		console.error(`Please upgrade to Node.js v18.19+, v20.6+, or v21+.`);
		process.exit(1);
	}

	const path = require('path');
	const absoluteModulePath = path.isAbsolute(modulePath)
		? modulePath
		: path.resolve(modulePath);
	const ext = path.extname(modulePath);
	const isTS = ext === '.ts' || ext === '.mts' || ext === '.cts';

	if (isTS) {
		const baseDir = path.dirname(absoluteModulePath);
		const aliases = getAliasesForTsconfig(baseDir);
		// oxlint-disable-next-line consistent-type-imports
		const { createJiti } = require('jiti') as typeof import('jiti');
		const jiti = createJiti(baseDir, {
			interopDefault: true,
			alias: aliases,
			requireCache: false,
		});
		return jiti.import(absoluteModulePath);
	}

	const fileUrl = pathToFileURL(absoluteModulePath).href;
	const mod = await import(fileUrl);
	return mod.default ?? mod;
};
