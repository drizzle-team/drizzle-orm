import chalk from 'chalk';
import { existsSync } from 'fs';
import { render } from 'hanji';
import { join, resolve } from 'path';
import { object, string } from 'zod';
import { assertUnreachable } from '../../global';
import { type Dialect, dialect } from '../../schemaValidator';
import { prepareFilenames } from '../../serializer';
import { pullParams, pushParams } from '../validations/cli';
import {
	Casing,
	CliConfig,
	configCommonSchema,
	configMigrations,
	Driver,
	Prefix,
	wrapParam,
} from '../validations/common';
import {
	MysqlCredentials,
	mysqlCredentials,
	printConfigConnectionIssues as printIssuesMysql,
} from '../validations/mysql';
import { outputs } from '../validations/outputs';
import {
	PostgresCredentials,
	postgresCredentials,
	printConfigConnectionIssues as printIssuesPg,
} from '../validations/postgres';
import {
	printConfigConnectionIssues as printIssuesSqlite,
	SqliteCredentials,
	sqliteCredentials,
} from '../validations/sqlite';
import { studioCliParams, studioConfig } from '../validations/studio';
import { error, grey } from '../views';

// NextJs default config is target: es5, which esbuild-register can't consume
const assertES5 = async (unregister: () => void) => {
	try {
		require('./_es5.ts');
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

export const safeRegister = async () => {
	const { register } = await import('esbuild-register/dist/node');
	let res: { unregister: () => void };
	try {
		res = register({
			format: 'cjs',
			loader: 'ts',
		});
	} catch {
		// tsx fallback
		res = {
			unregister: () => {},
		};
	}

	// has to be outside try catch to be able to run with tsx
	await assertES5(res.unregister);
	return res;
};

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
	},
	from: 'cli' | 'config',
): Promise<{ out: string; bundle: boolean }> => {
	const config = from === 'config'
		? await drizzleConfigFromFile(options.config as string | undefined)
		: options;

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
	},
	from: 'config' | 'cli',
): Promise<GenerateConfig> => {
	const config = from === 'config' ? await drizzleConfigFromFile(options.config) : options;

	const { schema, out, breakpoints, dialect, driver } = config;

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
		breakpoints: breakpoints || true,
		schema: schema,
		out: out || 'drizzle',
		bundle: driver === 'expo',
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
	) & {
		schemaPath: string | string[];
		verbose: boolean;
		strict: boolean;
		force: boolean;
		tablesFilter: string[];
		schemasFilter: string[];
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

	const tablesFilterConfig = config.tablesFilter;
	const tablesFilter = tablesFilterConfig
		? typeof tablesFilterConfig === 'string'
			? [tablesFilterConfig]
			: tablesFilterConfig
		: [];

	const schemasFilterConfig = config.schemaFilter;

	const schemasFilter = schemasFilterConfig
		? typeof schemasFilterConfig === 'string'
			? [schemasFilterConfig]
			: schemasFilterConfig
		: [];

	if (config.extensionsFilters) {
		if (
			config.extensionsFilters.includes('postgis')
			&& config.dialect === 'postgresql'
		) {
			tablesFilter.push(
				...['!geography_columns', '!geometry_columns', '!spatial_ref_sys'],
			);
		}
	}

	if (config.dialect === 'postgresql') {
		const parsed = postgresCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesPg(config);
			process.exit(1);
		}

		return {
			dialect: 'postgresql',
			schemaPath: config.schema,
			strict: config.strict ?? false,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			tablesFilter,
			schemasFilter,
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
			strict: config.strict ?? false,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			tablesFilter,
			schemasFilter,
		};
	}

	if (config.dialect === 'sqlite') {
		const parsed = sqliteCredentials.safeParse(config);
		if (!parsed.success) {
			printIssuesSqlite(config, 'pull');
			process.exit(1);
		}
		return {
			dialect: 'sqlite',
			schemaPath: config.schema,
			strict: config.strict ?? false,
			verbose: config.verbose ?? false,
			force: (options.force as boolean) ?? false,
			credentials: parsed.data,
			tablesFilter,
			schemasFilter,
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
	) & {
		out: string;
		breakpoints: boolean;
		casing: Casing;
		tablesFilter: string[];
		schemasFilter: string[];
		prefix: Prefix;
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

	const tablesFilterConfig = config.tablesFilter;
	const tablesFilter = tablesFilterConfig
		? typeof tablesFilterConfig === 'string'
			? [tablesFilterConfig]
			: tablesFilterConfig
		: [];

	if (config.extensionsFilters) {
		if (
			config.extensionsFilters.includes('postgis')
			&& dialect === 'postgresql'
		) {
			tablesFilter.push(
				...['!geography_columns', '!geometry_columns', '!spatial_ref_sys'],
			);
		}
	}

	const schemasFilterConfig = config.schemaFilter; // TODO: consistent naming
	const schemasFilter = schemasFilterConfig
		? typeof schemasFilterConfig === 'string'
			? [schemasFilterConfig]
			: schemasFilterConfig
		: [];

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
			tablesFilter,
			schemasFilter,
			prefix: config.migrations?.prefix || 'index',
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
			tablesFilter,
			schemasFilter,
			prefix: config.migrations?.prefix || 'index',
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
			tablesFilter,
			schemasFilter,
			prefix: config.migrations?.prefix || 'index',
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

	assertUnreachable(dialect);
};

export const drizzleConfigFromFile = async (
	configPath?: string,
): Promise<CliConfig> => {
	const prefix = process.env.TEST_CONFIG_PATH_PREFIX || '';

	const defaultTsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.ts')));
	const defaultJsConfigExists = existsSync(resolve(join(prefix, 'drizzle.config.js')));
	const defaultJsonConfigExists = existsSync(
		join(resolve('drizzle.config.json')),
	);

	const defaultConfigPath = defaultTsConfigExists
		? 'drizzle.config.ts'
		: defaultJsConfigExists
		? 'drizzle.config.js'
		: 'drizzle.config.json';

	if (!configPath) {
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

	console.log(chalk.grey(`Reading config file '${path}'`));
	const { unregister } = await safeRegister();
	const required = require(`${path}`);
	const content = required.default ?? required;
	unregister();

	// --- get response and then check by each dialect independently
	const res = configCommonSchema.safeParse(content);
	if (!res.success) {
		if (!('dialect' in content)) {
			console.log(error("Please specify 'dialect' param in config file"));
		}
		process.exit(1);
	}

	return res.data;
};
