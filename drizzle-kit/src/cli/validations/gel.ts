import { coerce, literal, object, string, TypeOf, undefined as undefinedType, union } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

export const gelCredentials = union([
	object({
		driver: undefinedType(),
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		password: string().min(1).optional(),
		database: string().min(1),
		tlsSecurity: union([
			literal('insecure'),
			literal('no_host_verification'),
			literal('strict'),
			literal('default'),
		]).optional(),
	}).transform((o) => {
		delete o.driver;
		return o as Omit<typeof o, 'driver'>;
	}),
	object({
		driver: undefinedType(),
		url: string().min(1),
		tlsSecurity: union([
			literal('insecure'),
			literal('no_host_verification'),
			literal('strict'),
			literal('default'),
		]).optional(),
	}).transform<{
		url: string;
		tlsSecurity?:
			| 'insecure'
			| 'no_host_verification'
			| 'strict'
			| 'default';
	}>((o) => {
		delete o.driver;
		return o;
	}),
	object({
		driver: undefinedType(),
	}).transform<undefined>((o) => {
		return undefined;
	}),
]);

export type GelCredentials = TypeOf<typeof gelCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if ('url' in options) {
		let text = `Please provide required params for Gel driver:\n`;
		console.log(error(text));
		console.log(wrapParam('url', options.url, false, 'url'));
		process.exit(1);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for Gel driver:\n`;
		console.log(error(text));
		console.log(wrapParam('host', options.host));
		console.log(wrapParam('port', options.port, true));
		console.log(wrapParam('user', options.user, true));
		console.log(wrapParam('password', options.password, true, 'secret'));
		console.log(wrapParam('database', options.database));
		console.log(wrapParam('tlsSecurity', options.tlsSecurity, true));
		process.exit(1);
	}

	console.log(
		error(
			`Either connection "url" or "host", "database" are required for Gel database connection`,
		),
	);
	process.exit(1);
};
