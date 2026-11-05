import { resolve } from 'path';
import { expect, test } from 'vitest';
import { loadModule } from '../../src/utils/utils-node';

test('loadModule resolves tsconfig paths', async () => {
	const modulePath = resolve('tests/fixtures/tsconfig-paths/entry.ts');
	const mod = await loadModule<{ profile?: unknown; user?: unknown }>(modulePath);

	expect(mod.profile).toBeDefined();
	expect(mod.user).toBeDefined();
});

test('loadModule resolves a catch-all "*" tsconfig paths mapping', async () => {
	const modulePath = resolve('tests/fixtures/tsconfig-paths-catch-all/entry.ts');
	const mod = await loadModule<{ config?: { url: string } }>(modulePath);

	expect(mod.config?.url).toBe('postgres://localhost/db');
});

test('loadModule resolves tsconfig paths from an extended config in another directory', async () => {
	const modulePath = resolve('tests/fixtures/tsconfig-paths-extends/packages/foo/src/schema/a.ts');
	const mod = await loadModule<{ b?: string }>(modulePath);

	expect(mod.b).toBe('b');
});
