import type { TypeOf } from 'zod';
import { literal, object, string, undefined as zUndefined, union } from 'zod';
import { softAssertUnreachable } from '../../utils';
import { ConfigConnectionCliError, UnsupportedCommandCliError } from '../errors';
import { error } from '../views';
import { sqliteDriver, wrapParam } from './common';

export const sqliteCredentials = union([
	object({
		driver: literal('turso'),
		url: string().min(1),
		authToken: string().min(1).optional(),
	}),
	object({
		driver: literal('d1-http'),
		accountId: string().min(1),
		databaseId: string().min(1),
		token: string().min(1),
	}),
	object({
		driver: literal('sqlite-cloud'),
		url: string().min(1),
	}),
	object({
		driver: zUndefined(),
		url: string().min(1),
	}).transform<{ url: string }>((o) => {
		delete o.driver;
		return o;
	}),
]);

export type SqliteCredentials = {
	driver: 'd1-http';
	accountId: string;
	databaseId: string;
	token: string;
} | {
	driver: 'sqlite-cloud';
	url: string;
} | {
	url: string;
};

const _: SqliteCredentials = {} as TypeOf<typeof sqliteCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
	command: 'generate' | 'migrate' | 'push' | 'pull' | 'studio',
): never => {
	const parsedDriver = sqliteDriver.safeParse(options.driver);
	const driver = parsedDriver.success ? parsedDriver.data : ('' as never);

	if (driver === 'expo') {
		if (command === 'migrate') {
			throw new UnsupportedCommandCliError(
				'migrate',
				error(
					`You can't use 'migrate' command with Expo SQLite, please follow migration instructions in our docs - https://orm.drizzle.team/docs/get-started-sqlite#expo-sqlite`,
				),
				{ dialect: 'Expo SQLite' },
			);
		} else if (command === 'studio') {
			throw new UnsupportedCommandCliError(
				'studio',
				error(
					`You can't use 'studio' command with Expo SQLite, please use Expo Plugin https://www.npmjs.com/package/expo-drizzle-studio-plugin`,
				),
				{ dialect: 'Expo SQLite' },
			);
		} else if (command === 'pull') {
			throw new UnsupportedCommandCliError('pull', error("You can't use 'pull' command with Expo SQLite"), {
				dialect: 'Expo SQLite',
			});
		} else if (command === 'push') {
			throw new UnsupportedCommandCliError('push', error("You can't use 'push' command with Expo SQLite"), {
				dialect: 'Expo SQLite',
			});
		} else {
			throw new ConfigConnectionCliError('expo', ['driver'], error('Unexpected error with expo driver 🤔'), command);
		}
	} else if (driver === 'd1-http') {
		let text = `Please provide required params for D1 HTTP driver:\n`;
		throw new ConfigConnectionCliError(
			'd1-http',
			['accountId', 'databaseId', 'token'],
			[
				error(text),
				wrapParam('accountId', options.accountId),
				wrapParam('databaseId', options.databaseId),
				wrapParam('token', options.token, false, 'secret'),
			].join('\n'),
			command,
		);
	} else if (driver === 'durable-sqlite') {
		if (command === 'migrate') {
			throw new UnsupportedCommandCliError(
				'migrate',
				error(`You can't use 'migrate' command with SQLite Durable Objects`),
				{
					dialect: 'SQLite Durable Objects',
				},
			);
		} else if (command === 'studio') {
			throw new UnsupportedCommandCliError(
				'studio',
				error(`You can't use 'studio' command with SQLite Durable Objects`),
				{
					dialect: 'SQLite Durable Objects',
				},
			);
		} else if (command === 'pull') {
			throw new UnsupportedCommandCliError('pull', error("You can't use 'pull' command with SQLite Durable Objects"), {
				dialect: 'SQLite Durable Objects',
			});
		} else if (command === 'push') {
			throw new UnsupportedCommandCliError('push', error("You can't use 'push' command with SQLite Durable Objects"), {
				dialect: 'SQLite Durable Objects',
			});
		} else {
			throw new ConfigConnectionCliError(
				'durable-sqlite',
				['driver'],
				error('Unexpected error with SQLite Durable Object driver 🤔'),
				command,
			);
		}
	} else if (driver === 'sqlite-cloud') {
		let text = `Please provide required params for SQLite Cloud driver:\n`;
		throw new ConfigConnectionCliError(
			'sqlite-cloud',
			['url'],
			[
				error(text),
				wrapParam('url', options.url),
			].join('\n'),
			command,
		);
	} else {
		softAssertUnreachable(driver);
	}

	let text = `Please provide required params:\n`;
	throw new ConfigConnectionCliError(
		'sqlite',
		['url'],
		[
			error(text),
			wrapParam('url', options.url),
		].join('\n'),
		command,
	);
};
