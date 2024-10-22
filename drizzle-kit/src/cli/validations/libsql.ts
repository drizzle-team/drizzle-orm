import { softAssertUnreachable } from 'src/global';
import { object, string, TypeOf } from 'zod';
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
	command: 'generate' | 'migrate' | 'push' | 'pull' | 'studio',
) => {
	let text = `Please provide required params for 'turso' dialect:\n`;
	console.log(error(text));
	console.log(wrapParam('url', options.url));
	console.log(wrapParam('authToken', options.authToken, true, 'secret'));
	process.exit(1);
};
