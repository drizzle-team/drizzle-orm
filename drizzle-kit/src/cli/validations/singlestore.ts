import { boolean, coerce, object, string, TypeOf, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';
import { outputs } from './outputs';

export const singlestoreCredentials = union([
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

export type SingleStoreCredentials = TypeOf<typeof singlestoreCredentials>;

export const printCliConnectionIssues = (options: any) => {
	const { uri, host, database } = options || {};

	if (!uri && (!host || !database)) {
		console.log(outputs.singlestore.connection.required());
	}
};

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if ('url' in options) {
		let text = `Please provide required params for SingleStore driver:\n`;
		console.log(error(text));
		console.log(wrapParam('url', options.url, false, 'url'));
		process.exit(1);
	}

	let text = `Please provide required params for SingleStore driver:\n`;
	console.log(error(text));
	console.log(wrapParam('host', options.host));
	console.log(wrapParam('port', options.port, true));
	console.log(wrapParam('user', options.user, true));
	console.log(wrapParam('password', options.password, true, 'secret'));
	console.log(wrapParam('database', options.database));
	console.log(wrapParam('ssl', options.ssl, true));
	process.exit(1);
};
