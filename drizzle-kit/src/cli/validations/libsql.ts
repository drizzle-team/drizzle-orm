import type { TypeOf } from 'zod';
import { object, string } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { wrapParam } from './common';

export const libSQLCredentials = object({
	url: string().min(1),
	authToken: string().min(1).optional(),
});

export type LibSQLCredentials = {
	url: string;
	authToken?: string;
};

const _: LibSQLCredentials = {} as TypeOf<typeof libSQLCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
	_command: 'generate' | 'migrate' | 'push' | 'pull' | 'studio',
): never => {
	let text = `Please provide required params for 'turso' dialect:\n`;
	throw new ConfigConnectionCliError(
		'turso',
		['url'],
		[
			error(text),
			wrapParam('url', options.url),
			wrapParam('authToken', options.authToken, true, 'secret'),
		].join('\n'),
		_command,
	);
};
