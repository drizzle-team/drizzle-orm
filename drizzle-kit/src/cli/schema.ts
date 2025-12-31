import { boolean, command, number, string } from '@drizzle-team/brocli';
import chalk from 'chalk';
import 'dotenv/config';
import { mkdirSync } from 'fs';
import { renderWithTask } from 'hanji';
import { dialects } from 'src/utils/schemaValidator';
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
	prepareCheckParams,
	prepareExportConfig,
	prepareGenerateConfig,
	prepareMigrateConfig,
	preparePullConfig,
	preparePushConfig,
	prepareStudioConfig,
} from './commands/utils';
import { assertOrmCoreVersion, assertPackages, assertStudioNodeVersion, ormVersionGt } from './utils';
import { assertCollisions, drivers } from './validations/common';
import { withStyle } from './validations/outputs';
import { error, grey, MigrateProgress } from './views';

const optionDialect = string('dialect')
	.enum(...dialects)
	.desc(
		`Database dialect: 'gel', 'postgresql', 'mysql', 'sqlite', 'turso', 'singlestore', 'duckdb' or 'mssql'`,
	);
const optionOut = string().desc("Output folder, 'drizzle' by default");
const optionConfig = string().desc('Path to drizzle config file');
const optionBreakpoints = boolean().desc(
	`Prepare SQL statements with breakpoints`,
);

const optionDriver = string()
	.enum(...drivers)
	.desc('Database driver');

const optionCasing = string().enum('camelCase', 'snake_case').desc('Casing for serialization');

export const generate = command({
	name: 'generate',
	options: {
		config: optionConfig,
		dialect: optionDialect,
		driver: optionDriver,
		casing: optionCasing,
		schema: string().desc('Path to a schema file or folder'),
		out: optionOut,
		name: string().desc('Migration file name'),
		breakpoints: optionBreakpoints,
		custom: boolean()
			.desc('Prepare empty migration file for custom SQL')
			.default(false),
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'generate',
			opts,
			['name', 'custom'],
			['driver', 'breakpoints', 'schema', 'out', 'dialect', 'casing'],
		);
		return prepareGenerateConfig(opts, from);
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');

		assertV3OutFolder(opts.out);

		const dialect = opts.dialect;
		await checkHandler(opts.out, dialect);

		if (dialect === 'postgresql') {
			const { handle } = await import('./commands/generate-postgres');
			await handle(opts);
		} else if (dialect === 'mysql') {
			const { handle } = await import('./commands/generate-mysql');
			await handle(opts);
		} else if (dialect === 'sqlite') {
			const { handle } = await import('./commands/generate-sqlite');
			await handle(opts);
		} else if (dialect === 'turso') {
			const { handle } = await import('./commands/generate-libsql');
			await handle(opts);
		} else if (dialect === 'singlestore') {
			const { handle } = await import('./commands/generate-singlestore');
			await handle(opts);
		} else if (dialect === 'gel') {
			throw new Error(`You can't use 'generate' command with Gel dialect`);
		} else if (dialect === 'mssql') {
			const { handle } = await import('./commands/generate-mssql');
			await handle(opts);
		} else if (dialect === 'cockroach') {
			const { handle } = await import('./commands/generate-cockroach');
			await handle(opts);
		} else if (dialect === 'duckdb') {
			console.log(
				error(
					`You can't use 'generate' command with DuckDb dialect`,
				),
			);
			process.exit(1);
		} else {
			assertUnreachable(dialect);
		}
	},
});

export const migrate = command({
	name: 'migrate',
	options: {
		config: optionConfig,
	},
	transform: async (opts) => {
		return await prepareMigrateConfig(opts.config);
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');

		assertV3OutFolder(opts.out);

		const { dialect, schema, table, out, credentials } = opts;

		await checkHandler(out, dialect);

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
			const { connectToLibSQL } = await import('./connections');
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
		} else if (dialect === 'gel') {
			throw new Error(`You can't use 'migrate' command with Gel dialect`);
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

export const push = command({
	name: 'push',
	options: {
		config: optionConfig,
		dialect: optionDialect,
		casing: optionCasing,
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
		explain: boolean()
			.desc('Print the planned SQL changes (dry run)')
			.default(false),
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'push',
			opts,
			['force', 'verbose', 'strict', 'explain'],
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
				'casing',
				'tlsSecurity',
			],
		);

		if (typeof opts.strict !== 'undefined') {
			console.log(withStyle.fullWarning(
				"⚠️ Deprecated: Do not use 'strict' flag. Use 'explain' instead",
			));
			process.exit(1);
		}

		return preparePushConfig(opts, from);
	},
	handler: async (config) => {
		await assertPackages('drizzle-orm');
		await assertOrmCoreVersion();

		const {
			dialect,
			schemaPath,
			verbose,
			credentials,
			force,
			casing,
			filters,
			explain,
			migrations,
		} = config;

		if (dialect === 'mysql') {
			const { handle } = await import('./commands/push-mysql');
			await handle(
				schemaPath,
				credentials,
				verbose,
				force,
				casing,
				filters,
				explain,
				migrations,
			);
		} else if (dialect === 'postgresql') {
			if ('driver' in credentials) {
				const { driver } = credentials;
				if (driver === 'aws-data-api' && !(await ormVersionGt('0.30.10'))) {
					console.log("To use 'aws-data-api' driver - please update drizzle-orm to the latest version");
					process.exit(1);
				}
				if (driver === 'pglite' && !(await ormVersionGt('0.30.6'))) {
					console.log("To use 'pglite' driver - please update drizzle-orm to the latest version");
					process.exit(1);
				}
			}

			const { handle } = await import('./commands/push-postgres');
			await handle(
				schemaPath,
				verbose,
				credentials,
				filters,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'sqlite') {
			const { handle: sqlitePush } = await import('./commands/push-sqlite');
			await sqlitePush(
				schemaPath,
				verbose,
				credentials,
				filters,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'turso') {
			const { handle: libSQLPush } = await import('./commands/push-libsql');
			await libSQLPush(
				schemaPath,
				verbose,
				credentials,
				filters,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'singlestore') {
			const { handle } = await import('./commands/push-singlestore');
			await handle(
				schemaPath,
				credentials,
				filters,
				verbose,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'cockroach') {
			const { handle } = await import('./commands/push-cockroach');
			await handle(
				schemaPath,
				verbose,
				credentials,
				filters,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'mssql') {
			const { handle } = await import('./commands/push-mssql');
			await handle(
				schemaPath,
				verbose,
				credentials,
				filters,
				force,
				casing,
				explain,
				migrations,
			);
		} else if (dialect === 'gel') {
			console.log(error(`You can't use 'push' command with Gel dialect`));
		} else {
			assertUnreachable(dialect);
		}
	},
});

export const check = command({
	name: 'check',
	options: {
		config: optionConfig,
		dialect: optionDialect,
		out: optionOut,
	},
	transform: async (opts) => {
		const from = assertCollisions('check', opts, [], ['dialect', 'out']);
		return prepareCheckParams(opts, from);
	},
	handler: async (config) => {
		await assertOrmCoreVersion();

		assertV3OutFolder(config.out);

		const { out, dialect } = config;
		await checkHandler(out, dialect);
		console.log("Everything's fine 🐶🔥");
	},
});

export const up = command({
	name: 'up',
	options: {
		config: optionConfig,
		dialect: optionDialect,
		out: optionOut,
	},
	transform: async (opts) => {
		const from = assertCollisions('check', opts, [], ['dialect', 'out']);
		return prepareCheckParams(opts, from);
	},
	handler: async (config) => {
		await assertOrmCoreVersion();

		const { out, dialect } = config;
		await assertPackages('drizzle-orm');

		if (dialect === 'postgresql') {
			upPgHandler(out);
		}

		if (dialect === 'mysql') {
			upMysqlHandler(out);
		}

		if (dialect === 'sqlite' || dialect === 'turso') {
			upSqliteHandler(out);
		}

		if (dialect === 'singlestore') {
			upSinglestoreHandler(out);
		}

		if (dialect === 'cockroach') {
			upCockroachHandler(out);
		}

		if (dialect === 'mssql') {
			upMssqlHandler(out);
		}

		if (dialect === 'gel') {
			throw new Error(`You can't use 'up' command with Gel dialect`);
		}
	},
});

export const pull = command({
	name: 'pull',
	aliases: ['introspect'],
	options: {
		config: optionConfig,
		dialect: optionDialect,
		out: optionOut,
		breakpoints: optionBreakpoints,
		casing: string('introspect-casing').enum('camel', 'preserve'),
		init: boolean('init').desc('Create migration metadata for pulled schema in database'),
		...optionsFilters,
		...optionsDatabaseCredentials,
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'introspect',
			opts,
			['init'],
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
		return preparePullConfig(opts, from);
	},
	handler: async (config) => {
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

		let migrate: ((config: MigrationConfig) => Promise<void | MigratorInitFailResponse>) | undefined;
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
			const db = await preparePostgresDB(credentials);
			migrate = db.migrate;

			const { handle: introspectPostgres } = await import('./commands/pull-postgres');
			await introspectPostgres(casing, out, breakpoints, credentials, filters, migrations, db);
		} else if (dialect === 'mysql') {
			const { connectToMySQL } = await import('./connections');
			const db = await connectToMySQL(credentials);
			migrate = db.migrate;

			const { handle: introspectMysql } = await import('./commands/pull-mysql');
			await introspectMysql(casing, out, breakpoints, credentials, filters, migrations, db);
		} else if (dialect === 'sqlite') {
			const { connectToSQLite } = await import('./connections');
			const db = await connectToSQLite(credentials);
			migrate = db.migrate;

			const { handle } = await import('./commands/pull-sqlite');
			await handle(casing, out, breakpoints, credentials, filters, 'sqlite', migrations, db);
		} else if (dialect === 'turso') {
			const { connectToLibSQL } = await import('./connections');
			const db = await connectToLibSQL(credentials);
			migrate = db.migrate;

			const { handle } = await import('./commands/pull-libsql');
			await handle(casing, out, breakpoints, credentials, filters, 'libsql', migrations, db);
		} else if (dialect === 'singlestore') {
			const { connectToSingleStore } = await import('./connections');
			const db = await connectToSingleStore(credentials);
			migrate = db.migrate;

			const { handle } = await import('./commands/pull-singlestore');
			await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} else if (dialect === 'gel') {
			const { prepareGelDB } = await import('./connections');
			const db = await prepareGelDB(credentials);
			// migrate = db.migrate;

			const { handle } = await import('./commands/pull-gel');
			await handle(casing, out, breakpoints, credentials, filters, db);
		} else if (dialect === 'mssql') {
			const { connectToMsSQL } = await import('./connections');
			const db = await connectToMsSQL(credentials);
			migrate = db.migrate;

			const { handle } = await import('./commands/pull-mssql');
			await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} else if (dialect === 'cockroach') {
			const { prepareCockroach } = await import('./connections');
			const db = await prepareCockroach(credentials);
			migrate = db.migrate;

			const { handle } = await import('./commands/pull-cockroach');
			await handle(casing, out, breakpoints, credentials, filters, migrations, db);
		} else {
			assertUnreachable(dialect);
		}

		if (init) {
			if (!migrate) throw new Error(`--init can't be used with '${dialect}' dialect`);

			console.log();
			console.log(grey('Applying migration metadata to the database'));

			const migrateInput = {
				migrationsFolder: out,
				migrationsTable: migrations.table,
				migrationsSchema: migrations.schema,
				// Internal param - won't be displayed in types. Do not remove.
				init: true,
			};

			const error = await migrate(migrateInput);

			if (error) {
				if (error.exitCode === 'localMigrations') {
					throw new Error("--init can't be used with existing migrations");
				}
				if (error.exitCode === 'databaseMigrations') {
					throw new Error("--init can't be used when database already has migrations set");
				}
			}
		}
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
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');

		assertStudioNodeVersion();

		const {
			dialect,
			schema: schemaPath,
			port,
			host,
			credentials,
			casing,
		} = await prepareStudioConfig(opts);

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
			setup = await drizzleForPostgres(credentials, schema, relations, files, casing);
		} else if (dialect === 'mysql') {
			const { schema, relations, files } = schemaPath
				? await prepareMySqlSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForMySQL(credentials, schema, relations, files, casing);
		} else if (dialect === 'sqlite') {
			const { schema, relations, files } = schemaPath
				? await prepareSQLiteSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForSQLite(credentials, schema, relations, files, casing);
		} else if (dialect === 'turso') {
			const { schema, relations, files } = schemaPath
				? await prepareSQLiteSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForLibSQL(credentials, schema, relations, files, casing);
		} else if (dialect === 'singlestore') {
			const { schema, relations, files } = schemaPath
				? await prepareSingleStoreSchema(schemaPath)
				: { schema: {}, relations: {}, files: [] };
			setup = await drizzleForSingleStore(
				credentials,
				schema,
				relations,
				files,
				casing,
			);
		} else if (dialect === 'duckdb') {
			setup = await drizzleForDuckDb(credentials);
		} else if (dialect === 'cockroach') {
			throw new Error(`You can't use 'studio' command with 'cockroach' dialect`);
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

export const exportRaw = command({
	name: 'export',
	desc: 'Generate diff between current state and empty state in specified formats: sql',
	options: {
		sql: boolean('sql').default(true).desc('Generate as sql'),
		config: optionConfig,
		dialect: optionDialect,
		schema: string().desc('Path to a schema file or folder'),
	},
	transform: async (opts) => {
		const from = assertCollisions('export', opts, ['sql'], ['dialect', 'schema']);
		return prepareExportConfig(opts, from);
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');

		const dialect = opts.dialect;
		if (dialect === 'postgresql') {
			const { handleExport } = await import('./commands/generate-postgres');
			await handleExport(opts);
		} else if (dialect === 'mysql') {
			const { handleExport } = await import('./commands/generate-mysql');
			await handleExport(opts);
		} else if (dialect === 'sqlite') {
			const { handleExport } = await import('./commands/generate-sqlite');
			await handleExport(opts);
		} else if (dialect === 'turso') {
			const { handleExport } = await import('./commands/generate-libsql');
			await handleExport(opts);
		} else if (dialect === 'singlestore') {
			const { handleExport } = await import('./commands/generate-singlestore');
			await handleExport(opts);
		} else if (dialect === 'gel') {
			throw new Error(`You can't use 'export' command with Gel dialect`);
		} else if (dialect === 'mssql') {
			const { handleExport } = await import('./commands/generate-mssql');
			await handleExport(opts);
		} else if (dialect === 'cockroach') {
			const { handleExport } = await import('./commands/generate-cockroach');
			await handleExport(opts);
		} else if (dialect === 'duckdb') {
			console.log(
				error(
					`You can't use 'export' command with DuckDb dialect`,
				),
			);
			process.exit(1);
		} else {
			assertUnreachable(dialect);
		}
	},
});
