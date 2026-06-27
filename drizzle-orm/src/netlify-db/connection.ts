import { neon, type NeonQueryFunction } from '@neondatabase/serverless';
import type { NeonHttpClient } from '~/neon-http/session.ts';

/**
 * Reads the current Netlify Database connection string from the environment.
 *
 * Netlify refreshes `NETLIFY_DB_URL` on every function invocation and may rotate
 * the underlying credentials at any time, so this is read on demand (via the
 * refreshing client below) rather than captured once.
 */
export function resolveNetlifyDbUrl(): string {
	const connectionString = process.env['NETLIFY_DB_URL'];
	if (!connectionString) {
		throw new Error(
			'NETLIFY_DB_URL environment variable is not set. '
				+ 'Provide a connection string or client to drizzle().',
		);
	}
	return connectionString;
}

/**
 * Returns a Neon HTTP client that re-resolves the connection string on every
 * query instead of capturing it once at `drizzle()` time.
 */
export function createRefreshingNeonHttpClient(resolve: () => string): NeonHttpClient {
	let cachedConnectionString: string | undefined;
	let cachedClient: NeonQueryFunction<any, any> | undefined;

	const getClient = (): NeonQueryFunction<any, any> => {
		const connectionString = resolve();
		if (connectionString !== cachedConnectionString || cachedClient === undefined) {
			cachedConnectionString = connectionString;
			cachedClient = neon(connectionString);
		}
		return cachedClient;
	};

	// Construct eagerly so drizzle() fails fast and the client is warm.
	getClient();

	const target = function() {} as unknown as NeonHttpClient;
	return new Proxy(target, {
		apply(_target, _thisArg, args: any[]) {
			return (getClient() as any)(...args);
		},
		get(_target, prop) {
			const value = (getClient() as any)[prop];
			// Re-resolve on each call so a captured method reference still uses
			// live credentials; non-function values pass through as-is.
			return typeof value === 'function' ? (...args: any[]) => (getClient() as any)[prop](...args) : value;
		},
	}) as NeonHttpClient;
}
