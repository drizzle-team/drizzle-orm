import { object, string, type TypeOf, undefined as undefinedType } from 'zod';
import { error } from '../views';
import { wrapParam } from './common';

export const duckdbCredentials = object({
	driver: undefinedType(),
	url: string().min(1),
}).transform<{ url: string }>((o) => {
	delete o.driver;
	return o;
});

export type DuckDbCredentials = TypeOf<typeof duckdbCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	const text = `Please provide required params:\n`;
	console.log(error(text));
	console.log(wrapParam('url', options.url));
	process.exit(1);
};
