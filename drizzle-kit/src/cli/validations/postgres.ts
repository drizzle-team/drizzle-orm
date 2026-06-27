import type { TypeOf } from 'zod';
import { boolean, coerce, literal, object, string, undefined as zUndefined, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { wrapParam } from './common';

export const postgresCredentials = union([
	object({
		driver: zUndefined(),
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		password: string().min(1).optional(),
		database: string().min(1),
		ssl: union([
			literal('require'),
			literal('allow'),
			literal('prefer'),
			literal('verify-full'),
			boolean(),
			object({}).passthrough(),
		]).optional(),
	}).transform((o) => {
		delete o.driver;
		return o as Omit<typeof o, 'driver'>;
	}),
	object({
		driver: zUndefined(),
		url: string().min(1),
	}).transform<{ url: string }>((o) => {
		delete o.driver;
		return o;
	}),
	object({
		driver: literal('aws-data-api'),
		database: string().min(1),
		secretArn: string().min(1),
		resourceArn: string().min(1),
	}),
	object({
		driver: literal('pglite'),
		url: string().min(1),
	}),
]);

export type PostgresCredentials = TypeOf<typeof postgresCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
): never => {
	if (options.driver === 'aws-data-api') {
		let text = `Please provide required params for AWS Data API driver:\n`;
		throw new ConfigConnectionCliError(
			'aws-data-api',
			['database', 'secretArn', 'resourceArn'],
			[
				error(text),
				wrapParam('database', options.database),
				wrapParam('secretArn', options.secretArn, false, 'secret'),
				wrapParam('resourceArn', options.resourceArn, false, 'secret'),
			].join('\n'),
		);
	}

	if ('url' in options) {
		let text = `Please provide required params for Postgres driver:\n`;
		throw new ConfigConnectionCliError(
			'postgresql',
			['url'],
			[
				error(text),
				wrapParam('url', options.url, false, 'url'),
			].join('\n'),
		);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for Postgres driver:\n`;
		throw new ConfigConnectionCliError(
			'postgresql',
			['host', 'database'],
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
		'postgresql',
		['url', 'host', 'database'],
		error(
			`Either connection "url" or "host", "database" are required for PostgreSQL database connection`,
		),
	);
};
