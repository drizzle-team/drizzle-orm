import type { TypeOf } from 'zod';
import { boolean, coerce, object, string, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';
import { outputs } from './outputs';

export const mssqlCredentials = union([
	object({
		port: coerce.number().min(1),
		user: string().min(1),
		password: string().min(1),
		database: string().min(1),
		server: string().min(1),

		options: object({
			encrypt: boolean().optional(),
			trustServerCertificate: boolean().optional(),
		}).optional(),
	}),
	object({
		url: string().min(1),
	}),
]);

export type MssqlCredentials = TypeOf<typeof mssqlCredentials>;

export const printCliConnectionIssues = (options: any) => {
	const { uri, host, database } = options || {};

	if (!uri && (!host || !database)) {
		console.log(outputs.mssql.connection.required());
	}
};

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if ('url' in options) {
		let text = `Please provide required params for MsSQL driver:\n`;
		console.log(error(text));
		console.log(wrapParam('url', options.url, false, 'url'));
		process.exit(1);
	}

	let text = `Please provide required params for MySQL driver:\n`;
	console.log(error(text));
	console.log(wrapParam('server', options.server));
	console.log(wrapParam('port', options.port));
	console.log(wrapParam('user', options.user));
	console.log(wrapParam('password', options.password, false, 'secret'));
	console.log(wrapParam('database', options.database));
	process.exit(1);
};
