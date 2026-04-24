import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'fs';
import { render } from 'hanji';
import { join, resolve } from 'path';
import { inspect } from 'util';
import { object, string } from 'zod';
import { assertUnreachable, type Journal } from '../../utils';
import { type Dialect, dialect } from '../../utils/schemaValidator';
import { prepareFilenames } from '../../utils/utils-node';
import { loadModule } from '../../utils/utils-node';
import {
	ConfigFileNotFoundCliError,
	ConfigValidationCliError,
	MigrationSnapshotNotFoundCliError,
	MigrationSqlFilesConflictCliError,
	MissingConfigDialectCliError,
	MissingDialectCliError,
	RequiredParamsCliError,
	UnsupportedCommandCliError,
} from '../errors';
import { HintsHandler } from '../hints';
import type { EntitiesFilterConfig } from '../validations/cli';
import { pullParams, pushParams } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import { cockroachCredentials } from '../validations/cockroach';
import { printConfigConnectionIssues as printCockroachIssues } from '../validations/cockroach';
import type { Casing, CasingType, CliConfig, Driver } from '../validations/common';
import { configCommonSchema, configMigrations, wrapParam } from '../validations/common';
import { duckdbCredentials, printConfigConnectionIssues as printIssuesDuckDb } from '../validations/duckdb';
import type { GelCredentials } from '../validations/gel';
import { gelCredentials, printConfigConnectionIssues as printIssuesGel } from '../validations/gel';
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
import { studioCliParams, studioConfig } from '../validations/studio';
import { error, humanLog } from '../views';
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
		throw new MissingDialectCliError(`${error('Please provide required params:')}\n${wrapParam('dialect', dialect)}`);
	}
	return { out: config.out || 'drizzle', dialect: config.dialect };
};

export const prepareDropParams = async (
	options: {
		config?: string;
		out?: string;
		driver?: Driver;
		dialect?: Dialect;
	},
	from: 'cli' | 'config',
): Promise<{ out: string; bundle: boolean }> => {
	const config = from === 'config'
		? await drizzleConfigFromFile(options.config as string | undefined)
		: options;

	if (config.dialect === 'gel') {
		throw new UnsupportedCommandCliError('drop', error(`You can't use 'drop' command with Gel dialect`), {
			dialect: 'Gel',
		});
	}

	return { out: config.out || 'drizzle', bundle: config.driver === 'expo' };
};

export type GenerateConfig = {
	dialect: Dialect;
	filenames: string[];
	out: string;
	json: boolean;
	breakpoints: boolean;
	name?: string;
	custom: boolean;
	bundle: boolean;
	casing?: CasingType;
	driver?: Driver;
	ignoreConflicts?: boolean;
	explain: boolean;
	hints: HintsHandler;
};

export type ExportConfig = {
	dialect: Dialect;
	sql: boolean;
	json: boolean;
	casing?: CasingType;
	filenames: string[];
};

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
		casing?: CasingType;
		ignoreConflicts?: boolean;
		explain?: boolean;
		json?: boolean;
		hints?: string;
		hintsFile?: string;
	},
	from: 'config' | 'cli',
): Promise<GenerateConfig> => {
	const config = from === 'config' ? await drizzleConfigFromFile(options.config) : options;
	const hints = await HintsHandler.fromCli(options);

	const { schema, out, breakpoints, dialect, driver, casing } = config;

	if (!schema || !dialect) {
		throw new RequiredParamsCliError(
			['schema', 'dialect'],
			[
				error('Please provide required params:'),
				wrapParam('schema', schema),
				wrapParam('dialect', dialect),
				wrapParam('out', out, true),
			].join('\n'),
		);
	}

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}

	return {
		dialect: dialect,
		name: options.name,
		json: options.json ?? false,
		custom: options.custom || false,
		breakpoints: breakpoints ?? true,
		filenames: fileNames,
		out: out || 'drizzle',
		bundle: driver === 'expo' || driver === 'durable-sqlite',
		casing,
		driver,
		ignoreConflicts: options.ignoreConflicts !== undefined && options.ignoreConflicts,
		explain: options.explain ?? false,
		hints,
	};
};

export const prepareExportConfig = async (
	options: {
		config?: string;
		schema?: string;
		dialect?: Dialect;
		json?: boolean;
		sql: boolean;
		casing?: CasingType;
	},
	from: 'config' | 'cli',
): Promise<ExportConfig> => {
	const config = from === 'config'
		? await drizzleConfigFromFile(options.config, true)
		: options;

	const { schema, dialect, sql } = config;

	if (!schema || !dialect) {
		throw new RequiredParamsCliError(
			['schema', 'dialect'],
			[
				error('Please provide required params:'),
				wrapParam('schema', schema),
				wrapParam('dialect', dialect),
			].join('\n'),
		);
	}

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}
	return {
		casing: config.casing,
		dialect: dialect,
		json: options.json ?? false,
		sql: sql,
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
		json: boolean;
		verbose: boolean;
		force: boolean;
		explain: boolean;
		hints: HintsHandler;
		casing?: CasingType;
		filters: EntitiesFilterConfig;
		migrations: {
			table: string;
			schema: string;
		};
		filenames: string[];
	}
> => {
	const hints = await HintsHandler.fromCli({
		hints: options.hints as string | undefined,
		hintsFile: options.hintsFile as string | undefined,
	});
	const raw = flattenDatabaseCredentials(
		from === 'config'
			? await drizzleConfigFromFile(options.config as string | undefined)
			: options,
	);

	raw.verbose ||= options.verbose; // if provided in cli to debug
	raw.strict ||= options.strict; // if provided in cli only

	const parsed = pushParams.safeParse(raw);

	if (parsed.error) {
		throw new RequiredParamsCliError(
			['dialect', 'schema'],
			[
				error('Please provide required params:'),
				wrapParam('dialect', raw.dialect),
				wrapParam('schema', raw.schema),
			].join('\n'),
		);
	}

	const config = parsed.data;

	const schemaFiles = prepareFilenames(config.schema);
	humanLog(chalk.gray(`Reading schema files:\n${schemaFiles.join('\n')}\n`));
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
		const parsed = postgresCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'postgresql',
				json: (options.json as boolean) ?? false,
				explain: (options.explain as boolean) ?? false,
				hints,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printIssuesPg(config);
	}

	if (config.dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'mysql',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printIssuesMysql(config);
	}

	if (config.dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'singlestore',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printIssuesSingleStore(config);
	}

	if (config.dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'sqlite',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printIssuesSqlite(config, 'push');
	}

	if (config.dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'turso',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printIssuesLibSQL(config, 'push');
	}

	if (config.dialect === 'gel') {
		throw new UnsupportedCommandCliError('push', error(`You can't use 'push' command with Gel dialect`), {
			dialect: 'Gel',
		});
	}

	if (config.dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'mssql',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printMssqlIssues(config);
	}

	if (config.dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect: 'cockroach',
				json: (options.json as boolean) ?? false,
				verbose: config.verbose ?? false,
				force: (options.force as boolean) ?? false,
				credentials: parsed.data,
				casing: config.casing,
				filters,
				explain: (options.explain as boolean) ?? false,
				hints,
				migrations: config.migrations,
				filenames: schemaFiles,
			};
		}
		printCockroachIssues(config);
	}

	if (config.dialect === 'duckdb') {
		throw new UnsupportedCommandCliError('push', error(`You can't use 'push' command with DuckDb dialect`), {
			dialect: 'DuckDb',
		});
	}

	throw new Error(`Unexpected dialect: ${config.dialect}`);
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
			dialect: 'gel';
			credentials?: GelCredentials;
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
	const parsed = pullParams.safeParse(raw);

	if (parsed.error) {
		throw new RequiredParamsCliError(
			['dialect'],
			[
				error('Please provide required params:'),
				wrapParam('dialect', raw.dialect),
			].join('\n'),
		);
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
		const parsed = postgresCredentials.safeParse(config);
		if (parsed.success) {
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
		printIssuesPg(config);
	}

	if (dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(config);
		if (parsed.success) {
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
		printIssuesMysql(config);
	}

	if (dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(config);
		if (parsed.success) {
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
		printIssuesSingleStore(config);
	}

	if (dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(config);
		if (parsed.success) {
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
		printIssuesSqlite(config, 'pull');
	}

	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(config);
		if (parsed.success) {
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
		printIssuesLibSQL(config, 'pull');
	}

	if (dialect === 'gel') {
		const parsed = gelCredentials.safeParse(config);
		if (parsed.success) {
			return {
				dialect,
				out: config.out,
				breakpoints: config.breakpoints,
				casing: config.casing,
				credentials: parsed.data,
				init: !!options.init,
				migrations,
				filters,
			};
		}
		printIssuesGel(config);
	}

	if (dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(config);
		if (parsed.success) {
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
		printMssqlIssues(config);
	}

	if (dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(config);
		if (parsed.success) {
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
		printCockroachIssues(config);
	}

	if (dialect === 'duckdb') {
		throw new UnsupportedCommandCliError('pull', error(`You can't use 'pull' command with DuckDb dialect`), {
			dialect: 'DuckDb',
		});
	}

	throw new Error(`Unexpected dialect: ${dialect}`);
};

export const prepareStudioConfig = async (options: Record<string, unknown>) => {
	const params = studioCliParams.parse(options);
	const config = await drizzleConfigFromFile(params.config);
	const result = studioConfig.safeParse(config);
	if (!result.success) {
		if (!('dialect' in config)) {
			humanLog(outputs.studio.noDialect());
		}
		process.exit(1);
	}

	if (!('dbCredentials' in config)) {
		humanLog(outputs.studio.noCredentials());
		process.exit(1);
	}
	const { host, port } = params;
	const { dialect, schema, casing } = result.data;
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
			casing,
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
			casing,
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
			casing,
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
			casing,
		};
	}

	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(flattened);
		if (!parsed.success) {
			printIssuesLibSQL(flattened as Record<string, unknown>, 'studio');
			process.exit(1);
		}
		const credentials = parsed.data;
		return {
			dialect,
			schema,
			host,
			port,
			credentials,
			casing,
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

	if (dialect === 'gel') {
		throw new Error(`You can't use 'studio' command with Gel dialect`);
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

export const migrateConfig = object({
	dialect,
	out: string().optional().default('drizzle'),
	migrations: configMigrations,
});

export const prepareMigrateConfig = async (configPath: string | undefined) => {
	const config = await drizzleConfigFromFile(configPath);
	const parsed = migrateConfig.safeParse(config);
	if (parsed.error) {
		throw new RequiredParamsCliError(
			['dialect'],
			[
				error('Please provide required params:'),
				wrapParam('dialect', config.dialect),
			].join('\n'),
		);
	}

	const { dialect, out } = parsed.data;
	const { schema, table } = parsed.data.migrations || {};
	const flattened = flattenDatabaseCredentials(config);

	if (dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(flattened);
		if (!parsed.success) {
			return printIssuesPg(flattened as Record<string, unknown>);
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
			return printIssuesMysql(flattened as Record<string, unknown>);
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
			return printIssuesSingleStore(flattened as Record<string, unknown>);
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
			return printIssuesSqlite(flattened as Record<string, unknown>, 'migrate');
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
			return printIssuesLibSQL(flattened as Record<string, unknown>, 'migrate');
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

	if (dialect === 'gel') {
		throw new UnsupportedCommandCliError('migrate', error(`You can't use 'migrate' command with Gel dialect`), {
			dialect: 'Gel',
		});
	}

	if (dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(flattened);
		if (!parsed.success) {
			return printMssqlIssues(flattened as Record<string, unknown>);
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
			return printCockroachIssues(flattened as Record<string, unknown>);
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
		throw new UnsupportedCommandCliError('migrate', error(`You can't use 'migrate' command with DuckDb dialect`), {
			dialect: 'DuckDb',
		});
	}

	assertUnreachable(dialect);
};

export const drizzleConfigFromFile = async (
	configPath?: string,
	isExport?: boolean,
): Promise<CliConfig> => {
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
		humanLog(
			chalk.gray(
				`No config path provided, using default '${defaultConfigPath}'`,
			),
		);
	}

	const path: string = resolve(join(prefix, configPath ?? defaultConfigPath));

	if (!existsSync(path)) {
		throw new ConfigFileNotFoundCliError(path);
	}

	if (!isExport) humanLog(chalk.grey(`Reading config file '${path}'`));

	const content = await loadModule<any>(path);

	// --- get response and then check by each dialect independently
	const res = configCommonSchema.safeParse(content);
	if (!res.success) {
		if (!('dialect' in content)) {
			throw new MissingConfigDialectCliError();
		}
		throw new ConfigValidationCliError(inspect(res.error), res.error.issues as never, { cause: res.error });
	}

	return res.data;
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
				throw new MigrationSnapshotNotFoundCliError(oldSnapshotPath);
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
					throw new MigrationSqlFilesConflictCliError(snapshotPrefix);
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
