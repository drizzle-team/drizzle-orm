import { softAssertUnreachable } from 'src/global';
import { object, string, TypeOf, z } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

const isLocalURL = (url: string) =>
	url.startsWith('http://localhost')
	|| url.startsWith('http://127.0.0.1')
	|| url.startsWith('file:');

export const libSQLCredentials = object({
	url: string().min(1),
	authToken: string().optional(),
}).superRefine((data, ctx) => {
	if (!data.authToken || data.authToken.length === 0) {
		if (!isLocalURL(data.url)) {
			ctx.addIssue({
				code: z.ZodIssueCode.too_small,
				minimum: 1,
				type: 'string',
				inclusive: true,
				path: ['authToken'],
				message: 'authToken is required for remote turso databases',
			});
		}
	}
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
