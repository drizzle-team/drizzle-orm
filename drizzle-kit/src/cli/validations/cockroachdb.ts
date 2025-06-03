import { boolean, coerce, literal, object, string, TypeOf, undefined, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

export const cockroachdbCredentials = union([
	object({
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		password: string().min(1).optional(),
		database: string().min(1),
		// TODO update ssl params
		ssl: union([
			literal('require'),
			literal('allow'),
			literal('prefer'),
			literal('verify-full'),
			boolean(),
			object({}).passthrough(),
		]).optional(),
	}),
	object({
		url: string().min(1),
	}),
]);

export type CockroachDbCredentials = TypeOf<typeof cockroachdbCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if ('url' in options) {
		let text = `Please provide required params for CockroachDb driver:\n`;
		console.log(error(text));
		console.log(wrapParam('url', options.url, false, 'url'));
		process.exit(1);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for CockroachDb driver:\n`;
		console.log(error(text));
		console.log(wrapParam('host', options.host));
		console.log(wrapParam('port', options.port, true));
		console.log(wrapParam('user', options.user, true));
		console.log(wrapParam('password', options.password, true, 'secret'));
		console.log(wrapParam('database', options.database));
		console.log(wrapParam('ssl', options.ssl, true));
		process.exit(1);
	}

	console.log(
		error(
			`Either connection "url" or "host", "database" are required for CockroachDb connection`,
		),
	);
	process.exit(1);
};
