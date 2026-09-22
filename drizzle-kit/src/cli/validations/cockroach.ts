import type { TypeOf } from 'zod';
import { boolean, coerce, literal, object, string, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { warnOnUrlConflict, wrapParam } from './common';

export const cockroachCredentials = union([
	// "url" goes first: when it's provided along with individual params, it wins
	object({
		url: string().min(1),
	}),
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
]);

export type CockroachCredentials = TypeOf<typeof cockroachCredentials>;

export const warnOnConflictingCredentials = (options: Record<string, unknown>) =>
	warnOnUrlConflict(options, ['host', 'port', 'user', 'password', 'database', 'ssl']);

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
): never => {
	if ('url' in options) {
		let text = `Please provide required params for Cockroach dialect:\n`;
		throw new ConfigConnectionCliError(
			'cockroach',
			['url'],
			[
				error(text),
				wrapParam('url', options.url, false, 'url'),
			].join('\n'),
		);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for Cockroach dialect:\n`;
		throw new ConfigConnectionCliError(
			'cockroach',
			['host', 'database', 'user', 'server'],
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
	}

	throw new ConfigConnectionCliError(
		'cockroach',
		['url', 'host', 'database', 'user', 'server'],
		error(
			`Either connection "url" or "host", "database", "user", "server" are required for Cockroach connection`,
		),
	);
};
