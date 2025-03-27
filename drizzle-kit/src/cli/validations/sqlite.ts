import { softAssertUnreachable } from 'src/global';
import { literal, object, string, TypeOf, undefined, union } from 'zod';
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
		driver: undefined(),
		url: string().min(1),
	}).transform<{ url: string }>((o) => {
		delete o.driver;
		return o;
	}),
]);

export type SqliteCredentials =
	| {
		driver: 'd1-http';
		accountId: string;
		databaseId: string;
		token: string;
	}
	| {
		url: string;
	};

const _: SqliteCredentials = {} as TypeOf<typeof sqliteCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
	command: 'generate' | 'migrate' | 'push' | 'pull' | 'studio',
) => {
	const parsedDriver = sqliteDriver.safeParse(options.driver);
	const driver = parsedDriver.success ? parsedDriver.data : ('' as never);

	if (driver === 'expo') {
		if (command === 'migrate') {
			console.log(
				error(
					`You can't use 'migrate' command with Expo SQLite, please follow migration instructions in our docs - https://orm.drizzle.team/docs/get-started-sqlite#expo-sqlite`,
				),
			);
		} else if (command === 'studio') {
			console.log(
				error(
					`You can't use 'studio' command with Expo SQLite, please use Expo Plugin https://www.npmjs.com/package/expo-drizzle-studio-plugin`,
				),
			);
		} else if (command === 'pull') {
			console.log(error("You can't use 'pull' command with Expo SQLite"));
		} else if (command === 'push') {
			console.log(error("You can't use 'push' command with Expo SQLite"));
		} else {
			console.log(error('Unexpected error with expo driver 🤔'));
		}
		process.exit(1);
	} else if (driver === 'd1-http') {
		let text = `Please provide required params for D1 HTTP driver:\n`;
		console.log(error(text));
		console.log(wrapParam('accountId', options.accountId));
		console.log(wrapParam('databaseId', options.databaseId));
		console.log(wrapParam('token', options.token, false, 'secret'));
		process.exit(1);
	} else if (driver === 'durable-sqlite') {
		if (command === 'migrate') {
			console.log(
				error(
					`You can't use 'migrate' command with SQLite Durable Objects`,
				),
			);
		} else if (command === 'studio') {
			console.log(
				error(
					`You can't use 'studio' command with SQLite Durable Objects`,
				),
			);
		} else if (command === 'pull') {
			console.log(error("You can't use 'pull' command with SQLite Durable Objects"));
		} else if (command === 'push') {
			console.log(error("You can't use 'push' command with SQLite Durable Objects"));
		} else {
			console.log(error('Unexpected error with SQLite Durable Object driver 🤔'));
		}
		process.exit(1);
	} else {
		softAssertUnreachable(driver);
	}

	let text = `Please provide required params:\n`;
	console.log(error(text));
	console.log(wrapParam('url', options.url));
	process.exit(1);
};
