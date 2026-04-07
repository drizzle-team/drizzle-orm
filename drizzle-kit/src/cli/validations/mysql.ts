import type { TypeOf } from 'zod';
import { boolean, coerce, object, string, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { wrapParam } from './common';
import { outputs } from './outputs';

export const mysqlCredentials = union([
	object({
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		password: string().min(1).optional(),
		database: string().min(1),
		ssl: union([
			string(),
			object({
				pfx: string().optional(),
				key: string().optional(),
				passphrase: string().optional(),
				cert: string().optional(),
				ca: union([string(), string().array()]).optional(),
				crl: union([string(), string().array()]).optional(),
				ciphers: string().optional(),
				rejectUnauthorized: boolean().optional(),
			}),
		]).optional(),
	}),
	object({
		url: string().min(1),
	}),
]);

export type MysqlCredentials = TypeOf<typeof mysqlCredentials>;

export const printCliConnectionIssues = (options: any) => {
	const { uri, host, database } = options || {};

	if (!uri && (!host || !database)) {
		console.log(outputs.mysql.connection.required());
	}
};

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
): never => {
	if ('url' in options) {
		let text = `Please provide required params for MySQL driver:\n`;
		throw new ConfigConnectionCliError(
			'mysql',
			['url'],
			[
				error(text),
				wrapParam('url', options.url, false, 'url'),
			].join('\n'),
		);
	}

	let text = `Please provide required params for MySQL driver:\n`;
	throw new ConfigConnectionCliError(
		'mysql',
		['host', 'database'],
		[
			error(text),
			wrapParam('host', options.host),
			wrapParam('port', options.port, true),
			wrapParam('user', options.user, true),
			wrapParam('password', options.password, true, 'secret'),
			wrapParam('database', options.database),
			wrapParam('ssl', options.ssl, true),
		].join('\n'),
	);
};
