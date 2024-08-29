import chalk from 'chalk';
import { checkHandler } from './commands/check';
import { assertOrmCoreVersion, assertPackages, assertStudioNodeVersion, ormVersionGt } from './utils';
import '../@types/utils';
import { upMysqlHandler } from './commands/mysqlUp';
import { upPgHandler } from './commands/pgUp';
import { upSqliteHandler } from './commands/sqliteUp';
import {
	prepareCheckParams,
	prepareGenerateConfig,
	prepareMigrateConfig,
	preparePullConfig,
	preparePushConfig,
	prepareStudioConfig,
} from './commands/utils';
import { assertCollisions, drivers } from './validations/common';
import 'dotenv/config';
import { boolean, command, number, string } from '@drizzle-team/brocli';
import { mkdirSync } from 'fs';
import { renderWithTask } from 'hanji';
import { dialects } from 'src/schemaValidator';
import { assertV3OutFolder } from 'src/utils';
import { assertUnreachable } from '../global';
import type { Setup } from '../serializer/studio';
import { certs } from '../utils/certs';
import { grey, MigrateProgress } from './views';

const optionDialect = string('dialect')
	.enum(...dialects)
	.desc(`Database dialect: 'postgresql', 'mysql' or 'sqlite'`);
const optionOut = string().desc("Output folder, 'drizzle' by default");
const optionConfig = string().desc('Path to drizzle config file');
const optionBreakpoints = boolean().desc(
	`Prepare SQL statements with breakpoints`,
);

const optionDriver = string()
	.enum(...drivers)
	.desc('Database driver');

export const generate = command({
	name: 'generate',
	options: {
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
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'generate',
			opts,
			['name', 'custom'],
			['driver', 'breakpoints', 'schema', 'out', 'dialect'],
		);
		return prepareGenerateConfig(opts, from);
	},
	handler: async (opts) => {
		await assertOrmCoreVersion();
		await assertPackages('drizzle-orm');
		assertV3OutFolder(opts.out);

		const {
			prepareAndMigratePg,
			prepareAndMigrateMysql,
			prepareAndMigrateSqlite,
		} = await import('./commands/migrate');

		const dialect = opts.dialect;
		if (dialect === 'postgresql') {
			await prepareAndMigratePg(opts);
		} else if (dialect === 'mysql') {
			await prepareAndMigrateMysql(opts);
		} else if (dialect === 'sqlite') {
			await prepareAndMigrateSqlite(opts);
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
		try {
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
			} else {
				assertUnreachable(dialect);
			}
		} catch (e) {
			console.error(e);
			process.exit(1);
		}

		process.exit(0);
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
	// specific cases
	driver: optionDriver,
} as const;

export const push = command({
	name: 'push',
	options: {
		config: optionConfig,
		dialect: optionDialect,
		schema: string().desc('Path to a schema file or folder'),
		...optionsFilters,
		...optionsDatabaseCredentials,
		verbose: boolean()
			.desc('Print all statements for each push')
			.default(false),
		strict: boolean().desc('Always ask for confirmation').default(false),
		force: boolean()
			.desc(
				'Auto-approve all data loss statements. Note: Data loss statements may truncate your tables and data',
			)
			.default(false),
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'push',
			opts,
			['force', 'verbose', 'strict'],
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
			],
		);

		return preparePushConfig(opts, from);
	},
	handler: async (config) => {
		await assertPackages('drizzle-orm');
		await assertOrmCoreVersion();

		const {
			dialect,
			schemaPath,
			strict,
			verbose,
			credentials,
			tablesFilter,
			schemasFilter,
			force,
		} = config;

		try {
			if (dialect === 'mysql') {
				const { mysqlPush } = await import('./commands/push');
				await mysqlPush(
					schemaPath,
					credentials,
					tablesFilter,
					strict,
					verbose,
					force,
				);
			} else if (dialect === 'postgresql') {
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

				const { pgPush } = await import('./commands/push');
				await pgPush(
					schemaPath,
					verbose,
					strict,
					credentials,
					tablesFilter,
					schemasFilter,
					force,
				);
			} else if (dialect === 'sqlite') {
				const { sqlitePush } = await import('./commands/push');
				await sqlitePush(
					schemaPath,
					verbose,
					strict,
					credentials,
					tablesFilter,
					force,
				);
			} else {
				assertUnreachable(dialect);
			}
		} catch (e) {
			console.error(e);
		}
		process.exit(0);
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

		const { out, dialect } = config;
		checkHandler(out, dialect);
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

		if (dialect === 'sqlite') {
			upSqliteHandler(out);
		}
	},
});

export const pull = command({
	name: 'introspect',
	aliases: ['pull'],
	options: {
		config: optionConfig,
		dialect: optionDialect,
		out: optionOut,
		breakpoints: optionBreakpoints,
		casing: string('introspect-casing').enum('camel', 'preserve'),
		...optionsFilters,
		...optionsDatabaseCredentials,
	},
	transform: async (opts) => {
		const from = assertCollisions(
			'introspect',
			opts,
			[],
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
			tablesFilter,
			schemasFilter,
		} = config;
		mkdirSync(out, { recursive: true });

		console.log(
			grey(
				`Pulling from [${
					schemasFilter
						.map((it) => `'${it}'`)
						.join(', ')
				}] list of schemas`,
			),
		);
		console.log();

		try {
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

				const { introspectPostgres } = await import('./commands/introspect');
				await introspectPostgres(
					casing,
					out,
					breakpoints,
					credentials,
					tablesFilter,
					schemasFilter,
				);
			} else if (dialect === 'mysql') {
				const { introspectMysql } = await import('./commands/introspect');
				await introspectMysql(
					casing,
					out,
					breakpoints,
					credentials,
					tablesFilter,
				);
			} else if (dialect === 'sqlite') {
				const { introspectSqlite } = await import('./commands/introspect');
				await introspectSqlite(
					casing,
					out,
					breakpoints,
					credentials,
					tablesFilter,
				);
			} else {
				assertUnreachable(dialect);
			}
		} catch (e) {
			console.error(e);
		}
		process.exit(0);
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
		} = await prepareStudioConfig(opts);

		const {
			drizzleForPostgres,
			preparePgSchema,
			prepareMySqlSchema,
			drizzleForMySQL,
			prepareSQLiteSchema,
			drizzleForSQLite,
		} = await import('../serializer/studio');

		let setup: Setup;
		try {
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
				setup = await drizzleForPostgres(credentials, schema, relations, files);
			} else if (dialect === 'mysql') {
				const { schema, relations, files } = schemaPath
					? await prepareMySqlSchema(schemaPath)
					: { schema: {}, relations: {}, files: [] };
				setup = await drizzleForMySQL(credentials, schema, relations, files);
			} else if (dialect === 'sqlite') {
				const { schema, relations, files } = schemaPath
					? await prepareSQLiteSchema(schemaPath)
					: { schema: {}, relations: {}, files: [] };
				setup = await drizzleForSQLite(credentials, schema, relations, files);
			} else {
				assertUnreachable(dialect);
			}

			const { prepareServer } = await import('../serializer/studio');

			const server = await prepareServer(setup);

			const { key, cert } = (await certs()) || {};
			server.start({
				host,
				port,
				key,
				cert,
				cb: (err, address) => {
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
		} catch (e) {
			console.error(e);
			process.exit(0);
		}
	},
});
