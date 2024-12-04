import chalk from 'chalk';
import { sqliteDriversLiterals } from './common';

export const withStyle = {
	error: (str: string) => `${chalk.red(`${chalk.white.bgRed(' Invalid input ')} ${str}`)}`,
	warning: (str: string) => `${chalk.white.bgGray(' Warning ')} ${str}`,
	errorWarning: (str: string) => `${chalk.red(`${chalk.white.bgRed(' Warning ')} ${str}`)}`,
	fullWarning: (str: string) => `${chalk.black.bgYellow(' Warning ')} ${chalk.bold(str)}`,
	suggestion: (str: string) => `${chalk.white.bgGray(' Suggestion ')} ${str}`,
	info: (str: string) => `${chalk.grey(str)}`,
};

export const outputs = {
	studio: {
		drivers: (param: string) =>
			withStyle.error(
				`"${param}" is not a valid driver. Available drivers: "pg", "mysql2", "better-sqlite", "libsql", "turso". You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
			),
		noCredentials: () =>
			withStyle.error(
				`Please specify a 'dbCredentials' param in config. It will help drizzle to know how to query you database. You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
			),
		noDriver: () =>
			withStyle.error(
				`Please specify a 'driver' param in config. It will help drizzle to know how to query you database. You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
			),
		noDialect: () =>
			withStyle.error(
				`Please specify 'dialect' param in config, either of 'postgresql', 'mysql', 'sqlite', turso or singlestore`,
			),
	},
	common: {
		ambiguousParams: (command: string) =>
			withStyle.error(
				`You can't use both --config and other cli options for ${command} command`,
			),
		schema: (command: string) => withStyle.error(`"--schema" is a required field for ${command} command`),
	},
	postgres: {
		connection: {
			required: () =>
				withStyle.error(
					`Either "url" or "host", "database" are required for database connection`,
				),
			awsDataApi: () =>
				withStyle.error(
					"You need to provide 'database', 'secretArn' and 'resourceArn' for Drizzle Kit to connect to AWS Data API",
				),
		},
	},
	mysql: {
		connection: {
			driver: () => withStyle.error(`Only "mysql2" is available options for "--driver"`),
			required: () =>
				withStyle.error(
					`Either "url" or "host", "database" are required for database connection`,
				),
		},
	},
	sqlite: {
		connection: {
			driver: () => {
				const listOfDrivers = sqliteDriversLiterals
					.map((it) => `'${it.value}'`)
					.join(', ');
				return withStyle.error(
					`Either ${listOfDrivers} are available options for 'driver' param`,
				);
			},
			url: (driver: string) =>
				withStyle.error(
					`"url" is a required option for driver "${driver}". You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
				),
			authToken: (driver: string) =>
				withStyle.error(
					`"authToken" is a required option for driver "${driver}". You can read more about drizzle.config: https://orm.drizzle.team/kit-docs/config-reference`,
				),
		},
		introspect: {},
		push: {},
	},
	singlestore: {
		connection: {
			driver: () => withStyle.error(`Only "mysql2" is available options for "--driver"`),
			required: () =>
				withStyle.error(
					`Either "url" or "host", "database" are required for database connection`,
				),
		},
	},
};
