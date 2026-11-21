import Docker from 'dockerode';
import getPort from 'get-port';
import Firebird from 'node-firebird';
import type { FirebirdCredentials } from 'src/cli/validations/firebird';
import { v4 as uuid } from 'uuid';

export interface FirebirdTestDatabase {
	credentials: FirebirdCredentials;
	client: Firebird.Database;
	query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;
	stop(): Promise<void>;
}

export async function createFirebirdTestDatabase(): Promise<FirebirdTestDatabase> {
	const docker = new Docker();
	const image = process.env['FIREBIRD_TEST_IMAGE']?.trim() || 'ghcr.io/fdcastel/firebird:latest';
	const port = await getPort({ port: 3050 });

	const pullStream = await docker.pull(image);
	await new Promise((resolve, reject) =>
		docker.modem.followProgress(pullStream, (error) => error ? reject(error) : resolve(undefined))
	);

	const container = await docker.createContainer({
		Image: image,
		Env: [
			'FIREBIRD_ROOT_PASSWORD=masterkey',
			'FIREBIRD_USER=SYSDBA',
			'FIREBIRD_PASSWORD=masterkey',
			'FIREBIRD_DATABASE=drizzle.fdb',
			'FIREBIRD_DATABASE_DEFAULT_CHARSET=UTF8',
		],
		name: `drizzle-kit-tests-firebird-${uuid()}`,
		HostConfig: {
			AutoRemove: true,
			PortBindings: {
				'3050/tcp': [{ HostPort: String(port) }],
			},
		},
	});
	await container.start();

	const credentials = {
		host: '127.0.0.1',
		port,
		database: '/var/lib/firebird/data/drizzle.fdb',
		user: 'SYSDBA',
		password: 'masterkey',
	};
	const client = await attachWithRetry(credentials);

	return {
		credentials,
		client,
		query<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
			return queryFirebird<T>(client, sql, params);
		},
		async stop() {
			await detach(client);
			await container.stop().catch((error) => {
				if ((error as { statusCode?: number }).statusCode !== 304) {
					throw error;
				}
			});
		},
	};
}

export async function cleanupFirebirdKitObjects(db: FirebirdTestDatabase) {
	await tryQuery(db, 'drop view "KIT_GENERATE_USER_NAMES"');
	await tryQuery(db, 'drop view "KIT_PULL_USER_NAMES"');
	await tryQuery(db, 'drop view "KIT_STUDIO_USER_NAMES"');
	await tryQuery(db, 'drop table "KIT_GENERATE_POSTS"');
	await tryQuery(db, 'drop table "KIT_GENERATE_USERS"');
	await tryQuery(db, 'drop table "KIT_PULL_POSTS"');
	await tryQuery(db, 'drop table "KIT_PULL_USERS"');
	await tryQuery(db, 'drop table "KIT_PUSH_POSTS"');
	await tryQuery(db, 'drop table "KIT_PUSH_USERS"');
	await tryQuery(db, 'drop table "KIT_STUDIO_USERS"');
	await tryQuery(db, 'drop table "__drizzle_migrations"');
}

export async function tryQuery(db: FirebirdTestDatabase, sql: string) {
	try {
		await db.query(sql);
	} catch {
		// Firebird does not support IF EXISTS for the DDL used by these tests.
	}
}

async function attachWithRetry(options: Firebird.Options): Promise<Firebird.Database> {
	let lastError: unknown;
	for (let attempt = 0; attempt < 60; attempt++) {
		try {
			return await attach(options);
		} catch (error) {
			lastError = error;
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}

	throw lastError;
}

function attach(options: Firebird.Options, timeoutMs = 2000): Promise<Firebird.Database> {
	return new Promise((resolve, reject) => {
		let settled = false;
		const timeout = setTimeout(() => {
			settled = true;
			reject(new Error(`Timed out connecting to Firebird after ${timeoutMs}ms`));
		}, timeoutMs);

		Firebird.attach(options, (error, database) => {
			if (settled) {
				database?.detach(() => undefined);
				return;
			}

			settled = true;
			clearTimeout(timeout);
			error ? reject(error) : resolve(database);
		});
	});
}

function queryFirebird<T>(client: Firebird.Database, sql: string, params: unknown[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => {
		client.query(sql, params, (error, rows) => error ? reject(error) : resolve(rows as T[]));
	});
}

function detach(database: Firebird.Database): Promise<void> {
	return new Promise((resolve) => database.detach(() => resolve()));
}
