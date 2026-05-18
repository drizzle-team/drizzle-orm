import type { TypeOf } from 'zod';
import { boolean, coerce, object, string, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

export const mssqlCredentials = union([
	object({
		port: coerce.number().min(1).optional(),
		user: string().min(1),
		password: string().min(1),
		database: string().min(1).optional(),
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

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if (
		'port' in options || 'user' in options || 'password' in options || 'database' in options || 'server' in options
		|| 'options' in options
	) {
		let text = `Please provide required params for Postgres driver:\n`;
		console.log(error(text));
		console.log(wrapParam('server', options.server));
		console.log(wrapParam('port', options.port, true));
		console.log(wrapParam('user', options.user));
		console.log(wrapParam('password', options.password, false, 'secret'));
		console.log(wrapParam('database', options.database, true));
		console.log(wrapParam('options', options.options, true));
		process.exit(1);
	}

	let text = `Please provide required params:\n`;
	console.log(error(text));
	console.log(wrapParam('url', options.url, false, 'url'));
	process.exit(1);
};
