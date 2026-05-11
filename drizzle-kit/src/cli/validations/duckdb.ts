import { object, string, type TypeOf, undefined as undefinedType } from 'zod';
import { ConfigConnectionCliError } from '../errors';
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
): never => {
	const text = `Please provide required params:\n`;
	throw new ConfigConnectionCliError(
		'duckdb',
		['url'],
		[
			error(text),
			wrapParam('url', options.url),
		].join('\n'),
	);
};
