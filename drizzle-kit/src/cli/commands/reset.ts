import chalk from 'chalk';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { render } from 'hanji';
import { tmpdir } from 'os';
import { join } from 'path';
import { Entities } from '../validations/cli';
import { CasingType } from '../validations/common';
import { LibSQLCredentials } from '../validations/libsql';
import type { MysqlCredentials } from '../validations/mysql';
import type { PostgresCredentials } from '../validations/postgres';
import { SingleStoreCredentials } from '../validations/singlestore';
import type { SqliteCredentials } from '../validations/sqlite';

const withEmptySchemaFile = async <T>(fn: (emptySchemaPath: string) => Promise<T>): Promise<T> => {
	const dir = mkdtempSync(join(tmpdir(), 'drizzle-kit-reset-'));
	const file = join(dir, 'empty-schema.ts');
	writeFileSync(file, 'export {};\n');
	try {
		return await fn(file);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
};

const softResetNotice = () => {
	render(
		`[${
			chalk.yellow('i')
		}] Couldn't drop & recreate directly (insufficient privileges or unsupported driver), dropping all objects instead`,
	);
};

const resetDialect = async (params: {
	schemaPath: string | string[];
	verbose: boolean;
	push: (schemaPath: string | string[]) => Promise<void>;
	hardReset?: () => Promise<void>;
}) => {
	let hardResetOk = false;
	if (params.hardReset) {
		try {
			await params.hardReset();
			hardResetOk = true;
		} catch (e) {
			if (params.verbose) console.error(e);
		}
	}

	if (!hardResetOk) {
		softResetNotice();
		await withEmptySchemaFile((emptySchemaPath) => params.push(emptySchemaPath));
	}

	await params.push(params.schemaPath);
};

export const pgReset = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: PostgresCredentials,
	tablesFilter: string[],
	schemasFilter: string[],
	entities: Entities,
	casing: CasingType | undefined,
) => {
	const { pgPush } = await import('./push');
	const schemas = schemasFilter.length ? schemasFilter : ['public'];

	await resetDialect({
		schemaPath,
		verbose,
		push: (path) => pgPush(path, verbose, false, credentials, tablesFilter, schemasFilter, entities, true, casing),
		hardReset: async () => {
			const { preparePostgresDB } = await import('../connections');
			const db = await preparePostgresDB(credentials);
			for (const schemaName of schemas) {
				await db.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE;`, []);
				await db.query(`CREATE SCHEMA IF NOT EXISTS "${schemaName}";`, []);
			}
		},
	});
};

export const mysqlReset = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: MysqlCredentials,
	tablesFilter: string[],
	casing: CasingType | undefined,
) => {
	const { mysqlPush } = await import('./push');

	await resetDialect({
		schemaPath,
		verbose,
		push: (path) => mysqlPush(path, credentials, tablesFilter, false, verbose, true, casing),
		hardReset: async () => {
			const { connectToMySQL } = await import('../connections');
			const { db, database } = await connectToMySQL(credentials);
			await db.query(`DROP DATABASE IF EXISTS \`${database}\`;`, []);
			await db.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`, []);
		},
	});
};

export const singlestoreReset = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: SingleStoreCredentials,
	tablesFilter: string[],
	casing: CasingType | undefined,
) => {
	const { singlestorePush } = await import('./push');

	await resetDialect({
		schemaPath,
		verbose,
		push: (path) => singlestorePush(path, credentials, tablesFilter, false, verbose, true, casing),
		hardReset: async () => {
			const { connectToSingleStore } = await import('../connections');
			const { db, database } = await connectToSingleStore(credentials);
			await db.query(`DROP DATABASE IF EXISTS \`${database}\`;`, []);
			await db.query(`CREATE DATABASE IF NOT EXISTS \`${database}\`;`, []);
		},
	});
};

export const sqliteReset = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: SqliteCredentials,
	tablesFilter: string[],
	casing: CasingType | undefined,
) => {
	const { sqlitePush } = await import('./push');
	const push = (path: string | string[]) => sqlitePush(path, verbose, false, credentials, tablesFilter, true, casing);

	if (
		!('driver' in credentials) && credentials.url !== ':memory:' && !/^(https?|libsql|wss?):\/\//.test(credentials.url)
	) {
		const { url } = credentials;
		await resetDialect({
			schemaPath,
			verbose,
			push,
			hardReset: async () => {
				for (const suffix of ['', '-journal', '-wal', '-shm']) {
					const file = `${url}${suffix}`;
					if (existsSync(file)) rmSync(file, { force: true });
				}
			},
		});
		return;
	}

	await resetDialect({ schemaPath, verbose, push });
};

export const libSQLReset = async (
	schemaPath: string | string[],
	verbose: boolean,
	credentials: LibSQLCredentials,
	tablesFilter: string[],
	casing: CasingType | undefined,
) => {
	const { libSQLPush } = await import('./push');

	await resetDialect({
		schemaPath,
		verbose,
		push: (path) => libSQLPush(path, verbose, false, credentials, tablesFilter, true, casing),
	});
};
