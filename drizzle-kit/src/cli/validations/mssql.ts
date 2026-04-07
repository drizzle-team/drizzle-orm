import type { TypeOf } from 'zod';
import { boolean, coerce, object, string, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
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
): never => {
	if ('url' in options) {
		let text = `Please provide required params for MsSQL driver:\n`;
		throw new ConfigConnectionCliError(
			'mssql',
			['url'],
			[
				error(text),
				wrapParam('url', options.url, false, 'url'),
			].join('\n'),
		);
	}

	let text = `Please provide required params for MySQL driver:\n`;
	throw new ConfigConnectionCliError(
		'mssql',
		['server', 'port', 'user', 'password', 'database'],
		[
			error(text),
			wrapParam('server', options.server),
			wrapParam('port', options.port),
			wrapParam('user', options.user),
			wrapParam('password', options.password, false, 'secret'),
			wrapParam('database', options.database),
		].join('\n'),
	);
};
