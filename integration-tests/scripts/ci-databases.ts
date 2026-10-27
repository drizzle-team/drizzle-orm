// Gives one CI job its own databases on the hosted services, so that parallel runs of different pull
// requests never share tables.
//
//   tsx scripts/ci-databases.ts create --job <shard> <provider...>
//   tsx scripts/ci-databases.ts drop
//   tsx scripts/ci-databases.ts sweep <provider...>
//
// `create` writes the new connection settings to $RUNNER_TEMP/ci-databases.env, which the test step
// sources. `drop` deletes what `create` made in the same job. `sweep` deletes every database or branch
// that a job made more than one day ago, for jobs that ended before their `drop` step ran.
import { Database as SqliteCloudDatabase } from '@sqlitecloud/drivers';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import pg from 'pg';

const providerNames = ['neon', 'netlify', 'planetscale', 'sqlitecloud', 'turso'] as const;
type ProviderName = typeof providerNames[number];

interface CreatedResource {
	provider: ProviderName;
	name: string;
	// The SQLite Cloud server, as an index into SQLITE_MANY_CLOUD_CONNECTION_STRING.
	server?: number;
}

interface Provider {
	// The variable that holds the shared connection string. Without it the provider is skipped.
	source: string;
	// Variables that the provider needs on top of `source`.
	credentials: string[];
	create(prefix: string, created: CreatedResource[]): Promise<Record<string, string>>;
	drop(resource: CreatedResource): Promise<void>;
	sweep(now: number): Promise<string[]>;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const tempDir = process.env['RUNNER_TEMP'] ?? '/tmp';
const envFile = join(tempDir, 'ci-databases.env');
const stateFile = join(tempDir, 'ci-databases.json');

const env = (name: string) => {
	const value = process.env[name];
	if (!value) throw new Error(`${name} is not set.`);
	return value;
};

// The time in the name lets `sweep` find old resources without a creation date from the provider.
const jobPrefix = (job: string) => {
	const time = Math.floor(Date.now() / 1000).toString(36);
	const run = `${process.env['GITHUB_RUN_ID'] ?? 'local'}_${process.env['GITHUB_RUN_ATTEMPT'] ?? '1'}`;
	const slug = job.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
	return `ci_${time}_${run}_${slug}_`;
};

// Turso database names and PlanetScale branch names allow only lowercase letters, digits and dashes.
const dashed = (prefix: string) => prefix.replaceAll('_', '-').replace(/-+$/, '');

const isExpired = (name: string, now: number) => {
	const match = /^ci[_-]([0-9a-z]+)[_-]/.exec(name);
	return match !== null && Number.parseInt(match[1]!, 36) * 1000 < now - DAY_MS;
};

const quoteIdentifier = (name: string) => `"${name.replaceAll('"', '""')}"`;

const withPostgres = async <T>(connectionString: string, fn: (client: pg.Client) => Promise<T>) => {
	const client = new pg.Client({ connectionString });
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end();
	}
};

// The names match the databases that tests/pg/instrumentation.ts opens. A database named after the
// provider replaces the database of the connection string itself, which some tests use as it is. The
// names of two providers must differ, because both connection strings can lead to one server.
const postgresProvider = (provider: ProviderName, source: string, names: string[]): Provider => ({
	source,
	credentials: [],
	async create(prefix, created) {
		await withPostgres(env(source), async (client) => {
			for (const name of [provider, ...names]) {
				await client.query(`CREATE DATABASE ${quoteIdentifier(prefix + name)}`);
				created.push({ provider, name: prefix + name });
				saveState(created);
			}
		});
		const url = new URL(env(source));
		url.pathname = `/${prefix}${provider}`;
		return { CI_DATABASE_PREFIX: prefix, [source]: url.toString() };
	},
	async drop(resource) {
		await withPostgres(env(source), async (client) => {
			await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(resource.name)} WITH (FORCE)`);
		});
	},
	async sweep(now) {
		return await withPostgres(env(source), async (client) => {
			const { rows } = await client.query<{ datname: string }>(
				`SELECT datname FROM pg_database WHERE datname LIKE 'ci\\_%'`,
			);
			const expired = rows.map((row) => row.datname).filter((name) => isExpired(name, now));
			for (const name of expired) {
				await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(name)} WITH (FORCE)`);
			}
			return expired;
		});
	},
});

const sqliteCloudServers = () =>
	env('SQLITE_MANY_CLOUD_CONNECTION_STRING').split(';').filter((uri) => uri !== '').map((uri) => new URL(uri));

const withSqliteCloud = async <T>(server: URL, fn: (db: SqliteCloudDatabase) => Promise<T>) => {
	const url = new URL(server);
	url.pathname = '';
	const db = new SqliteCloudDatabase(url.toString());
	try {
		return await fn(db);
	} finally {
		db.close();
	}
};

const sqliteCloud: Provider = {
	source: 'SQLITE_MANY_CLOUD_CONNECTION_STRING',
	credentials: [],
	async create(prefix, created) {
		const servers = sqliteCloudServers();
		for (const [index, server] of servers.entries()) {
			const name = prefix + decodeURIComponent(server.pathname.slice(1));
			await withSqliteCloud(server, (db) => db.sql(`CREATE DATABASE ${name} IF NOT EXISTS`));
			created.push({ provider: 'sqlitecloud', name, server: index });
			saveState(created);
			server.pathname = `/${name}`;
		}
		return { SQLITE_MANY_CLOUD_CONNECTION_STRING: servers.map((server) => server.toString()).join(';') };
	},
	async drop(resource) {
		const server = sqliteCloudServers()[resource.server!]!;
		await withSqliteCloud(server, (db) => db.sql(`REMOVE DATABASE ${resource.name} IF EXISTS`));
	},
	async sweep(now) {
		const removed: string[] = [];
		const seen = new Set<string>();
		for (const server of sqliteCloudServers()) {
			if (seen.has(server.host)) continue;
			seen.add(server.host);
			await withSqliteCloud(server, async (db) => {
				const rows = (await db.sql('LIST DATABASES')) as { name: string }[];
				for (const { name } of rows) {
					if (!isExpired(name, now)) continue;
					await db.sql(`REMOVE DATABASE ${name} IF EXISTS`);
					removed.push(name);
				}
			});
		}
		return removed;
	},
};

const requestJson = async (service: string, url: string, authorization: string, init: RequestInit = {}) => {
	const response = await fetch(url, {
		...init,
		headers: { Authorization: authorization, 'Content-Type': 'application/json' },
	});
	if (!response.ok) {
		throw new Error(
			`The ${service} API returned ${response.status} for ${init.method ?? 'GET'} ${url}: ${await response.text()}`,
		);
	}
	return response.status === 204 ? undefined : await response.json();
};

const turso = (path: string, init?: RequestInit) =>
	requestJson(
		'Turso',
		`https://api.turso.tech/v1/organizations/${env('TURSO_ORG')}${path}`,
		`Bearer ${env('TURSO_API_TOKEN')}`,
		init,
	);

const tursoProvider: Provider = {
	source: 'TURSODATABASE_REMOTE_URL',
	credentials: ['TURSO_API_TOKEN', 'TURSO_ORG'],
	// The tests take lists separated by `;` and pair each URL with the token at the same position.
	async create(prefix, created) {
		const group = process.env['TURSO_GROUP'] || 'default';
		const urls: string[] = [];
		const tokens: string[] = [];
		const entries = env('TURSODATABASE_REMOTE_URL').split(';').filter((uri) => uri !== '');
		for (const [index, entry] of entries.entries()) {
			const name = `${dashed(prefix)}-${index + 1}`;
			const { database } = await turso('/databases', { method: 'POST', body: JSON.stringify({ name, group }) });
			created.push({ provider: 'turso', name });
			saveState(created);
			const { jwt } = await turso(`/databases/${name}/auth/tokens?expiration=1d&authorization=full-access`, {
				method: 'POST',
			});
			const url = new URL(entry);
			url.hostname = database.Hostname;
			urls.push(url.toString());
			tokens.push(jwt);
		}
		return { TURSODATABASE_REMOTE_URL: urls.join(';'), TURSODATABASE_REMOTE_TOKEN: tokens.join(';') };
	},
	async drop(resource) {
		await turso(`/databases/${resource.name}`, { method: 'DELETE' });
	},
	async sweep(now) {
		const { databases } = await turso('/databases') as { databases: { Name: string }[] };
		const expired = databases.map((database) => database.Name).filter((name) => isExpired(name, now));
		for (const name of expired) await turso(`/databases/${name}`, { method: 'DELETE' });
		return expired;
	},
};

const planetscaleDatabase = () =>
	process.env['PLANETSCALE_DATABASE'] || new URL(env('PLANETSCALE_CONNECTION_STRING')).pathname.slice(1);

const planetscale = (path: string, init?: RequestInit) =>
	requestJson(
		'PlanetScale',
		`https://api.planetscale.com/v1/organizations/${env('PLANETSCALE_ORG')}/databases/${planetscaleDatabase()}${path}`,
		`${env('PLANETSCALE_SERVICE_TOKEN_ID')}:${env('PLANETSCALE_SERVICE_TOKEN')}`,
		init,
	);

const planetscaleProvider: Provider = {
	source: 'PLANETSCALE_CONNECTION_STRING',
	credentials: ['PLANETSCALE_ORG', 'PLANETSCALE_SERVICE_TOKEN_ID', 'PLANETSCALE_SERVICE_TOKEN'],
	async create(prefix, created) {
		const name = dashed(prefix);
		const parent = process.env['PLANETSCALE_PARENT_BRANCH'] || 'main';
		await planetscale('/branches', { method: 'POST', body: JSON.stringify({ name, parent_branch: parent }) });
		created.push({ provider: 'planetscale', name });
		saveState(created);
		const deadline = Date.now() + 15 * 60 * 1000;
		while (!(await planetscale(`/branches/${name}`)).ready) {
			if (Date.now() > deadline) throw new Error(`The PlanetScale branch ${name} was not ready after 15 minutes.`);
			await new Promise((resolve) => setTimeout(resolve, 5000));
		}
		const password = await planetscale(`/branches/${name}/passwords`, {
			method: 'POST',
			body: JSON.stringify({ name, role: 'admin', ttl: 6 * 60 * 60 }),
		});
		const url = new URL(env('PLANETSCALE_CONNECTION_STRING'));
		url.username = password.username;
		url.password = password.plain_text;
		url.hostname = password.access_host_url;
		return { PLANETSCALE_CONNECTION_STRING: url.toString() };
	},
	async drop(resource) {
		await planetscale(`/branches/${resource.name}`, { method: 'DELETE' });
	},
	async sweep(now) {
		const { data } = await planetscale('/branches?per_page=100') as { data: { name: string }[] };
		const expired = data.map((branch) => branch.name).filter((name) => isExpired(name, now));
		for (const name of expired) await planetscale(`/branches/${name}`, { method: 'DELETE' });
		return expired;
	},
};

const providers: Record<ProviderName, Provider> = {
	neon: postgresProvider('neon', 'NEON_CONNECTION_STRING', [
		'db0',
		'db1',
		'db2',
		'db3',
		'db4',
		'db5',
		'db6',
		'db7',
		'db8',
		'db9',
	]),
	netlify: postgresProvider('netlify', 'NETLIFY_DB_URL', ['db10', 'db11', 'db12', 'db13', 'db14']),
	planetscale: planetscaleProvider,
	sqlitecloud: sqliteCloud,
	turso: tursoProvider,
};

const saveState = (created: CreatedResource[]) => writeFileSync(stateFile, JSON.stringify(created));

const shellQuote = (value: string) => `'${value.replaceAll("'", `'\\''`)}'`;

// A provider without its shared connection string or its API credentials keeps the shared database.
const usableProviders = (names: string[]) => {
	const usable: ProviderName[] = [];
	for (const name of names) {
		if (!providerNames.includes(name as ProviderName)) throw new Error(`Unknown provider: ${name}`);
		const provider = providers[name as ProviderName];
		const missing = [provider.source, ...provider.credentials].filter((variable) => !process.env[variable]);
		if (missing.length > 0) {
			console.log(`::warning::${name} uses the shared database, because ${missing.join(', ')} is not set.`);
			continue;
		}
		usable.push(name as ProviderName);
	}
	return usable;
};

const create = async (job: string, names: string[]) => {
	const prefix = jobPrefix(job);
	const created: CreatedResource[] = [];
	const settings: Record<string, string> = {};
	for (const name of usableProviders(names)) {
		Object.assign(settings, await providers[name].create(prefix, created));
		console.log(`Created the ${name} databases with prefix ${prefix}.`);
	}
	for (const [key, value] of Object.entries(settings)) {
		if (key !== 'CI_DATABASE_PREFIX') console.log(`::add-mask::${value}`);
	}
	const lines = Object.entries(settings).map(([key, value]) => `export ${key}=${shellQuote(value)}`);
	writeFileSync(envFile, lines.join('\n') + '\n');
};

const drop = async () => {
	if (!existsSync(stateFile)) return;
	const created = JSON.parse(readFileSync(stateFile, 'utf8')) as CreatedResource[];
	let failures = 0;
	for (const resource of created.reverse()) {
		try {
			await providers[resource.provider].drop(resource);
			console.log(`Dropped ${resource.provider} ${resource.name}.`);
		} catch (error) {
			failures++;
			console.log(`::warning::${resource.provider} ${resource.name} was not dropped: ${error}`);
		}
	}
	// The sweep deletes what is left, so a failed drop does not fail the job.
	if (failures > 0) console.log(`::warning::${failures} resources are left for the daily sweep.`);
};

const sweep = async (names: string[]) => {
	const now = Date.now();
	let failures = 0;
	for (const name of usableProviders(names)) {
		try {
			const removed = await providers[name].sweep(now);
			console.log(`Swept ${removed.length} ${name} resources${removed.length ? `: ${removed.join(', ')}` : '.'}`);
		} catch (error) {
			failures++;
			console.log(`::error::The ${name} sweep failed: ${error}`);
		}
	}
	if (failures > 0) process.exitCode = 1;
};

const [command, ...args] = process.argv.slice(2);
const jobIndex = args.indexOf('--job');
const job = jobIndex === -1 ? undefined : args.splice(jobIndex, 2)[1];

switch (command) {
	case 'create':
		if (!job) throw new Error('create needs --job <shard>.');
		await create(job, args);
		break;
	case 'drop':
		await drop();
		break;
	case 'sweep':
		await sweep(args);
		break;
	default:
		throw new Error(`Unknown command: ${command}. Use create, drop or sweep.`);
}
