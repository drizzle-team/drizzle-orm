import { coerce, object, string, TypeOf } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

export const firebirdCredentials = object({
	host: string().min(1),
	port: coerce.number().min(1).optional(),
	user: string().min(1).optional(),
	password: string().min(1).optional(),
	database: string().min(1),
	role: string().min(1).optional(),
	pageSize: coerce.number().min(1).optional(),
});

export type FirebirdCredentials = TypeOf<typeof firebirdCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	const text = `Please provide required params for Firebird driver:\n`;
	console.log(error(text));
	console.log(wrapParam('host', options.host));
	console.log(wrapParam('port', options.port, true));
	console.log(wrapParam('user', options.user, true));
	console.log(wrapParam('password', options.password, true, 'secret'));
	console.log(wrapParam('database', options.database));
	process.exit(1);
};
