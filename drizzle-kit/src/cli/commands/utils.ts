import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { render } from 'hanji';
import { join, resolve } from 'path';
import { assertUnreachable, type Journal } from '../../utils';
import type { Dialect } from '../../utils/schemaValidator';
import { prepareFilenames } from '../../utils/utils-node';
import { loadModule } from '../../utils/utils-node';
import type { CockroachCredentials } from '../validations/cockroach';
import { cockroachCredentials } from '../validations/cockroach';
import { printConfigConnectionIssues as printCockroachIssues } from '../validations/cockroach';
import type { Casing, Driver, EntitiesFilterConfig } from '../validations/common';
import {
	configCheck,
	configExport,
	configGenerate,
	configMigrate,
	configPull,
	configPush,
	configStudio,
	studioCliParams,
	wrapParam,
} from '../validations/common';
import { duckdbCredentials, printConfigConnectionIssues as printIssuesDuckDb } from '../validations/duckdb';
import type { LibSQLCredentials } from '../validations/libsql';
import { libSQLCredentials, printConfigConnectionIssues as printIssuesLibSQL } from '../validations/libsql';
import { printConfigConnectionIssues as printMssqlIssues } from '../validations/mssql';
import type { MssqlCredentials } from '../validations/mssql';
import { mssqlCredentials } from '../validations/mssql';
import type { MysqlCredentials } from '../validations/mysql';
import { mysqlCredentials, printConfigConnectionIssues as printIssuesMysql } from '../validations/mysql';
import { outputs } from '../validations/outputs';
import type { PostgresCredentials } from '../validations/postgres';
import { postgresCredentials, printConfigConnectionIssues as printIssuesPg } from '../validations/postgres';
import type { SingleStoreCredentials } from '../validations/singlestore';
import {
	printConfigConnectionIssues as printIssuesSingleStore,
	singlestoreCredentials,
} from '../validations/singlestore';
import type { SqliteCredentials } from '../validations/sqlite';
import { printConfigConnectionIssues as printIssuesSqlite, sqliteCredentials } from '../validations/sqlite';
import { error } from '../views';
import { prepareSnapshotFolderName } from './generate-common';

export const prepareCheckParams = async (
	options: {
		config?: string;
		dialect?: Dialect;
		out?: string;
	},
	from: 'cli' | 'config',
): Promise<{ out: string; dialect: Dialect }> => {
	const config = from === 'config'
		? await drizzleConfigFromFile(options.config as string | undefined)
		: options;

	if (!config.dialect) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', config.dialect);

		console.log(message);
		process.exit(1);
	}

	const parsed = configCheck.safeParse(config);

	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const data = parsed.data;

	return { out: data.out, dialect: data.dialect };
};

export type GenerateConfig = {
	dialect: Dialect;
	filenames: string[];
	out: string;
	breakpoints: boolean;
	name?: string;
	custom: boolean;
	bundle: boolean;
	driver?: Driver;
	ignoreConflicts?: boolean;
};

export type ExportConfig = {
	dialect: Dialect;
	sql: boolean;
	filenames: string[];
};

export type CheckConfig = { out: string; dialect: Dialect; ignoreConflicts: boolean | undefined };

export const prepareGenerateConfig = async (
	options: {
		config?: string;
		schema?: string;
		out?: string;
		breakpoints?: boolean;
		custom?: boolean;
		name?: string;
		dialect?: Dialect;
		driver?: Driver;
		ignoreConflicts?: boolean;
	},
	from: 'config' | 'cli',
): Promise<GenerateConfig> => {
	const config = from === 'config' ? await drizzleConfigFromFile(options.config) : options;

	if (!config.dialect || !config.schema) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', config.dialect);
		message += '\n' + wrapParam('schema', config.schema);

		console.log(message);
		process.exit(1);
	}

	const parsed = configGenerate.safeParse(config);
	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const { schema, out, breakpoints, dialect, driver } = parsed.data;

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}

	return {
		dialect: dialect,
		name: options.name,
		custom: options.custom || false,
		breakpoints: breakpoints,
		filenames: fileNames,
		out: out,
		bundle: driver === 'expo' || driver === 'durable-sqlite',
		driver,
		ignoreConflicts: options.ignoreConflicts !== undefined && options.ignoreConflicts,
	};
};

export const prepareExportConfig = async (
	options: {
		config?: string;
		schema?: string;
		dialect?: Dialect;
		sql: boolean;
	},
	from: 'config' | 'cli',
): Promise<ExportConfig> => {
	const config = from === 'config'
		? await drizzleConfigFromFile(options.config, true)
		: options;

	if (!config.schema || !config.dialect) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', config.dialect);
		message += '\n' + wrapParam('schema', config.schema);

		console.log(message);
		process.exit(1);
	}
	const parsed = configExport.safeParse(config);
	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const { schema, dialect } = parsed.data;

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}

	return {
		dialect: dialect,
		sql: !!options.sql,
		filenames: fileNames,
	};
};

export const flattenDatabaseCredentials = (config: any) => {
	if ('dbCredentials' in config) {
		const { dbCredentials, ...rest } = config;
		return {
			...rest,
			...dbCredentials,
		};
	}
	return config;
};

const flattenPull = (config: any) => {
	if ('dbCredentials' in config) {
		const { dbCredentials, introspect, ...rest } = config;
		return {
			...rest,
			...dbCredentials,
			casing: introspect?.casing,
		};
	}
	return config;
};

export const preparePushConfig = async (
	options: Record<string, unknown>,
	from: 'cli' | 'config',
): Promise<
	(
		| {
			dialect: 'mysql';
			credentials: MysqlCredentials;
		}
		| {
			dialect: 'postgresql';
			credentials: PostgresCredentials;
		}
		| {
			dialect: 'sqlite';
			credentials: SqliteCredentials;
		}
		| {
			dialect: 'turso';
			credentials: LibSQLCredentials;
		}
		| {
			dialect: 'singlestore';
			credentials: SingleStoreCredentials;
		}
		| {
			dialect: 'mssql';
			credentials: MssqlCredentials;
		}
		| {
			dialect: 'cockroach';
			credentials: CockroachCredentials;
		}
	) & {
		verbose: boolean;
		force: boolean;
		explain: boolean;
		filters: EntitiesFilterConfig;
		migrations: {
			table: string;
			schema: string;
		};
		filenames: string[];
	}
> => {
	const raw = flattenDatabaseCredentials(
		from === 'config'
			? await drizzleConfigFromFile(options.config as string | undefined)
			: options,
	);

	raw.verbose ||= options.verbose; // if provided in cli to debug

	if (!raw.dialect || !raw.schema) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', raw.dialect);
		message += '\n' + wrapParam('schema', raw.schema);

		console.log(message);
		process.exit(1);
	}

	const parsed = configPush.safeParse(raw);

	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const config = parsed.data;

	const schemaFiles = prepareFilenames(config.schema);
	console.log(chalk.gray(`Reading schema files:\n${schemaFiles.join('\n')}\n`));
	if (schemaFiles.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${config.schema} was found`);
		process.exit(0);
	}

	const filters = {
		tables: config.tablesFilter,
		schemas: config.schemaFilter,
		entities: config.entities,
		extensions: config.extensionsFilters,
	} as const;

	if (config.dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesPg(config);
			process.exit(1);
		}

		return {
			dialect: 'postgresql',
			explain: (options.explain as boolean) ?? false,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesMysql(config);
			process.exit(1);
		}
		return {
			dialect: 'mysql',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesSingleStore(config);
			process.exit(1);
		}

		return {
			dialect: 'singlestore',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesSqlite(config, 'push');
			process.exit(1);
		}
		return {
			dialect: 'sqlite',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesSqlite(config, 'push');
			process.exit(1);
		}
		return {
			dialect: 'turso',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(raw);
		if (!parsed.success) {
			printMssqlIssues(config);
			process.exit(1);
		}
		return {
			dialect: 'mssql',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(raw);
		if (!parsed.success) {
			printCockroachIssues(config);
			process.exit(1);
		}

		return {
			dialect: 'cockroach',
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: (options.explain as boolean) ?? false,
			migrations: config.migrations,
			filenames: schemaFiles,
		};
	}

	if (config.dialect === 'duckdb') {
		console.log(error(`You can't use 'push' command with DuckDb dialect`));
		process.exit(1);
	}

	assertUnreachable(config.dialect);
};

export const preparePullConfig = async (
	options: Record<string, unknown>,
	from: 'cli' | 'config',
): Promise<
	(
		| {
			dialect: 'mysql';
			credentials: MysqlCredentials;
		}
		| {
			dialect: 'postgresql';
			credentials: PostgresCredentials;
		}
		| {
			dialect: 'sqlite';
			credentials: SqliteCredentials;
		}
		| {
			dialect: 'turso';
			credentials: LibSQLCredentials;
		}
		| {
			dialect: 'singlestore';
			credentials: SingleStoreCredentials;
		}
		| {
			dialect: 'mssql';
			credentials: MssqlCredentials;
		}
		| {
			dialect: 'cockroach';
			credentials: CockroachCredentials;
		}
	) & {
		out: string;
		breakpoints: boolean;
		casing: Casing;
		filters: EntitiesFilterConfig;
		init: boolean;
		migrations: {
			table: string;
			schema: string;
		};
	}
> => {
	const raw = flattenPull(
		from === 'config'
			? await drizzleConfigFromFile(options.config as string | undefined)
			: options,
	);

	if (!raw.dialect) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', raw.dialect);

		console.log(message);
		process.exit(1);
	}

	const parsed = configPull.safeParse(raw);
	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const config = parsed.data;
	const dialect = config.dialect;

	const migrations = config.migrations;

	const filters = {
		tables: config.tablesFilter,
		schemas: config.schemaFilter,
		entities: config.entities,
		extensions: config.extensionsFilters,
	} as const;

	if (dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesPg(config);
			process.exit(1);
		}

		return {
			dialect: 'postgresql',
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesMysql(config);
			process.exit(1);
		}
		return {
			dialect: 'mysql',
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesSingleStore(config);
			process.exit(1);
		}

		return {
			dialect: 'singlestore',
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesSqlite(config, 'pull');
			process.exit(1);
		}
		return {
			dialect: 'sqlite',
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(raw);
		if (!parsed.success) {
			printIssuesLibSQL(config);
			process.exit(1);
		}
		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(raw);
		if (!parsed.success) {
			printMssqlIssues(config);
			process.exit(1);
		}

		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(raw);
		if (!parsed.success) {
			printCockroachIssues(config);
			process.exit(1);
		}

		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			filters,
			init: !!options.init,
			migrations,
		};
	}

	if (dialect === 'duckdb') {
		console.log(error(`You can't use 'pull' command with DuckDb dialect`));
		process.exit(1);
	}

	assertUnreachable(dialect);
};

export const prepareStudioConfig = async (options: Record<string, unknown>) => {
	const params = studioCliParams.parse(options);
	const config = await drizzleConfigFromFile(params.config);
	const result = configStudio.safeParse(config);

	if (!result.success) {
		if (!('dialect' in config)) {
			console.log(outputs.studio.noDialect());
		}
		process.exit(1);
	}

	if (!('dbCredentials' in config)) {
		console.log(outputs.studio.noCredentials());
		process.exit(1);
	}

	const { host, port } = params;
	const { dialect, schema } = result.data;
	const flattened = flattenDatabaseCredentials(config);

	if (dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesPg(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesMysql(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesSingleStore(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesSqlite(flattened as Record<string, unknown>, 'studio');
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesLibSQL(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(flattened);
		if (!parsed.success) {
			printCockroachIssues(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	if (dialect === 'mssql') {
		throw new Error(`You can't use 'studio' command with MsSql dialect yet`);
	}

	if (dialect === 'duckdb') {
		const parsed = duckdbCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesDuckDb(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
		};
	}

	assertUnreachable(dialect);
};

export const prepareMigrateConfig = async (configPath: string | undefined) => {
	const config = await drizzleConfigFromFile(configPath);

	if (!config.dialect) {
		let message = error('Please provide required params:');
		message += '\n' + wrapParam('dialect', config.dialect);

		console.log(message);
		process.exit(1);
	}

	const parsed = configMigrate.safeParse(config);
	if (!parsed.success) {
		console.error(parsed.error);
		process.exit(1);
	}

	const { dialect, out } = parsed.data;
	const { schema, table } = parsed.data.migrations;
	const flattened = flattenDatabaseCredentials(config);

	if (dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesPg(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesMysql(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesSingleStore(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesSqlite(flattened as Record<string, unknown>, 'migrate');
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}
	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesLibSQL(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(flattened);
		if (!parsed.success) {
			printMssqlIssues(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(flattened);
		if (!parsed.success) {
			printCockroachIssues(flattened as Record<string, unknown>);
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			out,
			credentials,
			schema,
			table,
		};
	}

	if (dialect === 'duckdb') {
		console.log(error(`You can't use 'migrate' command with DuckDb dialect`));
		process.exit(1);
	}

	assertUnreachable(dialect);
};

export const drizzleConfigFromFile = async (
	configPath?: string,
	isExport?: boolean,
) => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const defaultTsConfigExists = existsSync(
		resolve(join(prefix, 'drizzle.config.ts')),
	);
	const defaultJsConfigExists = existsSync(
		resolve(join(prefix, 'drizzle.config.js')),
	);
	// const defaultJsonConfigExists = existsSync(
	// 	join(resolve('drizzle.config.json')),
	// );

	const defaultConfigPath = defaultTsConfigExists
		? 'drizzle.config.ts'
		: defaultJsConfigExists
		? 'drizzle.config.js'
		: 'drizzle.config.json';

	if (!configPath && !isExport) {
		console.log(
			chalk.gray(
				`No config path provided, using default '${defaultConfigPath}'`,
			),
		);
	}

	const path: string = resolve(join(prefix, configPath ?? defaultConfigPath));

	if (!existsSync(path)) {
		console.log(`${path} file does not exist`);
		process.exit(1);
	}

	if (!isExport) console.log(chalk.grey(`Reading config file '${path}'`));

	// we always expect config is defined with "export default defineConfig({})"
	const content = await loadModule<any>(path);

	// Bun, Deno, and .js files return { ... } from content
	// (
	//   const mod = await import(fileUrl);
	//   return mod.default ?? mod;
	// )
	// But .ts returns { default: ... } or { ... }
	// So we need to check content.default first and than return content if not found
	return content.default ?? content;
};

export const migrateToFoldersV3 = (out: string) => {
	// if there is meta folder - and there is a journal - it's version 8
	const metaPath = join(out, 'meta');
	const journalPath = join(metaPath, '_journal.json');
	if (existsSync(metaPath) && existsSync(journalPath)) {
		const journal: Journal = JSON.parse(readFileSync(journalPath).toString());
		const sqlFiles = readdirSync(out);
		for (const entry of journal.entries) {
			const folderName = prepareSnapshotFolderName(entry.when);
			// Reading Snapshots files
			const [snapshotPrefix, ...rest] = entry.tag.split('_');
			const migrationName = rest.join('_');
			const oldSnapshotPath = join(metaPath, `${snapshotPrefix}_snapshot.json`);

			if (!existsSync(oldSnapshotPath)) {
				// If for some reason this happens we need to throw an error
				// This can't happen unless there were wrong drizzle-kit migrations usage
				console.error('No snapshot was found');
				process.exit(1);
			}

			const oldSnapshot = readFileSync(oldSnapshotPath);

			// Reading SQL files
			let oldSqlPath = join(out, `${entry.tag}.sql`);
			const sqlFileFromJournal = join(out, `${entry.tag}.sql`);
			if (!existsSync(sqlFileFromJournal)) {
				// We will try to find it by prefix, but this is a sign that something went wrong
				// with properly using drizzle-kit migrations
				const sqlFileName = sqlFiles.find((file) => file.startsWith(snapshotPrefix));
				if (!sqlFileName) continue;
				if (sqlFileName?.length > 1) {
					console.error('Several sql files were found');
					process.exit(1);
				}
			}
			const oldSql = readFileSync(oldSqlPath);

			mkdirSync(join(out, `${folderName}_${migrationName}`));
			writeFileSync(
				join(out, `${folderName}_${migrationName}/snapshot.json`),
				oldSnapshot,
			);
			writeFileSync(
				join(out, `${folderName}_${migrationName}/migration.sql`),
				oldSql,
			);

			unlinkSync(oldSqlPath);
		}

		rmSync(metaPath, { recursive: true, force: true });
		return true;
	}
	return false;
};
