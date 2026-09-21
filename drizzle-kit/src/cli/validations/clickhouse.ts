import { object, string, TypeOf, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';
import { outputs } from './outputs';

/**
 * ClickHouse is reached over HTTP, so the connection is a URL plus optional credentials rather than
 * the host/port pair the row-store drivers take.
 */
export const clickhouseCredentials = union([
	object({
		url: string().min(1),
		user: string().min(1).optional(),
		password: string().optional(),
		database: string().min(1).optional(),
	}),
	object({
		host: string().min(1),
		port: string().or(string().regex(/^\d+$/)).optional(),
		user: string().min(1).optional(),
		password: string().optional(),
		database: string().min(1).optional(),
	}),
]);

export type ClickHouseCredentials = TypeOf<typeof clickhouseCredentials>;

export const printCliConnectionIssues = (options: any) => {
	const { url, host } = options || {};

	if (!url && !host) {
		console.log(outputs.clickhouse.connection.required());
	}
};

export const printConfigConnectionIssues = (options: Record<string, unknown>) => {
	const text = `Please provide required params for ClickHouse driver:\n`;
	console.log(error(text));
	console.log(wrapParam('url', options.url, true, 'url'));
	console.log(wrapParam('host', options.host, true));
	console.log(wrapParam('port', options.port, true));
	console.log(wrapParam('user', options.user, true));
	console.log(wrapParam('password', options.password, true, 'secret'));
	console.log(wrapParam('database', options.database, true));
	process.exit(1);
};
