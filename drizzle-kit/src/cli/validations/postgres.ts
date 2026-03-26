import type { TypeOf } from 'zod';
import { boolean, coerce, literal, object, string, undefined as zUndefined, union } from 'zod';
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
	object({
		driver: literal('aws-dsql'),
		host: string().min(1),
		database: string().min(1).optional().default('postgres'),
		user: string().min(1).optional().default('admin'),
		region: string().min(1).optional(),
		profile: string().min(1).optional(),
		tokenDurationSecs: coerce.number().optional(),
	}),
]);

export type PostgresCredentials = TypeOf<typeof postgresCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
) => {
	if (options.driver === 'aws-data-api') {
		let text = `Please provide required params for AWS Data API driver:\n`;
		console.log(error(text));
		console.log(wrapParam('database', options.database));
		console.log(wrapParam('secretArn', options.secretArn, false, 'secret'));
		console.log(wrapParam('resourceArn', options.resourceArn, false, 'secret'));
		process.exit(1);
	}

	if (options.driver === 'aws-dsql') {
		let text = `Please provide required params for AWS DSQL driver:\n`;
		console.log(error(text));
		console.log(wrapParam('host', options.host));
		console.log(wrapParam('database', options.database, true));
		console.log(wrapParam('user', options.user, true));
		console.log(wrapParam('region', options.region, true));
		console.log(wrapParam('profile', options.profile, true));
		process.exit(1);
	}

	if ('url' in options) {
		let text = `Please provide required params for Postgres driver:\n`;
		console.log(error(text));
		console.log(wrapParam('url', options.url, false, 'url'));
		process.exit(1);
	}

	if ('host' in options || 'database' in options) {
		let text = `Please provide required params for Postgres driver:\n`;
		console.log(error(text));
		console.log(wrapParam('host', options.host));
		console.log(wrapParam('port', options.port, true));
		console.log(wrapParam('user', options.user, true));
		console.log(wrapParam('password', options.password, true, 'secret'));
		console.log(wrapParam('database', options.database));
		console.log(wrapParam('ssl', options.ssl, true));
		process.exit(1);
	}

	console.log(
		error(
			`Either connection "url" or "host", "database" are required for PostgreSQL database connection`,
		),
	);
	process.exit(1);
};
