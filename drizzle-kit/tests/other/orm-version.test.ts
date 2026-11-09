import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { requiredApiVersion } from '../../src/cli/utils';

beforeEach(() => {
	vi.resetModules();
});

afterEach(() => {
	vi.doUnmock('drizzle-orm/version');
});

test('installed drizzle-orm passes the version check', async () => {
	const { assertOrmCoreVersion } = await import('../../src/cli/utils');

	console.log(await assertOrmCoreVersion());
	await expect(assertOrmCoreVersion()).resolves.toBeUndefined();
});

test('older drizzle-orm is reported as orm_too_old', async () => {
	vi.doMock('drizzle-orm/version', () => ({ compatibilityVersion: 10, npmVersion: '0.45.4' }));

	const { assertOrmCoreVersion } = await import('../../src/cli/utils');

	await expect(assertOrmCoreVersion()).rejects.toMatchObject({
		code: 'orm_version_error',
		meta: { kind: 'orm_too_old' },
	});
});

test('newer drizzle-orm is reported as kit_outdated', async () => {
	vi.doMock('drizzle-orm/version', () => ({ compatibilityVersion: requiredApiVersion + 1, npmVersion: '1.0.0' }));
	const { assertOrmCoreVersion } = await import('../../src/cli/utils');

	await expect(assertOrmCoreVersion()).rejects.toMatchObject({
		code: 'orm_version_error',
		meta: { kind: 'kit_outdated' },
	});
});

test('drizzle-orm that cannot be imported is reported as orm_missing', async () => {
	vi.doMock('drizzle-orm/version', () => {
		throw new Error("Cannot find package 'drizzle-orm'");
	});
	const { assertOrmCoreVersion } = await import('../../src/cli/utils');

	await expect(assertOrmCoreVersion()).rejects.toMatchObject({
		code: 'orm_version_error',
		meta: { kind: 'orm_missing' },
	});
});
