import { boolean, command, type GenericBuilderInternals, number, string } from '@drizzle-team/brocli';
import chalk from 'chalk';
import { mkdirSync } from 'fs';
import { renderWithTask } from 'hanji';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { dialects } from '../utils/schemaValidator';
import '../@types/utils';
import type { MigrationConfig, MigratorInitFailResponse } from 'drizzle-orm/migrator';
import { assertUnreachable } from '../utils';
import { assertV3OutFolder } from '../utils/utils-node';
import { checkHandler } from './commands/check';
import type { Setup } from './commands/studio';
import { upCockroachHandler } from './commands/up-cockroach';
import { upMssqlHandler } from './commands/up-mssql';
import { upMysqlHandler } from './commands/up-mysql';
import { upPgHandler } from './commands/up-postgres';
import { upSinglestoreHandler } from './commands/up-singlestore';
import { upSqliteHandler } from './commands/up-sqlite';
import {
	type CheckConfig,
	prepareCheckParams,
	prepareExportConfig,
	prepareGenerateConfig,
	prepareMigrateConfig,
	preparePullConfig,
	preparePushConfig,
	prepareStudioConfig,
} from './commands/utils';
import { outputFormat, setCliContext } from './context';
import type {
	CheckOptionsInput,
	ExportOptionsInput,
	GenerateOptionsInput,
	PullOptionsInput,
	PushOptionsInput,
	UpOptionsInput,
} from './contract';
import {
	CommandOutputCliError,
	DatabaseDriverCliError,
	OrmDriverVersionCliError,
	UnsupportedCommandCliError,
	UnsupportedCommandDialectCliError,
} from './errors';
import { formatMissingHintsText } from './missing-hints-report';
import { assertOrmCoreVersion, assertPackages, assertStudioNodeVersion, ormVersionGt } from './utils';
import { assertCollisions, drivers } from './validations/common';
import type { LibSQLCredentials } from './validations/libsql';
import { withStyle } from './validations/outputs';
import type { SqliteCredentials } from './validations/sqlite';
import { grey, MigrateProgress } from './views';

type EnvelopeStatus =
	| Awaited<ReturnType<typeof runGenerate>>['status']
	| Awaited<ReturnType<typeof runPush>>['status']
	| 'error';

// Identify already-typed CLI errors structurally rather than via instanceof: under
// test module-resetting the errors module can be duplicated, breaking instanceof.
const isTypedCliError = (e: unknown): boolean =>
	e instanceof Error && typeof (e as { code?: unknown }).code === 'string'
	&& typeof (e as { humanMessage?: unknown }).humanMessage === 'string';

export const statusToExitCode = (status: EnvelopeStatus): 0 | 1 | 2 => {
	switch (status) {
		case 'ok':
			return 0;
		case 'no_changes':
			return 0;
		case 'missing_hints':
			return 2;
		case 'error':
			return 1;
		default:
			assertUnreachable(status);
	}
};

export const prepareGenerate = async (opts: GenerateOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions(
		'generate',
		opts,
		['name', 'custom', 'ignoreConflicts', 'explain', 'output', 'hints', 'hintsFile'],
		['driver', 'breakpoints', 'schema', 'out', 'dialect'],
	);
	return prepareGenerateConfig(opts as Parameters<typeof prepareGenerateConfig>[0], from);
};

export const runGenerate = async (
	config: Awaited<ReturnType<typeof prepareGenerate>>,
) => {
	await assertOrmCoreVersion();
	await assertPackages('drizzle-orm');

	assertV3OutFolder(config.out);

	const dialect = config.dialect;
	const checkResult = await checkHandler(
		config.out,
		dialect,
		config.ignoreConflicts,
	);

	if (dialect === 'postgresql') {
		const { handle } = await import('./commands/generate-postgres');
		return await handle(config as Parameters<typeof handle>[0], checkResult);
	} else if (dialect === 'mysql') {
		const { handle } = await import('./commands/generate-mysql');
		return await handle(config, checkResult);
	} else if (dialect === 'sqlite') {
		const { handle } = await import('./commands/generate-sqlite');
		return await handle(config as Parameters<typeof handle>[0], checkResult);
	} else if (dialect === 'turso') {
		const { handle } = await import('./commands/generate-libsql');
		return await handle(config as Parameters<typeof handle>[0], checkResult);
	} else if (dialect === 'singlestore') {
		const { handle } = await import('./commands/generate-singlestore');
		return await handle(config);
	} else if (dialect === 'mssql') {
		const { handle } = await import('./commands/generate-mssql');
		return await handle(config);
	} else if (dialect === 'cockroach') {
		const { handle } = await import('./commands/generate-cockroach');
		return await handle(config);
	} else if (dialect === 'duckdb') {
		throw new UnsupportedCommandCliError(
			'generate',
			"You can't use 'generate' command with DuckDb dialect",
			{
				dialect: 'DuckDb',
			},
		);
	}
	assertUnreachable(dialect);
};

export const preparePush = async (opts: PushOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions(
		'push',
		opts,
		['force', 'verbose', 'strict', 'explain', 'output', 'hints', 'hintsFile'],
		[
			'schema',
			'dialect',
			'driver',
			'url',
			'host',
			'port',
			'user',
			'password',
			'database',
			'ssl',
			'authToken',
			'schemaFilters',
			'extensionsFilters',
			'tablesFilter',
			'tlsSecurity',
		],
	);

	if (typeof opts.strict !== 'undefined') {
		throw new UnsupportedCommandCliError(
			'push',
			withStyle.fullWarning("⚠️ Deprecated: Do not use 'strict' flag. Use 'explain' instead"),
			{ option: 'strict' },
		);
	}

	return preparePushConfig(opts, from);
};

export const runPush = async (
	config: Awaited<ReturnType<typeof preparePush>>,
) => {
	await assertPackages('drizzle-orm');
	await assertOrmCoreVersion();

	const {
		dialect,
		verbose,
		credentials,
		force,
		filters,
		explain,
		migrations,
		filenames,
		hints,
	} = config;

	if (dialect === 'mysql') {
		const { handle } = await import('./commands/push-mysql');
		return await handle(
			filenames,
			credentials,
			verbose,
			force,
			filters,
			explain,
			migrations,
			hints,
		);
	} else if (dialect === 'postgresql') {
		if ('driver' in credentials) {
			const { driver } = credentials;
			if (driver === 'aws-data-api' && !(await ormVersionGt('0.30.10'))) {
				throw new OrmDriverVersionCliError(
					'aws-data-api',
					'0.30.10',
					"To use 'aws-data-api' driver - please update drizzle-orm to the latest version",
				);
			}
			if (driver === 'pglite' && !(await ormVersionGt('0.30.6'))) {
				throw new OrmDriverVersionCliError(
					'pglite',
					'0.30.6',
					"To use 'pglite' driver - please update drizzle-orm to the latest version",
				);
			}
		}

		const { SchemaSource } = await import('../dialects/postgres/drizzle');
		const { handle } = await import('./commands/push-postgres');
		return await handle(
			SchemaSource.fromFilenames(filenames),
			verbose,
			credentials,
			filters,
			force,
			explain,
			migrations,
			hints,
		);
	} else if (dialect === 'sqlite' || dialect === 'turso') {
		const { connectToSQLite, connectToTursoRemote: connectToLibSQL } = await import('./connections');
		const db = dialect === 'sqlite'
			? await connectToSQLite(credentials as SqliteCredentials)
			: await connectToLibSQL(credentials as LibSQLCredentials);

		const { SchemaSource } = await import('../dialects/sqlite/drizzle');
		const { handle: sqlitePush } = await import('./commands/push-sqlite');
		return await sqlitePush(
			db,
			SchemaSource.fromFilenames(filenames),
			verbose,
			credentials,
			filters,
			force,
			explain,
			migrations,
			dialect === 'turso' ? 'turso' : 'sqlite',
			hints,
		);
	} else if (dialect === 'singlestore') {
		const { handle } = await import('./commands/push-singlestore');
		return await handle(
			filenames,
			credentials,
			filters,
			verbose,
			force,
			explain,
			migrations,
			hints,
		);
	} else if (dialect === 'cockroach') {
		const { handle } = await import('./commands/push-cockroach');
		return await handle(
			filenames,
			verbose,
			credentials,
			filters,
			force,
			explain,
			migrations,
			hints,
		);
	} else if (dialect === 'mssql') {
		const { handle } = await import('./commands/push-mssql');
		return await handle(
			filenames,
			verbose,
			credentials,
			filters,
			force,
			explain,
			migrations,
			hints,
		);
	}
	assertUnreachable(dialect);
};

const optionDialect = string('dialect')
	.enum(...dialects)
	.desc(
		`Database dialect: 'postgresql', 'mysql', 'sqlite', 'turso', 'singlestore', 'duckdb' or 'mssql'`,
	);
const optionOut = string().desc("Output folder, 'drizzle' by default");
const optionConfig = string().desc('Path to drizzle config file');
const optionBreakpoints = boolean().desc(
	`Prepare SQL statements with breakpoints`,
);

const optionDriver = string()
	.enum(...drivers)
	.desc('Database driver');

const optionIgnoreConflicts = boolean('ignore-conflicts').desc(
	'Skip commutativity conflict checks',
);
const optionHints = string().desc('Inline JSON array of hints');
const optionHintsFile = string('hints-file').desc('Path to a JSON file containing a hints array');
const optionOutput = string('output').enum('text', 'json').desc('Output format').default('text');

export const generateOptions = {
	config: optionConfig,
	dialect: optionDialect,
	driver: optionDriver,
	schema: string().desc('Path to a schema file or folder'),
	out: optionOut,
	name: string().desc('Migration file name'),
	breakpoints: optionBreakpoints,
	custom: boolean()
		.desc('Prepare empty migration file for custom SQL')
		.default(false),
	ignoreConflicts: optionIgnoreConflicts,
	explain: boolean()
		.desc('Print the planned SQL changes (dry run)')
		.default(false),
	output: optionOutput,
	hints: optionHints,
	hintsFile: optionHintsFile,
} as const satisfies Record<string, GenericBuilderInternals>;

export const generate = command({
	name: 'generate',
	options: generateOptions,
	transform: prepareGenerate,
	handler: async (cfg) => {
		const env = await runGenerate(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		else if (env.status === 'missing_hints') process.stdout.write(formatMissingHintsText(env));
		process.exit(statusToExitCode(env.status));
	},
});

export const migrate = command({
	name: 'migrate',
	options: {
		config: optionConfig,
		ignoreConflicts: optionIgnoreConflicts,
	},
	transform: async (opts) => {
		const migrateConf = await prepareMigrateConfig(opts.config);
		return {
			...migrateConf,
			...(opts.ignoreConflicts !== undefined && {
				ignoreConflicts: opts.ignoreConflicts,
			}),
		};
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');
		assertV3OutFolder(opts.out);
		const { dialect, schema, table, out, credentials, ignoreConflicts } = opts;

		await checkHandler(out, dialect, ignoreConflicts);

		if (dialect === 'postgresql') {
			if ('driver' in credentials) {
				const { driver } = credentials;
				if (driver === 'aws-data-api') {
					if (!(await ormVersionGt('0.30.10'))) {
						console.log(
							"To use 'aws-data-api' driver - please update drizzle-orm to the latest version",
						);
						process.exit(1);
					}
				} else if (driver === 'pglite') {
					if (!(await ormVersionGt('0.30.6'))) {
						console.log(
							"To use 'pglite' driver - please update drizzle-orm to the latest version",
						);
						process.exit(1);
					}
				} else {
					assertUnreachable(driver);
				}
			}
			const { preparePostgresDB } = await import('./connections');
			const { migrate } = await preparePostgresDB(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'mysql') {
			const { connectToMySQL } = await import('./connections');
			const { migrate } = await connectToMySQL(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'singlestore') {
			const { connectToSingleStore } = await import('./connections');
			const { migrate } = await connectToSingleStore(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'sqlite') {
			const { connectToSQLite } = await import('./connections');
			const { migrate } = await connectToSQLite(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: opts.out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'turso') {
			const { connectToTursoRemote: connectToLibSQL } = await import('./connections');
			const { migrate } = await connectToLibSQL(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: opts.out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'cockroach') {
			const { prepareCockroach } = await import('./connections');
			const { migrate } = await prepareCockroach(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else if (dialect === 'mssql') {
			const { connectToMsSQL } = await import('./connections');
			const { migrate } = await connectToMsSQL(credentials);
			await renderWithTask(
				new MigrateProgress(),
				migrate({
					migrationsFolder: out,
					migrationsTable: table,
					migrationsSchema: schema,
				}),
			);
		} else {
			assertUnreachable(dialect);
		}
	},
});

const optionsFilters = {
	tablesFilter: string().desc('Table name filters'),
	schemaFilters: string().desc('Schema name filters'),
	extensionsFilters: string().desc(
		'`Database extensions internal database filters',
	),
} as const;

const optionsDatabaseCredentials = {
	url: string().desc('Database connection URL'),
	host: string().desc('Database host'),
	port: string().desc('Database port'),
	user: string().desc('Database user'),
	password: string().desc('Database password'),
	database: string().desc('Database name'),
	ssl: string().desc('ssl mode'),
	// Turso
	authToken: string('auth-token').desc('Database auth token [Turso]'),
	// gel
	tlsSecurity: string('tlsSecurity').desc('tls security mode'),
	// specific cases
	driver: optionDriver,
} as const;

export const pushOptions = {
	config: optionConfig,
	dialect: optionDialect,
	schema: string().desc('Path to a schema file or folder'),
	...optionsFilters,
	...optionsDatabaseCredentials,
	verbose: boolean()
		.desc('Print all statements for each push')
		.default(false),
	strict: boolean().desc('Always ask for confirmation'),
	force: boolean()
		.desc(
			'Auto-approve all data loss statements. Note: Data loss statements may truncate your tables and data',
		)
		.default(false),
	output: optionOutput,
	explain: boolean()
		.desc('Print the planned SQL changes (dry run)')
		.default(false),
	hints: optionHints,
	hintsFile: optionHintsFile,
} as const satisfies Record<string, GenericBuilderInternals>;

export const push = command({
	name: 'push',
	options: pushOptions,
	transform: preparePush,
	handler: async (cfg) => {
		const env = await runPush(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		else if (env.status === 'missing_hints') process.stdout.write(formatMissingHintsText(env));
		process.exit(statusToExitCode(env.status));
	},
});

export const checkOptions = {
	config: optionConfig,
	dialect: optionDialect,
	out: optionOut,
	ignoreConflicts: optionIgnoreConflicts,
	output: optionOutput,
} as const satisfies Record<string, GenericBuilderInternals>;

export const prepareCheck = async (opts: CheckOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions(
		'check',
		opts,
		['ignoreConflicts', 'output'],
		['dialect', 'out'],
	);
	const config: CheckConfig & { output: 'text' | 'json' } = {
		...(await prepareCheckParams(opts, from)),
		ignoreConflicts: opts.ignoreConflicts,
		output,
	};
	return config;
};

export const runCheck = async (
	config: Awaited<ReturnType<typeof prepareCheck>>,
) => {
	await assertOrmCoreVersion();
	assertV3OutFolder(config.out);
	const { out, dialect, ignoreConflicts } = config;
	await checkHandler(out, dialect, ignoreConflicts);
	return { status: 'ok' as const, dialect };
};

export const check = command({
	name: 'check',
	options: checkOptions,
	transform: prepareCheck,
	handler: async (cfg) => {
		const env = await runCheck(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		else console.log("Everything's fine 🐶🔥");
		process.exit(statusToExitCode(env.status));
	},
});

export const upOptions = {
	config: optionConfig,
	dialect: optionDialect,
	out: optionOut,
	output: optionOutput,
} as const satisfies Record<string, GenericBuilderInternals>;

export const prepareUp = async (opts: UpOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions('up', opts, ['output'], ['dialect', 'out']);
	const config = { ...(await prepareCheckParams(opts, from)), output };
	return config;
};

export const runUp = async (
	config: Awaited<ReturnType<typeof prepareUp>>,
) => {
	await assertOrmCoreVersion();
	await assertPackages('drizzle-orm');

	const { out, dialect } = config;
	let upgraded: string[];
	if (dialect === 'postgresql') {
		upgraded = upPgHandler(out);
	} else if (dialect === 'mysql') {
		upgraded = upMysqlHandler(out);
	} else if (dialect === 'sqlite' || dialect === 'turso') {
		upgraded = upSqliteHandler(out);
	} else if (dialect === 'singlestore') {
		upgraded = upSinglestoreHandler(out);
	} else if (dialect === 'cockroach') {
		upgraded = upCockroachHandler(out);
	} else if (dialect === 'mssql') {
		upgraded = upMssqlHandler(out);
	} else if (dialect === 'duckdb') {
		throw new UnsupportedCommandDialectCliError('up', 'duckdb');
	} else {
		assertUnreachable(dialect);
	}

	return { status: 'ok' as const, dialect, upgraded };
};

export const up = command({
	name: 'up',
	options: upOptions,
	transform: prepareUp,
	handler: async (cfg) => {
		const env = await runUp(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		process.exit(statusToExitCode(env.status));
	},
});

export const pullOptions = {
	config: optionConfig,
	dialect: optionDialect,
	out: optionOut,
	breakpoints: optionBreakpoints,
	casing: string('introspect-casing').enum('camel', 'preserve'),
	init: boolean('init').desc(
		'Create migration metadata for pulled schema in database',
	),
	...optionsFilters,
	...optionsDatabaseCredentials,
	output: optionOutput,
} as const satisfies Record<string, GenericBuilderInternals>;

export const preparePull = async (opts: PullOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions(
		'introspect',
		opts,
		['init', 'output'],
		[
			'dialect',
			'driver',
			'out',
			'url',
			'host',
			'port',
			'user',
			'password',
			'database',
			'ssl',
			'authToken',
			'casing',
			'breakpoints',
			'tablesFilter',
			'schemaFilters',
			'extensionsFilters',
			'tlsSecurity',
		],
	);
	return { ...(await preparePullConfig(opts, from)), output };
};

type PullManifest = {
	schemaPath: string;
	relationsPath?: string;
	snapshotPath: string;
	migrationPath?: string;
};

export const runPull = async (
	config: Awaited<ReturnType<typeof preparePull>>,
) => {
	await assertPackages('drizzle-orm');
	await assertOrmCoreVersion();

	const {
		dialect,
		credentials,
		out,
		casing,
		breakpoints,
		filters,
		init,
		migrations,
	} = config;
	mkdirSync(out, { recursive: true });

	let migrate:
		| ((config: MigrationConfig) => Promise<void | MigratorInitFailResponse>)
		| undefined;
	// Redaction descriptor captured per-dialect so the `--init` migrate span can
	// re-throw driver failures as the same DatabaseDriverCliError used above,
	// instead of leaking QueryError sql/params/credentials into the json envelope.
	let driverError: { database: string; packages: string[]; message: string } | undefined;
	let manifest: PullManifest;
	if (dialect === 'postgresql') {
		if ('driver' in credentials) {
			const { driver } = credentials;
			if (driver === 'aws-data-api' && !(await ormVersionGt('0.30.10'))) {
				throw new OrmDriverVersionCliError(
					'aws-data-api',
					'0.30.10',
					"To use 'aws-data-api' driver - please update drizzle-orm to the latest version",
				);
			}
			if (driver === 'pglite' && !(await ormVersionGt('0.30.6'))) {
				throw new OrmDriverVersionCliError(
					'pglite',
					'0.30.6',
					"To use 'pglite' driver - please update drizzle-orm to the latest version",
				);
			}
		}

		// connectX returns lazy query proxies; runtime connect/introspect failures
		// surface as QueryError and would leak sql/params/credentials into the
		// envelope, so re-throw as a redacted DatabaseDriverCliError.
		try {
			const { preparePostgresDB } = await import('./connections');
			const db = await preparePostgresDB(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'postgresql',
				packages: ['pg', 'postgres', 'bun', '@neondatabase/serverless', '@vercel/postgres'],
				message: 'Failed to connect to or introspect the Postgres database',
			};

			const { handle: introspectPostgres } = await import(
				'./commands/pull-postgres'
			);
			manifest = await introspectPostgres(casing, out, breakpoints, credentials, filters, migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'postgresql',
				['pg', 'postgres', 'bun', '@neondatabase/serverless', '@vercel/postgres'],
				'Failed to connect to or introspect the Postgres database',
			);
		}
	} else if (dialect === 'mysql') {
		try {
			const { connectToMySQL } = await import('./connections');
			const db = await connectToMySQL(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'mysql',
				packages: ['mysql2', 'bun', '@planetscale/database'],
				message: 'Failed to connect to or introspect the MySQL database',
			};

			const { handle: introspectMysql } = await import('./commands/pull-mysql');
			manifest = await introspectMysql(casing, out, breakpoints, credentials, filters, migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'mysql',
				['mysql2', 'bun', '@planetscale/database'],
				'Failed to connect to or introspect the MySQL database',
			);
		}
	} else if (dialect === 'sqlite') {
		try {
			const { connectToSQLite } = await import('./connections');
			const db = await connectToSQLite(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'sqlite',
				packages: ['better-sqlite3', 'bun', '@libsql/client', '@tursodatabase/database', 'node:sqlite'],
				message: 'Failed to connect to or introspect the SQLite database',
			};

			const { handle } = await import('./commands/pull-sqlite');
			manifest = await handle(casing, out, breakpoints, credentials, filters, 'sqlite', migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'sqlite',
				['better-sqlite3', 'bun', '@libsql/client', '@tursodatabase/database', 'node:sqlite'],
				'Failed to connect to or introspect the SQLite database',
			);
		}
	} else if (dialect === 'turso') {
		try {
			const { connectToTursoRemote: connectToLibSQL } = await import('./connections');
			const db = await connectToLibSQL(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'turso',
				packages: ['@libsql/client', '@tursodatabase/database', '@tursodatabase/serverless'],
				message: 'Failed to connect to or introspect the Turso database',
			};

			const { handle } = await import('./commands/pull-libsql');
			manifest = await handle(casing, out, breakpoints, credentials, filters, 'libsql', migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'turso',
				['@libsql/client', '@tursodatabase/database', '@tursodatabase/serverless'],
				'Failed to connect to or introspect the Turso database',
			);
		}
	} else if (dialect === 'singlestore') {
		try {
			const { connectToSingleStore } = await import('./connections');
			const db = await connectToSingleStore(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'singlestore',
				packages: ['mysql2'],
				message: 'Failed to connect to or introspect the SingleStore database',
			};

			const { handle } = await import('./commands/pull-singlestore');
			manifest = await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'singlestore',
				['mysql2'],
				'Failed to connect to or introspect the SingleStore database',
			);
		}
	} else if (dialect === 'mssql') {
		try {
			const { connectToMsSQL } = await import('./connections');
			const db = await connectToMsSQL(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'mssql',
				packages: ['mssql'],
				message: 'Failed to connect to or introspect the MsSQL database',
			};

			const { handle } = await import('./commands/pull-mssql');
			manifest = await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'mssql',
				['mssql'],
				'Failed to connect to or introspect the MsSQL database',
			);
		}
	} else if (dialect === 'cockroach') {
		try {
			const { prepareCockroach } = await import('./connections');
			const db = await prepareCockroach(credentials);
			migrate = db.migrate;
			driverError = {
				database: 'cockroach',
				packages: ['pg'],
				message: 'Failed to connect to or introspect the Cockroach database',
			};

			const { handle } = await import('./commands/pull-cockroach');
			manifest = await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(
				'cockroach',
				['pg'],
				'Failed to connect to or introspect the Cockroach database',
			);
		}
	} else {
		assertUnreachable(dialect);
	}

	if (init) {
		if (outputFormat() === 'text') {
			console.log();
			console.log(grey('Applying migration metadata to the database'));
		}

		const migrateInput = {
			migrationsFolder: out,
			migrationsTable: migrations.table,
			migrationsSchema: migrations.schema,
			// Internal param - won't be displayed in types. Do not remove.
			init: true,
		};

		// migrate() runs live driver queries; an unexpected failure throws a raw
		// QueryError carrying sql/params (and possibly credentials in e.message),
		// so re-throw it redacted exactly like the connect/introspect span above.
		let error: void | MigratorInitFailResponse;
		try {
			error = await migrate!(migrateInput);
		} catch (e) {
			if (isTypedCliError(e)) throw e;
			throw new DatabaseDriverCliError(driverError!.database, driverError!.packages, driverError!.message);
		}

		if (error) {
			if (error.exitCode === 'localMigrations') {
				throw new CommandOutputCliError('pull', "--init can't be used with existing migrations");
			}
			if (error.exitCode === 'databaseMigrations') {
				throw new CommandOutputCliError(
					'pull',
					"--init can't be used when database already has migrations set",
				);
			}
		}
	}

	return { status: 'ok' as const, dialect, ...manifest };
};

export const pull = command({
	name: 'pull',
	aliases: ['introspect'],
	options: pullOptions,
	transform: preparePull,
	handler: async (cfg) => {
		const env = await runPull(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		process.exit(statusToExitCode(env.status));
	},
});

export const studio = command({
	name: 'studio',
	options: {
		config: optionConfig,
		port: number().desc('Custom port for drizzle studio [default=4983]'),
		host: string().desc('Custom host for drizzle studio [default=0.0.0.0]'),
		verbose: boolean()
			.default(false)
			.desc('Print all stataments that are executed by Studio'),
	},
	transform: async (opts) => {
		return await prepareStudioConfig(opts);
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');

		assertStudioNodeVersion();

		const { credentials, dialect, host, port, schema: schemaPath } = opts;

		const {
			drizzleForPostgres,
			preparePgSchema,
			prepareMySqlSchema,
			drizzleForMySQL,
			prepareSQLiteSchema,
			drizzleForSQLite,
			prepareSingleStoreSchema,
			drizzleForSingleStore,
			drizzleForLibSQL,
			drizzleForDuckDb,
			// drizzleForMsSQL,
		} = await import('./commands/studio');

		let setup: Setup;

		if (dialect === 'postgresql') {
			if ('driver' in credentials) {
				const { driver } = credentials;
				if (driver === 'aws-data-api') {
					if (!(await ormVersionGt('0.30.10'))) {
						console.log(
							"To use 'aws-data-api' driver - please update drizzle-orm to the latest version",
						);
						process.exit(1);
					}
				} else if (driver === 'pglite') {
					if (!(await ormVersionGt('0.30.6'))) {
						console.log(
							"To use 'pglite' driver - please update drizzle-orm to the latest version",
						);
						process.exit(1);
					}
				} else {
					assertUnreachable(driver);
				}
			}

			const { schema, relations, files } = schemaPath
				? await preparePgSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForPostgres(
				credentials,
				schema,
				relations,
				files,
			);
		} else if (dialect === 'mysql') {
			const { schema, relations, files } = schemaPath
				? await prepareMySqlSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForMySQL(
				credentials,
				schema,
				relations,
				files,
			);
		} else if (dialect === 'sqlite') {
			const { schema, relations, files } = schemaPath
				? await prepareSQLiteSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForSQLite(
				credentials,
				schema,
				relations,
				files,
			);
		} else if (dialect === 'turso') {
			const { schema, relations, files } = schemaPath
				? await prepareSQLiteSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForLibSQL(
				credentials,
				schema,
				relations,
				files,
			);
		} else if (dialect === 'singlestore') {
			const { schema, relations, files } = schemaPath
				? await prepareSingleStoreSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForSingleStore(
				credentials,
				schema,
				relations,
				files,
			);
		} else if (dialect === 'duckdb') {
			setup = await drizzleForDuckDb(credentials);
		} else if (dialect === 'cockroach') {
			throw new Error(
				`You can't use 'studio' command with 'cockroach' dialect`,
			);
		} else {
			assertUnreachable(dialect);
		}

		const { prepareServer } = await import('./commands/studio');
		const server = await prepareServer(setup);

		const { certs } = await import('../utils/certs');
		const { key, cert } = (await certs()) || {};
		server.start({
			host,
			port,
			key,
			cert,
			cb: (err, _address) => {
				if (err) {
					console.error(err);
				} else {
					const queryParams: { port?: number; host?: string } = {};
					if (port !== 4983) {
						queryParams.port = port;
					}

					if (host !== '127.0.0.1') {
						queryParams.host = host;
					}

					const queryString = Object.keys(queryParams)
						.map((key: keyof { port?: number; host?: string }) => {
							return `${key}=${queryParams[key]}`;
						})
						.join('&');

					console.log(
						`\nDrizzle Studio is up and running on ${
							chalk.blue(
								`https://local.drizzle.studio${queryString ? `?${queryString}` : ''}`,
							)
						}`,
					);
				}
			},
		});
	},
});

export const exportOptions = {
	sql: boolean('sql').default(true).desc('Generate as sql'),
	config: optionConfig,
	dialect: optionDialect,
	schema: string().desc('Path to a schema file or folder'),
	output: optionOutput,
} as const satisfies Record<string, GenericBuilderInternals>;

export const prepareExport = async (opts: ExportOptionsInput) => {
	const output = opts.output ?? outputFormat();
	const interactive = output === 'text' && !!process.stdin.isTTY;
	setCliContext({ output, interactive });
	const from = assertCollisions(
		'export',
		opts,
		['sql', 'output'],
		['dialect', 'schema'],
	);
	const config = { ...(await prepareExportConfig(opts, from)), output };
	return config;
};

export const runExport = async (
	config: Awaited<ReturnType<typeof prepareExport>>,
) => {
	await assertOrmCoreVersion();
	await assertPackages('drizzle-orm');

	const dialect = config.dialect;
	let statements: string[];
	let warnings: string[];
	if (dialect === 'postgresql') {
		const { handleExport } = await import('./commands/generate-postgres');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'mysql') {
		const { handleExport } = await import('./commands/generate-mysql');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'sqlite') {
		const { handleExport } = await import('./commands/generate-sqlite');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'turso') {
		const { handleExport } = await import('./commands/generate-libsql');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'singlestore') {
		const { handleExport } = await import('./commands/generate-singlestore');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'mssql') {
		const { handleExport } = await import('./commands/generate-mssql');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'cockroach') {
		const { handleExport } = await import('./commands/generate-cockroach');
		({ statements, warnings } = await handleExport(config));
	} else if (dialect === 'duckdb') {
		throw new UnsupportedCommandDialectCliError('export', 'duckdb');
	} else {
		assertUnreachable(dialect);
	}

	return { status: 'ok' as const, dialect, statements, warnings };
};

export const exportRaw = command({
	name: 'export',
	desc: 'Generate diff between current state and empty state in specified formats: sql',
	options: exportOptions,
	transform: prepareExport,
	handler: async (cfg) => {
		const env = await runExport(cfg);
		if (outputFormat() === 'json') process.stdout.write(JSON.stringify(env) + '\n');
		else {
			if (env.warnings.length > 0) console.log(env.warnings.join('\n\n'));
			console.log(env.statements.join('\n'));
		}
		process.exit(statusToExitCode(env.status));
	},
});

const detectInstaller = (): { cmd: 'pnpm' | 'bunx' | 'yarn' | 'npx'; args: string[] } => {
	const userAgent = process.env.npm_config_user_agent ?? '';
	const token = userAgent.split(' ')[0] ?? '';
	const [name, version] = token.split('/');

	if (name === 'pnpm') return { cmd: 'pnpm', args: ['dlx'] };
	if (name === 'bun') return { cmd: 'bunx', args: [] };
	if (name === 'yarn') {
		const major = Number.parseInt(version ?? '', 10);
		if (Number.isFinite(major) && major >= 2) return { cmd: 'yarn', args: ['dlx'] };
		return { cmd: 'npx', args: ['-y'] };
	}
	return { cmd: 'npx', args: ['-y'] };
};

const skillsVersion = command({
	name: 'version',
	options: {},
	handler: () => {
		const revision = process.env.DRIZZLE_KIT_SKILLS_REVISION;
		process.stdout.write(`${revision ? revision : '--'}\n`);
	},
});

export const mcp = command({
	name: 'mcp',
	options: {},
	handler: async () => {
		const { startMcpServer } = await import('../mcp/server');
		await startMcpServer();
	},
});

export const skills = command({
	name: 'skills',
	options: {},
	subcommands: [skillsVersion],
	handler: async () => {
		const candidates = [resolve(__dirname, 'skills'), resolve(__dirname, '../../skills')];
		const skillsDir = candidates.find((p) => existsSync(p));
		if (!skillsDir) {
			process.stderr.write('Could not locate bundled skills directory.\n');
			process.exit(1);
		}

		const { cmd, args } = detectInstaller();
		process.stderr.write(`Installing via ${cmd}…\n`);
		// On Windows `shell: true` re-tokenizes argv via cmd.exe, so a `skillsDir` with spaces
		// (e.g. `C:\Program Files\…`) would split across args. Quote the path to neutralize that.
		const onWindows = process.platform === 'win32';
		const skillsArg = onWindows ? `"${skillsDir}"` : skillsDir;
		const child = spawn(cmd, [...args, 'skills@latest', 'add', skillsArg], {
			stdio: 'inherit',
			shell: onWindows,
		});
		// Awaiting child exit prevents the outer brocli `after` hook from racing process.exit(0)
		// past a non-zero child exit code.
		const exitCode = await new Promise<number>((resolve) => {
			child.on('error', () => {
				process.stderr.write(`Failed to spawn ${cmd}. Make sure ${cmd} is installed and on PATH.\n`);
				resolve(1);
			});
			child.on('exit', (code, signal) => {
				resolve(signal ? 1 : (code ?? 0));
			});
		});
		process.exit(exitCode);
	},
});
