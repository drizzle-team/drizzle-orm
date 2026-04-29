import type { TypeOf } from 'zod';
import { coerce, literal, object, string, undefined as undefinedType, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
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
	}).transform<undefined>((): undefined => {}),
]);

export type GelCredentials = TypeOf<typeof gelCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
): never => {
	if ('url' in options) {
		let text = `Please provide required params for Gel driver:\n`;
		throw new ConfigConnectionCliError(
			'gel',
			['url'],
			[
				error(text),
				wrapParam('url', options.url, false, 'url'),
			].join('\n'),
		);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for Gel driver:\n`;
		throw new ConfigConnectionCliError(
			'gel',
			['host', 'database'],
			[
				error(text),
				wrapParam('host', options.host),
				wrapParam('port', options.port, true),
				wrapParam('user', options.user, true),
				wrapParam('password', options.password, true, 'secret'),
				wrapParam('database', options.database),
				wrapParam('tlsSecurity', options.tlsSecurity, true),
			].join('\n'),
		);
	}

	throw new ConfigConnectionCliError(
		'gel',
		['url', 'host', 'database'],
		error(
			`Either connection "url" or "host", "database" are required for Gel database connection`,
		),
	);
};
