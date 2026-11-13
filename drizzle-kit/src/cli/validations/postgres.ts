import type { PGlite } from '@electric-sql/pglite';
import type { ConnectionOptions } from 'tls';
import type { TypeOf } from 'zod';
import { boolean, coerce, custom, literal, object, string, undefined as zUndefined, union } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { awsDataApiDriver, dsqlDriver, pgliteDriver, warnOnUrlConflict, wrapParam } from './common';

const pgSsl = union([
	literal('require'),
	literal('allow'),
	literal('prefer'),
	literal('verify-full'),
	boolean(),
	// same as object({}).passthrough(), but just for types
	custom<ConnectionOptions>((ssl) => typeof ssl === 'object' && ssl !== null && !Array.isArray(ssl)),
]);

export const dsqlCredentials = union([
	object({
		url: string().min(1),
	}),
	object({
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		database: string().min(1),
		ssl: pgSsl.optional(),
	}),
]).and(object({
	// specify custom profile
	profile: string().optional(),
	// specify custom region
	region: string().optional(),
	// specify custom creds
	customCredentialsProvider: object({
		accessKeyId: string(),
		secretAccessKey: string(),
		sessionToken: string().optional(),
		credentialScope: string().optional(),
		accountId: string().optional(),
	}).optional(),
}));

export const pgDefaultCredentials = union([
	// "url" goes first: when it's provided along with individual params, it wins
	object({ url: string().min(1) }),
	object({
		host: string().min(1),
		port: coerce.number().min(1).optional(),
		user: string().min(1).optional(),
		password: string().min(1).optional(),
		database: string().min(1),
		ssl: pgSsl.optional(),
	}),
]);

export const awsDataApiCredentials = object({
	database: string().min(1),
	secretArn: string().min(1),
	resourceArn: string().min(1),
});

export const pgLiteCredentials = object({ url: string().min(1) });
export const pgLiteClientCredentials = object({
	client: custom<PGlite>((client) => typeof client === 'object' && client !== null),
});

export const postgresCredentials = union([
	object({
		driver: zUndefined(),
	}).and(pgDefaultCredentials).transform((o) => {
		delete o.driver;
		return o;
	}),
	object({ driver: awsDataApiDriver }).and(awsDataApiCredentials),
	object({ driver: pgliteDriver }).and(union([pgLiteCredentials, pgLiteClientCredentials])),
	object({ driver: dsqlDriver }).and(dsqlCredentials),
]);

export type PostgresCredentials = TypeOf<typeof postgresCredentials>;

export const warnOnConflictingCredentials = (options: Record<string, unknown>) =>
	warnOnUrlConflict(options, ['host', 'port', 'user', 'password', 'database', 'ssl']);

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

	if (options.driver === 'pglite') {
		throw new ConfigConnectionCliError(
			'pglite',
			['url', 'client'],
			error(
				`Please provide either "url" or "client" for PGlite driver`,
			),
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
