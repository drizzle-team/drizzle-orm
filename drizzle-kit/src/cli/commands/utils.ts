import chalk from 'chalk';
import { existsSync, mkdirSync, readdirSync, readFileSync, rm, unlinkSync, writeFileSync } from 'fs';
import { render } from 'hanji';
import { join, resolve } from 'path';
import { object, string } from 'zod';
import { assertUnreachable, type Journal } from '../../utils';
import { type Dialect, dialect } from '../../utils/schemaValidator';
import { prepareFilenames } from '../../utils/utils-node';
import { safeRegister } from '../../utils/utils-node';
import type { EntitiesFilterConfig } from '../validations/cli';
import { pullParams, pushParams } from '../validations/cli';
import type { CockroachCredentials } from '../validations/cockroach';
import { cockroachCredentials } from '../validations/cockroach';
import { printConfigConnectionIssues as printCockroachIssues } from '../validations/cockroach';
import type { Casing, CasingType, CliConfig, Driver, Prefix } from '../validations/common';
import { configCommonSchema, configMigrations, wrapParam } from '../validations/common';
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

	if (!config.out || !config.dialect) {
		let text = `Please provide required params for AWS Data API driver:\n`;
		console.log(error(text));
		console.log(wrapParam('database', config.out));
		console.log(wrapParam('secretArn', config.dialect));
		process.exit(1);
	}
	return { out: config.out, dialect: config.dialect };
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
		console.log(
			error(
				`You can't use 'drop' command with Gel dialect`,
			),
		);
		process.exit(1);
	}

	return { out: config.out || 'drizzle', bundle: config.driver === 'expo' };
};

export type GenerateConfig = {
	dialect: Dialect;
	schema: string | string[];
	out: string;
	breakpoints: boolean;
	name?: string;
	prefix: Prefix;
	custom: boolean;
	bundle: boolean;
	casing?: CasingType;
	driver?: Driver;
};

export type ExportConfig = {
	dialect: Dialect;
	schema: string | string[];
	sql: boolean;
	casing?: CasingType;
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
		prefix?: Prefix;
		casing?: CasingType;
	},
	from: 'config' | 'cli',
): Promise<GenerateConfig> => {
	const config = from === 'config' ? await drizzleConfigFromFile(options.config) : options;

	const { schema, out, breakpoints, dialect, driver, casing } = config;

	if (!schema || !dialect) {
		console.log(error('Please provide required params:'));
		console.log(wrapParam('schema', schema));
		console.log(wrapParam('dialect', dialect));
		console.log(wrapParam('out', out, true));
		process.exit(1);
	}

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}

	const prefix = ('migrations' in config ? config.migrations?.prefix : options.prefix)
		|| 'index';

	return {
		dialect: dialect,
		name: options.name,
		custom: options.custom || false,
		prefix,
		breakpoints: breakpoints ?? true,
		schema: schema,
		out: out || 'drizzle',
		bundle: driver === 'expo' || driver === 'durable-sqlite',
		casing,
		driver,
	};
};

export const prepareExportConfig = async (
	options: {
		config?: string;
		schema?: string;
		dialect?: Dialect;
		sql: boolean;
		casing?: CasingType;
	},
	from: 'config' | 'cli',
): Promise<ExportConfig> => {
	const config = from === 'config' ? await drizzleConfigFromFile(options.config, true) : options;

	const { schema, dialect, sql } = config;

	if (!schema || !dialect) {
		console.log(error('Please provide required params:'));
		console.log(wrapParam('schema', schema));
		console.log(wrapParam('dialect', dialect));
		process.exit(1);
	}

	const fileNames = prepareFilenames(schema);
	if (fileNames.length === 0) {
		render(`[${chalk.blue('i')}] No schema file in ${schema} was found`);
		process.exit(0);
	}
	return {
		casing: config.casing,
		dialect: dialect,
		schema: schema,
		sql: sql,
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
	& (
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
	)
	& {
		schemaPath: string | string[];
		verbose: boolean;
		force: boolean;
		explain: boolean;
		casing?: CasingType;
		filters: EntitiesFilterConfig;
	}
> => {
	const raw = flattenDatabaseCredentials(
		from === 'config'
			? await drizzleConfigFromFile(options.config as string | undefined)
			: options,
	);

	raw.verbose ||= options.verbose; // if provided in cli to debug
	raw.strict ||= options.strict; // if provided in cli only

	const parsed = pushParams.safeParse(raw);

	if (parsed.error) {
		console.log(error('Please provide required params:'));
		console.log(wrapParam('dialect', raw.dialect));
		console.log(wrapParam('schema', raw.schema));
		process.exit(1);
	}

	const config = parsed.data;

	const schemaFiles = prepareFilenames(config.schema);
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
		if (!parsed.success) {
			printIssuesPg(config);
			process.exit(1);
		}

		return {
			dialect: 'postgresql',
			schemaPath: config.schema,
			explain: (options.explain as boolean) ?? false,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
		};
	}

	if (config.dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesMysql(config);
			process.exit(1);
		}
		return {
			dialect: 'mysql',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
			explain: false,
		};
	}

	if (config.dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesSingleStore(config);
			process.exit(1);
		}

		return {
			dialect: 'singlestore',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			filters,
			explain: false,
		};
	}

	if (config.dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesSqlite(config, 'push');
			process.exit(1);
		}
		return {
			dialect: 'sqlite',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
			explain: false,
		};
	}

	if (config.dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesSqlite(config, 'push');
			process.exit(1);
		}
		return {
			dialect: 'turso',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
			explain: false,
		};
	}

	if (config.dialect === 'gel') {
		console.log(
			error(
				`You can't use 'push' command with Gel dialect`,
			),
		);
		process.exit(1);
	}

	if (config.dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(config);
		if (!parsed.success) {
			// printIssuesSqlite(config, 'push'); // TODO print issues
			process.exit(1);
		}
		return {
			dialect: 'mssql',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
			explain: false,
		};
	}

	if (config.dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(config);
		if (!parsed.success) {
			printCockroachIssues(config);
			process.exit(1);
		}

		return {
			dialect: 'cockroach',
			schemaPath: config.schema,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			casing: config.casing,
			filters,
			explain: false,
		};
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
		prefix: Prefix;
		filters: EntitiesFilterConfig;
	}
> => {
	const raw = flattenPull(
		from === 'config'
			? await drizzleConfigFromFile(options.config as string | undefined)
			: options,
	);
	const parsed = pullParams.safeParse(raw);

	if (parsed.error) {
		console.log(error('Please provide required params:'));
		console.log(wrapParam('dialect', raw.dialect));
		process.exit(1);
	}

	const config = parsed.data;
	const dialect = config.dialect;

	const filters = {
		tables: config.tablesFilter,
		schemas: config.schemaFilter,
		entities: config.entities,
		extensions: config.extensionsFilters,
	} as const;

	if (dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(config);
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
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'mysql') {
		const parsed = mysqlCredentials.safeParse(config);
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
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'singlestore') {
		const parsed = singlestoreCredentials.safeParse(config);
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
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(config);
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
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'turso') {
		const parsed = libSQLCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesLibSQL(config, 'pull');
			process.exit(1);
		}
		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'gel') {
		const parsed = gelCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesGel(config);
			process.exit(1);
		}
		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'mssql') {
		const parsed = mssqlCredentials.safeParse(config);
		if (!parsed.success) {
			// printIssuesPg(config); // TODO add issues printing
			process.exit(1);
		}

		return {
			dialect,
			out: config.out,
			breakpoints: config.breakpoints,
			casing: config.casing,
			credentials: parsed.data,
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	if (dialect === 'cockroach') {
		const parsed = cockroachCredentials.safeParse(config);
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
			prefix: config.migrations?.prefix || 'index',
			filters,
		};
	}

	assertUnreachable(dialect);
};

export const prepareStudioConfig = async (options: Record<string, unknown>) => {
	const params = studioCliParams.parse(options);
	const config = await drizzleConfigFromFile(params.config);
	const result = studioConfig.safeParse(config);
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

	if (dialect === 'gel') {
		console.log(
			error(
				`You can't use 'studio' command with Gel dialect`,
			),
		);
		process.exit(1);
	}

	if (dialect === 'mssql') {
		console.log(
			error(
				`You can't use 'studio' command with MsSql dialect yet`,
			),
		);
		process.exit(1);
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
		console.log(error('Please provide required params:'));
		console.log(wrapParam('dialect', config.dialect));
		process.exit(1);
	}

	const { dialect, out } = parsed.data;
	const { schema, table } = parsed.data.migrations || {};
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
			printIssuesLibSQL(flattened as Record<string, unknown>, 'migrate');
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

	if (dialect === 'gel') {
		console.log(
			error(
				`You can't use 'migrate' command with Gel dialect`,
			),
		);
		process.exit(1);
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

	assertUnreachable(dialect);
};

export const drizzleConfigFromFile = async (
	configPath?: string,
	isExport?: boolean,
): Promise<CliConfig> => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const defaultTsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.ts')));
	const defaultJsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.js')));
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

	const content = await safeRegister(async () => {
		const required = require(`${path}`);
		const content = required.default ?? required;
		return content;
	});

	// --- get response and then check by each dialect independently
	const res = configCommonSchema.safeParse(content);
	if (!res.success) {
		console.log(res.error);
		if (!('dialect' in content)) {
			console.log(error("Please specify 'dialect' param in config file"));
		}
		process.exit(1);
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
			writeFileSync(join(out, `${folderName}_${migrationName}/snapshot.json`), oldSnapshot);
			writeFileSync(join(out, `${folderName}_${migrationName}/migration.sql`), oldSql);

			unlinkSync(oldSqlPath);
		}

		rm(metaPath, { recursive: true, force: true }, () => {});
		return true;
	}
	return false;
};
