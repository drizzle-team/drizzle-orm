import type { TypeOf } from 'zod';
import { coerce, object, string } from 'zod';
import { ConfigConnectionCliError } from '../errors';
import { error } from '../views';
import { wrapParam } from './common';

/**
 * DSQL credentials schema combining DSQL-specific options with node-postgres Pool options.
 *
 * DSQL-specific options:
 * - host: The DSQL cluster hostname (required)
 * - region: AWS region (auto-detected from hostname if not provided)
 * - profile: IAM profile name (defaults to "default")
 * - tokenDurationSecs: Token expiration time in seconds
 *
 * Standard connection options:
 * - user: Database user (defaults to "admin")
 * - database: Database name (defaults to "postgres")
 * - port: Port number (defaults to 5432)
 *
 * Pool options (node-postgres compatible):
 * - max: Maximum pool size (defaults to 10)
 * - connectionTimeoutMillis: Connection timeout in ms (defaults to 0, no timeout)
 * - idleTimeoutMillis: Idle timeout in ms (defaults to 10000)
 */
export const dsqlCredentials = object({
	// DSQL cluster hostname (required)
	host: string().min(1),

	// AWS-specific options
	region: string().min(1).optional(), // Auto-detected from hostname if not provided
	profile: string().min(1).optional(), // IAM profile name, defaults to "default"
	tokenDurationSecs: coerce.number().min(1).optional(), // Token expiration time

	// Connection options
	user: string().min(1).optional(),
	database: string().min(1).optional(),
	port: coerce.number().min(1).optional(),

	// Pool sizing options
	max: coerce.number().min(1).optional(),
	connectionTimeoutMillis: coerce.number().min(0).optional(),
	idleTimeoutMillis: coerce.number().min(0).optional(),
});

export type DsqlCredentials = TypeOf<typeof dsqlCredentials>;

export const printConfigConnectionIssues = (
	options: Record<string, unknown>,
): never => {
	const text = `Please provide required params for DSQL driver:\n`;
	throw new ConfigConnectionCliError(
		'dsql',
		['host'],
		[
			error(text),
			wrapParam('host', options.host),
			wrapParam('region', options.region, true),
			wrapParam('user', options.user, true),
			wrapParam('database', options.database, true),
			wrapParam('port', options.port, true),
			wrapParam('profile', options.profile, true),
		].join('\n'),
	);
};
