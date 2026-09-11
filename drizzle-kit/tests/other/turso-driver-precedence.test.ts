import { expect, test } from 'vitest';
import { pickTursoDriver } from '../../src/cli/turso-driver';

const REMOTE = true;
const LOCAL = false;

const installed = (...pkgs: string[]) => async (pkg: string) => pkgs.includes(pkg);

test('remote: current-generation SDK wins over a resolvable @libsql/client', async () => {
	// The regression in #6163: a stale transitive '@libsql/client' was picked over the
	// SDK the project actually depends on, failing `turso://` with URL_SCHEME_NOT_SUPPORTED.
	await expect(pickTursoDriver(REMOTE, installed('@libsql/client', '@tursodatabase/serverless')))
		.resolves.toBe('@tursodatabase/serverless');
});

test('remote: falls back to @libsql/client when no current-generation SDK is installed', async () => {
	await expect(pickTursoDriver(REMOTE, installed('@libsql/client')))
		.resolves.toBe('@libsql/client');
});

test('remote: local-only @tursodatabase/database never wins, @libsql/client still serves', async () => {
	await expect(pickTursoDriver(REMOTE, installed('@libsql/client', '@tursodatabase/database')))
		.resolves.toBe('@libsql/client');
});

test('remote: local-only @tursodatabase/database alone resolves to no driver', async () => {
	await expect(pickTursoDriver(REMOTE, installed('@tursodatabase/database')))
		.resolves.toBeUndefined();
});

test('local: dedicated local driver keeps its preference over the serverless SDK', async () => {
	await expect(pickTursoDriver(LOCAL, installed('@tursodatabase/serverless', '@tursodatabase/database')))
		.resolves.toBe('@tursodatabase/database');
});

test('local: serverless SDK is used when the local driver is absent', async () => {
	await expect(pickTursoDriver(LOCAL, installed('@libsql/client', '@tursodatabase/serverless')))
		.resolves.toBe('@tursodatabase/serverless');
});

test('no driver installed resolves to undefined for both remote and local', async () => {
	await expect(pickTursoDriver(REMOTE, installed())).resolves.toBeUndefined();
	await expect(pickTursoDriver(LOCAL, installed())).resolves.toBeUndefined();
});
