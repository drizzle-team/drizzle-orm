export const composeHint = (service: string) =>
	`Bring DBs up with \`bash compose/dockers.sh up ${service}\` and export the connection string before running tests.`;

function missing(name: string, hint: string | undefined): Error {
	return new Error(hint ? `${name} is not set. ${hint}` : `${name} is not set.`);
}

export function requireEnv(name: string, hint?: string): string {
	const value = process.env[name];
	if (!value) throw missing(name, hint);
	return value;
}

// Outside CI a missing variable returns undefined, so the caller can skip its tests.
// CI must run every test, so there a missing variable fails the run.
export function optionalEnv(name: string, hint?: string): string | undefined {
	const value = process.env[name];
	if (!value && process.env['CI']) throw missing(name, hint);
	return value || undefined;
}

// Calls `attempt` until it resolves, waiting `interval` ms after each failure.
// After `timeout` ms of failures, it throws the last error.
export async function retry<T>(attempt: () => Promise<T>, options: { interval: number; timeout: number }): Promise<T> {
	let timeLeft = options.timeout;
	while (true) {
		try {
			return await attempt();
		} catch (error) {
			timeLeft -= options.interval;
			if (timeLeft <= 0) throw error;
			await new Promise((resolve) => setTimeout(resolve, options.interval));
		}
	}
}

// Hands out one item at a time. `release` returns the item; a caller waits while all items are taken.
export function createProvider<T extends object>(items: T[]): () => Promise<T & { release: () => void }> {
	return async () => {
		while (true) {
			const item = items.shift();
			if (!item) {
				await new Promise((resolve) => setTimeout(resolve, 50));
				continue;
			}
			return { ...item, release: () => items.push(item) };
		}
	};
}

export function parseMssqlUrl(urlString: string) {
	const url = new URL(urlString);
	return {
		user: url.username,
		password: url.password,
		server: url.hostname,
		port: Number.parseInt(url.port, 10),
		database: url.pathname.replace(/^\//, ''),
		options: {
			encrypt: url.searchParams.get('encrypt') === 'true',
			trustServerCertificate: url.searchParams.get('trustServerCertificate') === 'true',
		},
	};
}

// eslint-disable-next-line @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars
export function Expect<T extends true>() {}

export type Equal<X, Y extends X> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true
	: false;
